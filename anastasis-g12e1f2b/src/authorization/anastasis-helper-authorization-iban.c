/*
  This file is part of Anastasis
  Copyright (C) 2016--2021 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU Affero General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with
  Anastasis; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
*/
/**
 * @file anastasis-helper-authorization-iban.c
 * @brief Process that watches for wire transfers to Anastasis bank account
 * @author Christian Grothoff
 */
#include "platform.h"
#include "anastasis_eufin_lib.h"
#include "anastasis_database_lib.h"
#include "anastasis_util_lib.h"
#include <taler/taler_json_lib.h>
#include <gnunet/gnunet_util_lib.h>
#include <jansson.h>
#include <pthread.h>
#include <microhttpd.h>
#include "iban.h"

/**
 * How long to wait for an HTTP reply if there
 * are no transactions pending at the server?
 */
#define LONGPOLL_TIMEOUT GNUNET_TIME_UNIT_HOURS

/**
 * How long to wait between HTTP requests?
 */
#define RETRY_TIMEOUT GNUNET_TIME_UNIT_MINUTES

/**
 * Authentication data needed to access the account.
 */
static struct ANASTASIS_EUFIN_AuthenticationData auth;

/**
 * Bank account IBAN this process is monitoring.
 */
static char *iban;

/**
 * Active request for history.
 */
static struct ANASTASIS_EUFIN_CreditHistoryHandle *hh;

/**
 * Handle to the context for interacting with the bank.
 */
static struct GNUNET_CURL_Context *ctx;

/**
 * What is the last row ID that we have already processed?
 */
static uint64_t latest_row_off;

/**
 * Scheduler context for running the @e ctx.
 */
static struct GNUNET_CURL_RescheduleContext *rc;

/**
 * The configuration (global)
 */
static const struct GNUNET_CONFIGURATION_Handle *cfg;

/**
 * Our DB plugin.
 */
static struct ANASTASIS_DatabasePlugin *db_plugin;

/**
 * How long should we sleep when idle before trying to find more work?
 * Useful in case bank does not support long polling.
 */
static struct GNUNET_TIME_Relative idle_sleep_interval;

/**
 * Value to return from main(). 0 on success, non-zero on
 * on serious errors.
 */
static int global_ret;

/**
 * Run in test-mode, do not background, only import currently
 * pending transactions.
 */
static int test_mode;

/**
 * Current task waiting for execution, if any.
 */
static struct GNUNET_SCHEDULER_Task *task;


#include "iban.c"

/**
 * Extract IBAN from a payto URI.
 *
 * @return NULL on error
 */
static char *
payto_get_iban (const char *payto_uri)
{
  const char *start;
  const char *q;
  const char *bic_end;

  if (0 !=
      strncasecmp (payto_uri,
                   "payto://iban/",
                   strlen ("payto://iban/")))
    return NULL;
  start = &payto_uri[strlen ("payto://iban/")];
  q = strchr (start,
              '?');
  bic_end = strchr (start,
                    '/');
  if ( (NULL != q) &&
       (NULL != bic_end) &&
       (bic_end < q) )
    start = bic_end + 1;
  if ( (NULL == q) &&
       (NULL != bic_end) )
    start = bic_end + 1;
  if (NULL == q)
    return GNUNET_strdup (start);
  return GNUNET_strndup (start,
                         q - start);
}


/**
 * Notify anastasis-http that we received @a amount
 * from @a sender_account_uri with @a code.
 *
 * @param sender_account_uri payto:// URI of the sending account
 * @param code numeric code used in the wire transfer subject
 * @param amount the amount that was wired
 */
static void
notify (const char *sender_account_uri,
        uint64_t code,
        const struct TALER_Amount *amount)
{
  struct IbanEventP ev = {
    .header.type = htons (TALER_DBEVENT_ANASTASIS_AUTH_IBAN_TRANSFER),
    .header.size = htons (sizeof (ev)),
    .code = GNUNET_htonll (code)
  };
  const char *as;
  char *iban;

  iban = payto_get_iban (sender_account_uri);
  GNUNET_log (GNUNET_ERROR_TYPE_INFO,
              "Generating events for code %llu from %s\n",
              (unsigned long long) code,
              iban);
  GNUNET_CRYPTO_hash (iban,
                      strlen (iban),
                      &ev.debit_iban_hash);
  GNUNET_free (iban);
  as = TALER_amount2s (amount);
  db_plugin->event_notify (db_plugin->cls,
                           &ev.header,
                           as,
                           strlen (as));
}


/**
 * We're being aborted with CTRL-C (or SIGTERM). Shut down.
 *
 * @param cls closure
 */
static void
shutdown_task (void *cls)
{
  (void) cls;
  if (NULL != hh)
  {
    ANASTASIS_EUFIN_credit_history_cancel (hh);
    hh = NULL;
  }
  if (NULL != ctx)
  {
    GNUNET_CURL_fini (ctx);
    ctx = NULL;
  }
  if (NULL != rc)
  {
    GNUNET_CURL_gnunet_rc_destroy (rc);
    rc = NULL;
  }
  if (NULL != task)
  {
    GNUNET_SCHEDULER_cancel (task);
    task = NULL;
  }
  ANASTASIS_DB_plugin_unload (db_plugin);
  db_plugin = NULL;
  ANASTASIS_EUFIN_auth_free (&auth);
  cfg = NULL;
}


/**
 * Query for incoming wire transfers.
 *
 * @param cls NULL
 */
static void
find_transfers (void *cls);


/**
 * Callbacks of this type are used to serve the result of asking
 * the bank for the transaction history.
 *
 * @param cls closure with the `struct WioreAccount *` we are processing
 * @param http_status HTTP status code from the server
 * @param ec taler error code
 * @param serial_id identification of the position at which we are querying
 * @param details details about the wire transfer
 * @return #GNUNET_OK to continue, #GNUNET_SYSERR to abort iteration
 */
static int
history_cb (void *cls,
            unsigned int http_status,
            enum TALER_ErrorCode ec,
            uint64_t serial_id,
            const struct ANASTASIS_EUFIN_CreditDetails *details)
{
  enum GNUNET_DB_QueryStatus qs;

  if (NULL == details)
  {
    hh = NULL;
    if (TALER_EC_NONE != ec)
    {
      GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                  "Error fetching history: ec=%u, http_status=%u\n",
                  (unsigned int) ec,
                  http_status);
    }
    GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
                "End of list.\n");
    GNUNET_assert (NULL == task);
    if (test_mode)
    {
      GNUNET_SCHEDULER_shutdown ();
      return GNUNET_OK; /* will be ignored anyway */
    }
    task = GNUNET_SCHEDULER_add_delayed (idle_sleep_interval,
                                         &find_transfers,
                                         NULL);
    return GNUNET_OK; /* will be ignored anyway */
  }
  if (serial_id <= latest_row_off)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Serial ID %llu not monotonic (got %llu before). Failing!\n",
                (unsigned long long) serial_id,
                (unsigned long long) latest_row_off);
    GNUNET_SCHEDULER_shutdown ();
    hh = NULL;
    return GNUNET_SYSERR;
  }
  GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
              "Adding wire transfer over %s with (hashed) subject `%s'\n",
              TALER_amount2s (&details->amount),
              details->wire_subject);
  {
    char *dcanon = payto_get_iban (details->debit_account_uri);
    char *ccanon = payto_get_iban (details->credit_account_uri);

    qs = db_plugin->record_auth_iban_payment (db_plugin->cls,
                                              serial_id,
                                              details->wire_subject,
                                              &details->amount,
                                              dcanon,
                                              ccanon,
                                              details->execution_date);
    GNUNET_free (ccanon);
    GNUNET_free (dcanon);
  }
  switch (qs)
  {
  case GNUNET_DB_STATUS_HARD_ERROR:
    GNUNET_break (0);
    GNUNET_SCHEDULER_shutdown ();
    hh = NULL;
    return GNUNET_SYSERR;
  case GNUNET_DB_STATUS_SOFT_ERROR:
    GNUNET_break (0);
    hh = NULL;
    return GNUNET_SYSERR;
  case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
    /* already existed (!?), should be impossible */
    GNUNET_break (0);
    hh = NULL;
    return GNUNET_SYSERR;
  case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
    /* normal case */
    break;
  }
  latest_row_off = serial_id;
  {
    uint64_t code;

    if (GNUNET_OK !=
        extract_code (details->wire_subject,
                      &code))
      return GNUNET_OK;
    notify (details->debit_account_uri,
            code,
            &details->amount);
  }
  return GNUNET_OK;
}


/**
 * Query for incoming wire transfers.
 *
 * @param cls NULL
 */
static void
find_transfers (void *cls)
{
  (void) cls;
  task = NULL;
  GNUNET_assert (NULL == hh);
  hh = ANASTASIS_EUFIN_credit_history (ctx,
                                       &auth,
                                       latest_row_off,
                                       1024,
                                       test_mode
                                       ? GNUNET_TIME_UNIT_ZERO
                                       : LONGPOLL_TIMEOUT,
                                       &history_cb,
                                       NULL);
  if (NULL == hh)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Failed to start request for account history!\n");
    global_ret = EXIT_FAILURE;
    GNUNET_SCHEDULER_shutdown ();
    return;
  }
}


/**
 * First task.
 *
 * @param cls closure, NULL
 * @param args remaining command-line arguments
 * @param cfgfile name of the configuration file used (for saving, can be NULL!)
 * @param c configuration
 */
static void
run (void *cls,
     char *const *args,
     const char *cfgfile,
     const struct GNUNET_CONFIGURATION_Handle *c)
{
  (void) cls;
  (void) args;
  (void) cfgfile;
  cfg = c;
  if (NULL ==
      (db_plugin = ANASTASIS_DB_plugin_load (cfg)))
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Failed to initialize DB subsystem\n");
    global_ret = EXIT_NOTCONFIGURED;
    return;
  }
  if (GNUNET_OK !=
      db_plugin->connect (db_plugin->cls))
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Database not set up. Did you run anastasis-dbinit?\n");
    global_ret = EXIT_NOTCONFIGURED;
    ANASTASIS_DB_plugin_unload (db_plugin);
    db_plugin = NULL;
    return;
  }
  if (GNUNET_OK !=
      GNUNET_CONFIGURATION_get_value_string (cfg,
                                             "authorization-iban",
                                             "CREDIT_IBAN",
                                             &iban))
  {
    GNUNET_log_config_missing (GNUNET_ERROR_TYPE_ERROR,
                               "authorization-iban",
                               "CREDIT_IBAN");
    global_ret = EXIT_NOTCONFIGURED;
    ANASTASIS_DB_plugin_unload (db_plugin);
    db_plugin = NULL;
    return;
  }

  if (GNUNET_OK !=
      ANASTASIS_EUFIN_auth_parse_cfg (cfg,
                                      "authorization-iban",
                                      &auth))
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Failed to load bank access configuration data\n");
    ANASTASIS_DB_plugin_unload (db_plugin);
    db_plugin = NULL;
    global_ret = EXIT_NOTCONFIGURED;
    return;
  }
  {
    enum GNUNET_DB_QueryStatus qs;

    qs = db_plugin->get_last_auth_iban_payment_row (db_plugin->cls,
                                                    iban,
                                                    &latest_row_off);
    if (qs < 0)
    {
      GNUNET_break (0);
      ANASTASIS_EUFIN_auth_free (&auth);
      ANASTASIS_DB_plugin_unload (db_plugin);
      db_plugin = NULL;
      return;
    }
  }
  GNUNET_SCHEDULER_add_shutdown (&shutdown_task,
                                 cls);
  ctx = GNUNET_CURL_init (&GNUNET_CURL_gnunet_scheduler_reschedule,
                          &rc);
  rc = GNUNET_CURL_gnunet_rc_create (ctx);
  if (NULL == ctx)
  {
    GNUNET_break (0);
    return;
  }
  idle_sleep_interval = RETRY_TIMEOUT;
  task = GNUNET_SCHEDULER_add_now (&find_transfers,
                                   NULL);
}


/**
 * The main function of anastasis-helper-authorization-iban
 *
 * @param argc number of arguments from the command line
 * @param argv command line arguments
 * @return 0 ok, non-zero on error
 */
int
main (int argc,
      char *const *argv)
{
  struct GNUNET_GETOPT_CommandLineOption options[] = {
    GNUNET_GETOPT_option_flag ('t',
                               "test",
                               "run in test mode and exit when idle",
                               &test_mode),
    GNUNET_GETOPT_OPTION_END
  };
  enum GNUNET_GenericReturnValue ret;

  if (GNUNET_OK !=
      GNUNET_STRINGS_get_utf8_args (argc, argv,
                                    &argc, &argv))
    return EXIT_INVALIDARGUMENT;
  ANASTASIS_OS_init ();
  ret = GNUNET_PROGRAM_run (
    argc, argv,
    "anastasis-helper-authorization-iban",
    gettext_noop (
      "background process that watches for incoming wire transfers from customers"),
    options,
    &run, NULL);
  GNUNET_free_nz ((void *) argv);
  if (GNUNET_SYSERR == ret)
    return EXIT_INVALIDARGUMENT;
  if (GNUNET_NO == ret)
    return EXIT_SUCCESS;
  return global_ret;
}


/* end of anastasis-helper-authorization-iban.c */
