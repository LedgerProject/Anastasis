/*
  This file is part of Anastasis
  (C) 2020 Anastasis SARL

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
 * @file backend/anastasis-httpd.c
 * @brief HTTP serving layer intended to provide basic backup operations
 * @author Christian Grothoff
 * @author Dennis Neufeld
 * @author Dominik Meister
 */
#include "platform.h"
#include "anastasis-httpd.h"
#include "anastasis_util_lib.h"
#include "anastasis-httpd_mhd.h"
#include "anastasis_database_lib.h"
#include "anastasis-httpd_policy.h"
#include "anastasis-httpd_truth.h"
#include "anastasis-httpd_terms.h"
#include "anastasis-httpd_config.h"


/**
 * Backlog for listen operation on unix-domain sockets.
 */
#define UNIX_BACKLOG 500

/**
 * Upload limit to the service, in megabytes.
 */
unsigned long long int AH_upload_limit_mb;

/**
 * Annual fee for the backup account.
 */
struct TALER_Amount AH_annual_fee;

/**
 * Fee for a truth upload.
 */
struct TALER_Amount AH_truth_upload_fee;

/**
 * Amount of insurance.
 */
struct TALER_Amount AH_insurance;

/**
 * Cost for secure question truth download.
 */
struct TALER_Amount AH_question_cost;

/**
 * Our configuration.
 */
const struct GNUNET_CONFIGURATION_Handle *AH_cfg;

/**
 * Our Taler backend to process payments.
 */
char *AH_backend_url;

/**
 * Taler currency.
 */
char *AH_currency;

/**
 * Our fulfillment URL.
 */
char *AH_fulfillment_url;

/**
 * Our business name.
 */
char *AH_business_name;

/**
 * Our server salt.
 */
struct ANASTASIS_CRYPTO_ProviderSaltP AH_server_salt;

/**
 * Number of policy uploads permitted per annual fee payment.
 */
unsigned long long AH_post_counter = 64LLU;

/**
 * Our context for making HTTP requests.
 */
struct GNUNET_CURL_Context *AH_ctx;

/**
 * Should a "Connection: close" header be added to each HTTP response?
 */
static int AH_connection_close;

/**
 * Task running the HTTP server.
 */
static struct GNUNET_SCHEDULER_Task *mhd_task;

/**
 * Heap for processing timeouts of requests.
 */
struct GNUNET_CONTAINER_Heap *AH_to_heap;

/**
 * Global return code
 */
static int global_result;

/**
 * The MHD Daemon
 */
static struct MHD_Daemon *mhd;

/**
 * Connection handle to the our database
 */
struct ANASTASIS_DatabasePlugin *db;

/**
 * Reschedule context for #AH_ctx.
 */
static struct GNUNET_CURL_RescheduleContext *rc;

/**
 * Set if we should immediately MHD_run() again.
 */
static int triggered;

/**
 * Username and password to use for client authentication
 * (optional).
 */
static char *userpass;

/**
 * Type of the client's TLS certificate (optional).
 */
static char *certtype;

/**
 * File with the client's TLS certificate (optional).
 */
static char *certfile;

/**
 * File with the client's TLS private key (optional).
 */
static char *keyfile;

/**
 * This value goes in the Authorization:-header.
 */
static char *apikey;

/**
 * Passphrase to decrypt client's TLS private key file (optional).
 */
static char *keypass;


/**
 * Function that queries MHD's select sets and
 * starts the task waiting for them.
 */
static struct GNUNET_SCHEDULER_Task *
prepare_daemon (void);


/**
 * Call MHD to process pending requests and then go back
 * and schedule the next run.
 *
 * @param cls the `struct MHD_Daemon` of the HTTP server to run
 */
static void
run_daemon (void *cls)
{
  (void) cls;
  mhd_task = NULL;
  do {
    triggered = 0;
    GNUNET_assert (MHD_YES == MHD_run (mhd));
  } while (0 != triggered);
  mhd_task = prepare_daemon ();
}


/**
 * Kick MHD to run now, to be called after MHD_resume_connection().
 * Basically, we need to explicitly resume MHD's event loop whenever
 * we made progress serving a request.  This function re-schedules
 * the task processing MHD's activities to run immediately.
 *
 * @param cls NULL
 */
void
AH_trigger_daemon (void *cls)
{
  (void) cls;
  if (NULL != mhd_task)
  {
    GNUNET_SCHEDULER_cancel (mhd_task);
    mhd_task = GNUNET_SCHEDULER_add_now (&run_daemon,
                                         NULL);
  }
  else
  {
    triggered = 1;
  }
}


/**
 * Kick GNUnet Curl scheduler to begin curl interactions.
 */
void
AH_trigger_curl (void)
{
  GNUNET_CURL_gnunet_scheduler_reschedule (&rc);
}


/**
 * A client has requested the given url using the given method
 * (MHD_HTTP_METHOD_GET, MHD_HTTP_METHOD_PUT,
 * MHD_HTTP_METHOD_DELETE, MHD_HTTP_METHOD_POST, etc).  The callback
 * must call MHD callbacks to provide content to give back to the
 * client and return an HTTP status code (i.e. MHD_HTTP_OK,
 * MHD_HTTP_NOT_FOUND, etc.).
 *
 * @param cls argument given together with the function
 *        pointer when the handler was registered with MHD
 * @param connection MHD connection handle with further request details
 * @param url the requested url
 * @param method the HTTP method used (MHD_HTTP_METHOD_GET,
 *        MHD_HTTP_METHOD_PUT, etc.)
 * @param version the HTTP version string (i.e.
 *        MHD_HTTP_VERSION_1_1)
 * @param upload_data the data being uploaded (excluding HEADERS,
 *        for a POST that fits into memory and that is encoded
 *        with a supported encoding, the POST data will NOT be
 *        given in upload_data and is instead available as
 *        part of MHD_get_connection_values(); very large POST
 *        data *will* be made available incrementally in
 *        @a upload_data)
 * @param upload_data_size set initially to the size of the
 *        @a upload_data provided; the method must update this
 *        value to the number of bytes NOT processed;
 * @param con_cls pointer that the callback can set to some
 *        address and that will be preserved by MHD for future
 *        calls for this request; since the access handler may
 *        be called many times (i.e., for a PUT/POST operation
 *        with plenty of upload data) this allows the application
 *        to easily associate some request-specific state.
 *        If necessary, this state can be cleaned up in the
 *        global MHD_RequestCompletedCallback (which
 *        can be set with the MHD_OPTION_NOTIFY_COMPLETED).
 *        Initially, `*con_cls` will be NULL.
 * @return #MHD_YES if the connection was handled successfully,
 *         #MHD_NO if the socket must be closed due to a serious
 *         error while handling the request
 */
static MHD_RESULT
url_handler (void *cls,
             struct MHD_Connection *connection,
             const char *url,
             const char *method,
             const char *version,
             const char *upload_data,
             size_t *upload_data_size,
             void **con_cls)
{
  static struct AH_RequestHandler handlers[] = {
    /* Landing page, tell humans to go away. */
    { "/", MHD_HTTP_METHOD_GET, "text/plain",
      "Hello, I'm Anastasis. This HTTP server is not for humans.\n", 0,
      &TMH_MHD_handler_static_response, MHD_HTTP_OK },
    { "/agpl", MHD_HTTP_METHOD_GET, "text/plain",
      NULL, 0,
      &TMH_MHD_handler_agpl_redirect, MHD_HTTP_FOUND },
    { "/terms", MHD_HTTP_METHOD_GET, NULL,
      NULL, 0,
      &AH_handler_privacy, MHD_HTTP_OK },
    { "/privacy", MHD_HTTP_METHOD_GET, NULL,
      NULL, 0,
      &AH_handler_terms, MHD_HTTP_OK },
    { "/config", MHD_HTTP_METHOD_GET, "text/json",
      NULL, 0,
      &AH_handler_config, MHD_HTTP_OK },
    {NULL, NULL, NULL, NULL, 0, 0 }
  };
  static struct AH_RequestHandler h404 = {
    "", NULL, "text/html",
    "<html><title>404: not found</title></html>", 0,
    &TMH_MHD_handler_static_response, MHD_HTTP_NOT_FOUND
  };
  static struct AH_RequestHandler h405 = {
    "", NULL, "text/html",
    "<html><title>405: method not allowed</title></html>", 0,
    &TMH_MHD_handler_static_response, MHD_HTTP_METHOD_NOT_ALLOWED
  };
  struct TM_HandlerContext *hc = *con_cls;
  const char *correlation_id = NULL;
  bool path_matched;

  if (NULL == hc)
  {
    struct GNUNET_AsyncScopeId aid;

    GNUNET_async_scope_fresh (&aid);
    /* We only read the correlation ID on the first callback for every client */
    correlation_id = MHD_lookup_connection_value (connection,
                                                  MHD_HEADER_KIND,
                                                  "Anastasis-Correlation-Id");
    if ((NULL != correlation_id) &&
        (GNUNET_YES != GNUNET_CURL_is_valid_scope_id (correlation_id)))
    {
      GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                  "Invalid incoming correlation ID\n");
      correlation_id = NULL;
    }
    hc = GNUNET_new (struct TM_HandlerContext);
    *con_cls = hc;
    hc->async_scope_id = aid;
    hc->url = url;
  }
  if (0 == strcasecmp (method,
                       MHD_HTTP_METHOD_HEAD))
    method = MHD_HTTP_METHOD_GET; /* MHD will throw away the body */

  GNUNET_SCHEDULER_begin_async_scope (&hc->async_scope_id);
  if (NULL != correlation_id)
    GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                "Handling request for (%s) URL '%s', correlation_id=%s\n",
                method,
                url,
                correlation_id);
  else
    GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                "Handling request (%s) for URL '%s'\n",
                method,
                url);
  if (0 == strncmp (url,
                    "/policy/",
                    strlen ("/policy/")))
  {
    const char *account = url + strlen ("/policy/");
    struct ANASTASIS_CRYPTO_AccountPublicKeyP account_pub;

    if (GNUNET_OK !=
        GNUNET_STRINGS_string_to_data (
          account,
          strlen (account),
          &account_pub,
          sizeof (struct ANASTASIS_CRYPTO_AccountPublicKeyP)))
    {
      return TALER_MHD_reply_with_error (connection,
                                         MHD_HTTP_BAD_REQUEST,
                                         TALER_EC_GENERIC_PARAMETER_MALFORMED,
                                         "account public key");
    }
    if (0 == strcmp (method,
                     MHD_HTTP_METHOD_GET))
    {
      return AH_policy_get (connection,
                            &account_pub);
    }
    if (0 == strcmp (method,
                     MHD_HTTP_METHOD_POST))
    {
      return AH_handler_policy_post (connection,
                                     hc,
                                     &account_pub,
                                     upload_data,
                                     upload_data_size);
    }
    if (0 == strcmp (method,
                     MHD_HTTP_METHOD_OPTIONS))
    {
      return TALER_MHD_reply_cors_preflight (connection);
    }
    return TMH_MHD_handler_static_response (&h405,
                                            connection);
  }
  if (0 == strncmp (url,
                    "/truth/",
                    strlen ("/truth/")))
  {
    struct ANASTASIS_CRYPTO_TruthUUIDP tu;
    const char *pub_key_str;

    pub_key_str = &url[strlen ("/truth/")];
    if (GNUNET_OK !=
        GNUNET_STRINGS_string_to_data (
          pub_key_str,
          strlen (pub_key_str),
          &tu,
          sizeof(tu)))
    {
      GNUNET_break_op (0);
      return TALER_MHD_reply_with_error (connection,
                                         MHD_HTTP_BAD_REQUEST,
                                         TALER_EC_GENERIC_PARAMETER_MALFORMED,
                                         "truth UUID");
    }
    if (0 == strcmp (method,
                     MHD_HTTP_METHOD_GET))
    {
      return AH_handler_truth_get (connection,
                                   &tu,
                                   hc);
    }
    if (0 == strcmp (method,
                     MHD_HTTP_METHOD_POST))
    {
      return AH_handler_truth_post (connection,
                                    hc,
                                    &tu,
                                    upload_data,
                                    upload_data_size);
    }
    if (0 == strcmp (method,
                     MHD_HTTP_METHOD_OPTIONS))
    {
      return TALER_MHD_reply_cors_preflight (connection);
    }
    return TMH_MHD_handler_static_response (&h405,
                                            connection);
  }
  path_matched = false;
  for (unsigned int i = 0; NULL != handlers[i].url; i++)
  {
    struct AH_RequestHandler *rh = &handlers[i];

    if (0 == strcmp (url,
                     rh->url))
    {
      path_matched = true;
      if (0 == strcasecmp (method,
                           MHD_HTTP_METHOD_OPTIONS))
      {
        return TALER_MHD_reply_cors_preflight (connection);
      }
      if ( (NULL == rh->method) ||
           (0 == strcasecmp (method,
                             rh->method)) )
      {
        return rh->handler (rh,
                            connection);
      }
    }
  }
  if (path_matched)
    return TMH_MHD_handler_static_response (&h405,
                                            connection);
  return TMH_MHD_handler_static_response (&h404,
                                          connection);
}


/**
 * Shutdown task (magically invoked when the application is being
 * quit)
 *
 * @param cls NULL
 */
static void
do_shutdown (void *cls)
{
  (void) cls;
  AH_resume_all_bc ();
  AH_truth_shutdown ();
  AH_truth_upload_shutdown ();
  if (NULL != mhd_task)
  {
    GNUNET_SCHEDULER_cancel (mhd_task);
    mhd_task = NULL;
  }
  if (NULL != AH_ctx)
  {
    GNUNET_CURL_fini (AH_ctx);
    AH_ctx = NULL;
  }
  if (NULL != rc)
  {
    GNUNET_CURL_gnunet_rc_destroy (rc);
    rc = NULL;
  }
  if (NULL != mhd)
  {
    MHD_stop_daemon (mhd);
    mhd = NULL;
  }
  if (NULL != db)
  {
    ANASTASIS_DB_plugin_unload (db);
    db = NULL;
  }
  if (NULL != AH_to_heap)
  {
    GNUNET_CONTAINER_heap_destroy (AH_to_heap);
    AH_to_heap = NULL;
  }
}


/**
 * Function called whenever MHD is done with a request.  If the
 * request was a POST, we may have stored a `struct Buffer *` in the
 * @a con_cls that might still need to be cleaned up.  Call the
 * respective function to free the memory.
 *
 * @param cls client-defined closure
 * @param connection connection handle
 * @param con_cls value as set by the last call to
 *        the #MHD_AccessHandlerCallback
 * @param toe reason for request termination
 * @see #MHD_OPTION_NOTIFY_COMPLETED
 * @ingroup request
 */
static void
handle_mhd_completion_callback (void *cls,
                                struct MHD_Connection *connection,
                                void **con_cls,
                                enum MHD_RequestTerminationCode toe)
{
  struct TM_HandlerContext *hc = *con_cls;
  struct GNUNET_AsyncScopeSave old_scope;

  (void) cls;
  (void) connection;
  if (NULL == hc)
    return;
  GNUNET_async_scope_enter (&hc->async_scope_id,
                            &old_scope);
  {
#if MHD_VERSION >= 0x00097304
    const union MHD_ConnectionInfo *ci;
    unsigned int http_status = 0;

    ci = MHD_get_connection_info (connection,
                                  MHD_CONNECTION_INFO_HTTP_STATUS);
    if (NULL != ci)
      http_status = ci->http_status;
    GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                "Request for `%s' completed with HTTP status %u (%d)\n",
                hc->url,
                http_status,
                toe);
#else
    (void) connection;
    GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                "Request for `%s' completed (%d)\n",
                hc->url,
                toe);
#endif
  }
  if (NULL != hc->cc)
    hc->cc (hc);
  GNUNET_free (hc);
  *con_cls = NULL;
}


/**
 * Function that queries MHD's select sets and
 * starts the task waiting for them.
 *
 * @return task handle for the daemon
 */
static struct GNUNET_SCHEDULER_Task *
prepare_daemon (void)
{
  struct GNUNET_SCHEDULER_Task *ret;
  fd_set rs;
  fd_set ws;
  fd_set es;
  struct GNUNET_NETWORK_FDSet *wrs;
  struct GNUNET_NETWORK_FDSet *wws;
  int max;
  MHD_UNSIGNED_LONG_LONG timeout;
  int haveto;
  struct GNUNET_TIME_Relative tv;

  FD_ZERO (&rs);
  FD_ZERO (&ws);
  FD_ZERO (&es);
  wrs = GNUNET_NETWORK_fdset_create ();
  wws = GNUNET_NETWORK_fdset_create ();
  max = -1;
  GNUNET_assert (MHD_YES ==
                 MHD_get_fdset (mhd,
                                &rs,
                                &ws,
                                &es,
                                &max));
  haveto = MHD_get_timeout (mhd, &timeout);
  if (haveto == MHD_YES)
    tv = GNUNET_TIME_relative_multiply (GNUNET_TIME_UNIT_MILLISECONDS,
                                        timeout);
  else
    tv = GNUNET_TIME_UNIT_FOREVER_REL;
  GNUNET_NETWORK_fdset_copy_native (wrs, &rs, max + 1);
  GNUNET_NETWORK_fdset_copy_native (wws, &ws, max + 1);
  GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
              "Adding run_daemon select task\n");
  ret = GNUNET_SCHEDULER_add_select (GNUNET_SCHEDULER_PRIORITY_HIGH,
                                     tv,
                                     wrs,
                                     wws,
                                     &run_daemon,
                                     NULL);
  GNUNET_NETWORK_fdset_destroy (wrs);
  GNUNET_NETWORK_fdset_destroy (wws);
  return ret;
}


/**
 * Main function that will be run by the scheduler.
 *
 * @param cls closure
 * @param args remaining command-line arguments
 * @param cfgfile name of the configuration file used (for saving, can be
 *        NULL!)
 * @param config configuration
 */
static void
run (void *cls,
     char *const *args,
     const char *cfgfile,
     const struct GNUNET_CONFIGURATION_Handle *config)
{
  int fh;
  uint16_t port;
  enum TALER_MHD_GlobalOptions go;

  GNUNET_log (GNUNET_ERROR_TYPE_INFO,
              "Starting anastasis-httpd\n");
  go = TALER_MHD_GO_NONE;
  if (AH_connection_close)
    go |= TALER_MHD_GO_FORCE_CONNECTION_CLOSE;
  AH_load_terms (config);
  TALER_MHD_setup (go);
  AH_cfg = config;
  global_result = GNUNET_SYSERR;
  GNUNET_SCHEDULER_add_shutdown (&do_shutdown,
                                 NULL);
  if (GNUNET_OK !=
      GNUNET_CONFIGURATION_get_value_number (config,
                                             "anastasis",
                                             "UPLOAD_LIMIT_MB",
                                             &AH_upload_limit_mb))
  {
    GNUNET_log_config_missing (GNUNET_ERROR_TYPE_ERROR,
                               "anastasis",
                               "UPLOAD_LIMIT_MB");
    GNUNET_SCHEDULER_shutdown ();
    return;
  }
  if (GNUNET_OK !=
      TALER_config_get_amount (config,
                               "anastasis",
                               "INSURANCE",
                               &AH_insurance))
  {
    GNUNET_log_config_missing (GNUNET_ERROR_TYPE_ERROR,
                               "anastasis",
                               "INSURANCE");
    GNUNET_SCHEDULER_shutdown ();
    return;
  }
  if (GNUNET_OK !=
      TALER_config_get_amount (config,
                               "authorization-question",
                               "COST",
                               &AH_question_cost))
  {
    GNUNET_log_config_missing (GNUNET_ERROR_TYPE_ERROR,
                               "authorization-question",
                               "COST");
    GNUNET_SCHEDULER_shutdown ();
    return;
  }
  if (GNUNET_OK !=
      TALER_config_get_amount (config,
                               "anastasis",
                               "ANNUAL_FEE",
                               &AH_annual_fee))
  {
    GNUNET_log_config_missing (GNUNET_ERROR_TYPE_ERROR,
                               "anastasis",
                               "ANNUAL_FEE");
    GNUNET_SCHEDULER_shutdown ();
    return;
  }
  if (GNUNET_OK !=
      TALER_config_get_amount (config,
                               "anastasis",
                               "TRUTH_UPLOAD_FEE",
                               &AH_truth_upload_fee))
  {
    GNUNET_log_config_missing (GNUNET_ERROR_TYPE_ERROR,
                               "anastasis",
                               "TRUTH_UPLOAD_FEE");
    GNUNET_SCHEDULER_shutdown ();
    return;
  }
  if (GNUNET_OK !=
      TALER_config_get_currency (config,
                                 &AH_currency))
  {
    GNUNET_SCHEDULER_shutdown ();
    return;
  }
  if (0 != strcasecmp (AH_currency,
                       AH_annual_fee.currency))
  {
    GNUNET_log_config_invalid (GNUNET_ERROR_TYPE_ERROR,
                               "anastasis",
                               "ANNUAL_FEE",
                               "currency mismatch");
    GNUNET_SCHEDULER_shutdown ();
    return;
  }
  if (GNUNET_OK !=
      TALER_amount_cmp_currency (&AH_insurance,
                                 &AH_annual_fee))
  {
    GNUNET_log_config_invalid (GNUNET_ERROR_TYPE_ERROR,
                               "anastasis",
                               "INSURANCE",
                               "currency mismatch");
    GNUNET_SCHEDULER_shutdown ();
    return;
  }
  if (GNUNET_OK !=
      GNUNET_CONFIGURATION_get_value_string (config,
                                             "anastasis-merchant-backend",
                                             "PAYMENT_BACKEND_URL",
                                             &AH_backend_url))
  {
    GNUNET_log_config_missing (GNUNET_ERROR_TYPE_ERROR,
                               "anastasis-merchant-backend",
                               "PAYMENT_BACKEND_URL");
    GNUNET_SCHEDULER_shutdown ();
    return;
  }
  if ( (0 != strncasecmp ("https://",
                          AH_backend_url,
                          strlen ("https://"))) &&
       (0 != strncasecmp ("http://",
                          AH_backend_url,
                          strlen ("http://"))) )
  {
    GNUNET_log_config_invalid (GNUNET_ERROR_TYPE_ERROR,
                               "anastasis-merchant-backend",
                               "PAYMENT_BACKEND_URL",
                               "Must be HTTP(S) URL");
    GNUNET_SCHEDULER_shutdown ();
    return;
  }

  if ( (0 == strcasecmp ("https://",
                         AH_backend_url)) ||
       (0 == strcasecmp ("http://",
                         AH_backend_url)) )
  {
    GNUNET_log_config_invalid (GNUNET_ERROR_TYPE_ERROR,
                               "anastasis-merchant-backend",
                               "PAYMENT_BACKEND_URL",
                               "Must have domain name");
    GNUNET_SCHEDULER_shutdown ();
    return;
  }


  if (GNUNET_OK !=
      GNUNET_CONFIGURATION_get_value_string (config,
                                             "anastasis",
                                             "FULFILLMENT_URL",
                                             &AH_fulfillment_url))
  {
    GNUNET_log_config_missing (GNUNET_ERROR_TYPE_ERROR,
                               "anastasis",
                               "FULFILLMENT_URL");
    GNUNET_SCHEDULER_shutdown ();
    return;
  }
  if (GNUNET_OK !=
      GNUNET_CONFIGURATION_get_value_number (config,
                                             "anastasis",
                                             "ANNUAL_POLICY_UPLOAD_LIMIT",
                                             &AH_post_counter))
  {
    /* only warn, we will use the default */
    GNUNET_log_config_missing (GNUNET_ERROR_TYPE_WARNING,
                               "anastasis",
                               "ANNUAL_POLICY_UPLOAD_LIMIT");
  }

  if (GNUNET_OK !=
      GNUNET_CONFIGURATION_get_value_string (config,
                                             "anastasis",
                                             "BUSINESS_NAME",
                                             &AH_business_name))
  {
    GNUNET_log_config_missing (GNUNET_ERROR_TYPE_ERROR,
                               "anastasis",
                               "BUSINESS_NAME");
    GNUNET_SCHEDULER_shutdown ();
    return;
  }
  {
    char *server_salt;

    if (GNUNET_OK !=
        GNUNET_CONFIGURATION_get_value_string (config,
                                               "anastasis",
                                               "SERVER_SALT",
                                               &server_salt))
    {
      GNUNET_log_config_missing (GNUNET_ERROR_TYPE_ERROR,
                                 "anastasis",
                                 "SERVER_SALT");
      GNUNET_SCHEDULER_shutdown ();
      return;
    }
    GNUNET_assert (GNUNET_YES ==
                   GNUNET_CRYPTO_kdf (&AH_server_salt,
                                      sizeof (AH_server_salt),
                                      "anastasis-server-salt",
                                      strlen ("anastasis-server-salt"),
                                      server_salt,
                                      strlen (server_salt),
                                      NULL,
                                      0));
    GNUNET_free (server_salt);
  }

  /* setup HTTP client event loop */
  AH_ctx = GNUNET_CURL_init (&GNUNET_CURL_gnunet_scheduler_reschedule,
                             &rc);
  rc = GNUNET_CURL_gnunet_rc_create (AH_ctx);
  if (NULL != userpass)
    GNUNET_CURL_set_userpass (AH_ctx,
                              userpass);
  if (NULL != keyfile)
    GNUNET_CURL_set_tlscert (AH_ctx,
                             certtype,
                             certfile,
                             keyfile,
                             keypass);
  if (NULL == apikey)
  {
    (void) GNUNET_CONFIGURATION_get_value_string (config,
                                                  "anastasis-merchant-backend",
                                                  "API_KEY",
                                                  &apikey);
  }
  if (NULL != apikey)
  {
    char *auth_header;

    GNUNET_asprintf (&auth_header,
                     "%s: %s",
                     MHD_HTTP_HEADER_AUTHORIZATION,
                     apikey);
    if (GNUNET_OK !=
        GNUNET_CURL_append_header (AH_ctx,
                                   auth_header))
    {
      GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                  "Failed so set %s header, trying without\n",
                  MHD_HTTP_HEADER_AUTHORIZATION);
    }
    GNUNET_free (auth_header);
  }

  if (NULL ==
      (db = ANASTASIS_DB_plugin_load (config)))
  {
    GNUNET_SCHEDULER_shutdown ();
    return;
  }
  if (GNUNET_OK !=
      db->connect (db->cls))
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Database not setup. Did you run anastasis-dbinit?\n");
    GNUNET_SCHEDULER_shutdown ();
    return;
  }

  fh = TALER_MHD_bind (config,
                       "anastasis",
                       &port);
  if ( (0 == port) &&
       (-1 == fh) )
  {
    GNUNET_SCHEDULER_shutdown ();
    return;
  }
  mhd = MHD_start_daemon (MHD_USE_SUSPEND_RESUME | MHD_USE_DUAL_STACK,
                          port,
                          NULL, NULL,
                          &url_handler, NULL,
                          MHD_OPTION_LISTEN_SOCKET, fh,
                          MHD_OPTION_NOTIFY_COMPLETED,
                          &handle_mhd_completion_callback, NULL,
                          MHD_OPTION_CONNECTION_TIMEOUT, (unsigned
                                                          int) 10 /* 10s */,
                          MHD_OPTION_END);
  if (NULL == mhd)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Failed to launch HTTP service (port %u in use?), exiting.\n",
                port);
    GNUNET_SCHEDULER_shutdown ();
    return;
  }
  global_result = GNUNET_OK;
  mhd_task = prepare_daemon ();
}


/**
 * The main function of the serve tool
 *
 * @param argc number of arguments from the command line
 * @param argv command line arguments
 * @return 0 ok, 1 on error
 */
int
main (int argc,
      char *const *argv)
{
  enum GNUNET_GenericReturnValue res;
  struct GNUNET_GETOPT_CommandLineOption options[] = {
    GNUNET_GETOPT_option_string ('A',
                                 "auth",
                                 "USERNAME:PASSWORD",
                                 "use the given USERNAME and PASSWORD for client authentication",
                                 &userpass),
    GNUNET_GETOPT_option_flag ('C',
                               "connection-close",
                               "force HTTP connections to be closed after each request",
                               &AH_connection_close),
    GNUNET_GETOPT_option_string ('k',
                                 "key",
                                 "KEYFILE",
                                 "file with the private TLS key for TLS client authentication",
                                 &keyfile),
    GNUNET_GETOPT_option_string ('p',
                                 "pass",
                                 "KEYFILEPASSPHRASE",
                                 "passphrase needed to decrypt the TLS client private key file",
                                 &keypass),
    GNUNET_GETOPT_option_string ('K',
                                 "apikey",
                                 "APIKEY",
                                 "API key to use in the HTTP request to the merchant backend",
                                 &apikey),
    GNUNET_GETOPT_option_string ('t',
                                 "type",
                                 "CERTTYPE",
                                 "type of the TLS client certificate, defaults to PEM if not specified",
                                 &certtype),

    GNUNET_GETOPT_OPTION_END
  };

  /* FIRST get the libtalerutil initialization out
     of the way. Then throw that one away, and force
     the ANASTASIS defaults to be used! */
  (void) TALER_project_data_default ();
  GNUNET_OS_init (ANASTASIS_project_data_default ());
  res = GNUNET_PROGRAM_run (argc, argv,
                            "anastasis-httpd",
                            "Anastasis HTTP interface",
                            options, &run, NULL);
  if (GNUNET_SYSERR == res)
    return 3;
  if (GNUNET_NO == res)
    return 0;
  return (GNUNET_OK == global_result) ? 0 : 1;
}
