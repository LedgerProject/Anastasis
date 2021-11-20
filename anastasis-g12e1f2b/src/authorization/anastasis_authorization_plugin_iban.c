/*
  This file is part of Anastasis
  Copyright (C) 2021 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU Affero General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with
  Anastasis; see the file COPYING.GPL.  If not, see <http://www.gnu.org/licenses/>
*/
/**
 * @file anastasis_authorization_plugin_iban.c
 * @brief authorization plugin wire transfer based
 * @author Christian Grothoff
 */
#include "platform.h"
#include "anastasis_authorization_plugin.h"
#include <taler/taler_mhd_lib.h>
#include <taler/taler_json_lib.h>
#include <gnunet/gnunet_db_lib.h>
#include "anastasis_authorization_lib.h"
#include "anastasis_database_lib.h"
#include "anastasis_util_lib.h"
#include "iban.h"

/**
 * How long is a code valid once generated? Very long
 * here as we do not want to refuse authentication
 * just because the user took a while to execute the
 * wire transfer (and then get back to their recovery
 * operation).
 */
#define CODE_VALIDITY_PERIOD GNUNET_TIME_UNIT_MONTHS


/**
 * Saves the State of a authorization plugin.
 */
struct IBAN_Context
{

  /**
   * Messages of the plugin, read from a resource file.
   */
  json_t *messages;

  /**
   * IBAN of our business, must be credited in the SEPA
   * wire transfer.
   */
  char *business_iban;

  /**
   * Name of our business, for the SEPA wire transfer.
   */
  char *business_name;

  /**
   * Handle to interact with a authorization backend.
   */
  const struct ANASTASIS_AuthorizationContext *ac;

  /**
   * Amount we expect to be transferred.
   */
  struct TALER_Amount expected_amount;

};


/**
 * Saves the State of a authorization process
 */
struct ANASTASIS_AUTHORIZATION_State
{
  /**
   * Public key of the challenge which is authorised
   */
  struct ANASTASIS_CRYPTO_TruthUUIDP truth_uuid;

  /**
   * Code which is sent to the user (here sent via IBAN)
   */
  uint64_t code;

  /**
   * Our plugin context.
   */
  struct IBAN_Context *ctx;

  /**
   * Function to call when we made progress.
   */
  GNUNET_SCHEDULER_TaskCallback trigger;

  /**
   * Closure for @e trigger.
   */
  void *trigger_cls;

  /**
   * holds the truth information
   */
  char *iban_number;

  /**
   * Our client connection, set if suspended.
   */
  struct MHD_Connection *connection;

  /**
   * Handler for database event we are waiting for.
   */
  struct GNUNET_DB_EventHandler *eh;

  /**
   * Amount that was transferred.
   */
  struct TALER_Amount amount;
};


/**
 * Obtain internationalized message @a msg_id from @a ctx using
 * language preferences of @a conn.
 *
 * @param messages JSON object to lookup message from
 * @param conn connection to lookup message for
 * @param msg_id unique message ID
 * @return NULL if message was not found
 */
static const char *
get_message (const json_t *messages,
             struct MHD_Connection *conn,
             const char *msg_id)
{
  const char *accept_lang;

  accept_lang = MHD_lookup_connection_value (conn,
                                             MHD_HEADER_KIND,
                                             MHD_HTTP_HEADER_ACCEPT_LANGUAGE);
  if (NULL == accept_lang)
    accept_lang = "en_US";
  {
    const char *ret;
    struct GNUNET_JSON_Specification spec[] = {
      TALER_JSON_spec_i18n_string (msg_id,
                                   accept_lang,
                                   &ret),
      GNUNET_JSON_spec_end ()
    };

    if (GNUNET_OK !=
        GNUNET_JSON_parse (messages,
                           spec,
                           NULL, NULL))
    {
      GNUNET_break (0);
      GNUNET_JSON_parse_free (spec);
      return NULL;
    }
    GNUNET_JSON_parse_free (spec);
    return ret;
  }
}


/**
 * Validate @a data is a well-formed input into the challenge method,
 * i.e. @a data is a well-formed iban number for sending an IBAN, or
 * a well-formed e-mail address for sending an e-mail. Not expected to
 * check that the iban number or e-mail account actually exists.
 *
 * To be possibly used before issuing a 402 payment required to the client.
 *
 * @param cls closure with a `struct IBAN_Context`
 * @param connection HTTP client request (for queuing response)
 * @param truth_mime mime type of @e data
 * @param data input to validate (i.e. is it a valid iban number, etc.)
 * @param data_length number of bytes in @a data
 * @return #GNUNET_OK if @a data is valid,
 *         #GNUNET_NO if @a data is invalid and a reply was successfully queued on @a connection
 *         #GNUNET_SYSERR if @a data invalid but we failed to queue a reply on @a connection
 */
static enum GNUNET_GenericReturnValue
iban_validate (void *cls,
               struct MHD_Connection *connection,
               const char *truth_mime,
               const char *data,
               size_t data_length)
{
  char *iban_number;
  char *emsg;

  iban_number = GNUNET_strndup (data,
                                data_length);
  emsg = TALER_iban_validate (iban_number);
  if (NULL != emsg)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                "Invalid IBAN `%s' provided: %s\n",
                iban_number,
                emsg);
    GNUNET_free (iban_number);
    if (MHD_NO ==
        TALER_MHD_reply_with_error (connection,
                                    MHD_HTTP_EXPECTATION_FAILED,
                                    TALER_EC_ANASTASIS_IBAN_INVALID,
                                    emsg))
    {
      GNUNET_free (emsg);
      return GNUNET_SYSERR;
    }
    GNUNET_free (emsg);
    return GNUNET_NO;
  }
  GNUNET_free (iban_number);
  return GNUNET_OK;
}


/**
 * Begin issuing authentication challenge to user based on @a data.
 * Sends IBAN.
 *
 * @param cls closure with a `struct IBAN_Context`
 * @param trigger function to call when we made progress
 * @param trigger_cls closure for @a trigger
 * @param truth_uuid Identifier of the challenge, to be (if possible) included in the
 *             interaction with the user
 * @param code secret code that the user has to provide back to satisfy the challenge in
 *             the main anastasis protocol
 * @param data input to validate (i.e. is it a valid iban number, etc.)
 * @param data_length number of bytes in @a data
 * @return state to track progress on the authorization operation, NULL on failure
 */
static struct ANASTASIS_AUTHORIZATION_State *
iban_start (void *cls,
            GNUNET_SCHEDULER_TaskCallback trigger,
            void *trigger_cls,
            const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
            uint64_t code,
            const void *data,
            size_t data_length)
{
  struct IBAN_Context *ctx = cls;
  struct ANASTASIS_AUTHORIZATION_State *as;

  as = GNUNET_new (struct ANASTASIS_AUTHORIZATION_State);
  as->trigger = trigger;
  as->trigger_cls = trigger_cls;
  as->ctx = ctx;
  as->truth_uuid = *truth_uuid;
  as->code = code;
  as->iban_number = GNUNET_strndup (data,
                                    data_length);
  return as;
}


/**
 * Function called when we received a wire transfer
 * with the respective code from the specified IBAN.
 *
 * @param cls our `struct ANASTASIS_AUHTORIZATION_State`
 * @param extra string describing amount transferred
 * @param extra_size number of byes in @a extra
 */
static void
bank_event_cb (void *cls,
               const void *extra,
               size_t extra_size)
{
  struct ANASTASIS_AUTHORIZATION_State *as = cls;
  char *amount_s;

  if (NULL != extra)
  {
    amount_s = GNUNET_strndup (extra,
                               extra_size);
    if (GNUNET_OK !=
        TALER_string_to_amount (amount_s,
                                &as->amount))
    {
      GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                  "Expected amount in event notification, got `%s'\n",
                  amount_s);
    }
    GNUNET_free (amount_s);
  }
  MHD_resume_connection (as->connection);
  as->trigger (as->trigger_cls);
}


/**
 * Respond with instructions to the user how to
 * satisfy the challenge.
 *
 * @param as our state
 * @param connection connection to respond on
 * @return state of the request
 */
static enum ANASTASIS_AUTHORIZATION_Result
respond_with_challenge (struct ANASTASIS_AUTHORIZATION_State *as,
                        struct MHD_Connection *connection)
{
  struct IBAN_Context *ctx = as->ctx;
  const char *mime;
  const char *lang;
  MHD_RESULT mres;

  mime = MHD_lookup_connection_value (connection,
                                      MHD_HEADER_KIND,
                                      MHD_HTTP_HEADER_ACCEPT);
  if (NULL == mime)
    mime = "text/plain";
  lang = MHD_lookup_connection_value (connection,
                                      MHD_HEADER_KIND,
                                      MHD_HTTP_HEADER_ACCEPT_LANGUAGE);
  if (NULL == lang)
    lang = "en";

  /* Build HTTP response */
  {
    struct MHD_Response *resp;

    if (TALER_MHD_xmime_matches (mime,
                                 "application/json"))
    {
      char subject[64];

      GNUNET_snprintf (subject,
                       sizeof (subject),
                       "Anastasis %llu",
                       (unsigned long long) as->code);
      resp = TALER_MHD_MAKE_JSON_PACK (
        GNUNET_JSON_pack_string ("method",
                                 "iban"),
        GNUNET_JSON_pack_bool ("async",
                               true),
        GNUNET_JSON_pack_uint64 ("answer_code",
                                 as->code),
        GNUNET_JSON_pack_object_steal (
          "details",
          GNUNET_JSON_PACK (
            TALER_JSON_pack_amount ("challenge_amount",
                                    &ctx->expected_amount),
            GNUNET_JSON_pack_string ("credit_iban",
                                     ctx->business_iban),
            GNUNET_JSON_pack_string ("business_name",
                                     ctx->business_name),
            GNUNET_JSON_pack_string ("wire_transfer_subject",
                                     subject))));
    }
    else
    {
      size_t reply_len;
      char *reply;

      reply_len = GNUNET_asprintf (&reply,
                                   get_message (ctx->messages,
                                                connection,
                                                "instructions"),
                                   TALER_amount2s (&ctx->expected_amount),
                                   ctx->business_name,
                                   ctx->business_iban,
                                   (unsigned long long) as->code);
      resp = MHD_create_response_from_buffer (reply_len,
                                              reply,
                                              MHD_RESPMEM_MUST_COPY);
      GNUNET_free (reply);
      TALER_MHD_add_global_headers (resp);
      GNUNET_break (MHD_YES ==
                    MHD_add_response_header (resp,
                                             MHD_HTTP_HEADER_CONTENT_TYPE,
                                             "text/plain"));
    }
    mres = MHD_queue_response (connection,
                               MHD_HTTP_ACCEPTED,
                               resp);
    MHD_destroy_response (resp);
    if (MHD_YES != mres)
      return ANASTASIS_AUTHORIZATION_RES_SUCCESS_REPLY_FAILED;
    return ANASTASIS_AUTHORIZATION_RES_SUCCESS;
  }
}


#include "iban.c"


/**
 * Check if the @a wire_subject matches the challenge in the context
 * and if the @a amount is sufficient. If so, return true.
 *
 * @param cls a `const struct ANASTASIS_AUTHORIZATION_State *`
 * @param amount the amount that was transferred
 * @param wire_subject a wire subject we received
 * @return true if the wire transfer satisfied the check
 */
static bool
check_payment_ok (void *cls,
                  const struct TALER_Amount *amount,
                  const char *wire_subject)
{
  const struct ANASTASIS_AUTHORIZATION_State *as = cls;
  struct IBAN_Context *ctx = as->ctx;
  uint64_t code;
  struct TALER_Amount camount;

  if (GNUNET_OK !=
      extract_code (wire_subject,
                    &code))
    return false;
  /* Database uses 'default' currency, but this
     plugin may use a different currency (and the
     same goes for the bank). So we fix this by
     forcing the currency to be 'right'. */
  camount = *amount;
  strcpy (camount.currency,
          ctx->expected_amount.currency);
  if (1 ==
      TALER_amount_cmp (&ctx->expected_amount,
                        &camount))
  {
    GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                "Amount `%s' insufficient for authorization\n",
                TALER_amount2s (&camount));
    return false;
  }
  return (code == as->code);
}


/**
 * Check if we have received a wire transfer with a subject
 * authorizing the disclosure of the credential in the meantime.
 *
 * @param as state to check for
 * @return WTS_SUCCESS if a transfer was received,
 *         WTS_NOT_READY if no transfer was received,
 *         WTS_FAILED_WITH_REPLY if we had an internal error and queued a reply
 *         WTS_FAILED_WITHOUT_REPLY if we had an internal error and failed to queue a reply
 */
static enum
{
  WTS_SUCCESS,
  WTS_NOT_READY,
  WTS_FAILED_WITH_REPLY,
  WTS_FAILED_WITHOUT_REPLY
}
test_wire_transfers (struct ANASTASIS_AUTHORIZATION_State *as)
{
  struct IBAN_Context *ctx = as->ctx;
  struct ANASTASIS_DatabasePlugin *db = ctx->ac->db;
  enum GNUNET_DB_QueryStatus qs;
  struct GNUNET_TIME_Absolute now;
  struct GNUNET_TIME_Absolute limit;

  now = GNUNET_TIME_absolute_get ();
  limit = GNUNET_TIME_absolute_subtract (now,
                                         CODE_VALIDITY_PERIOD);
  (void) GNUNET_TIME_round_abs (&limit);
  qs = db->test_auth_iban_payment (
    db->cls,
    as->iban_number,
    limit,
    &check_payment_ok,
    as);
  switch (qs)
  {
  case GNUNET_DB_STATUS_HARD_ERROR:
  case GNUNET_DB_STATUS_SOFT_ERROR:
    return (MHD_YES ==
            TALER_MHD_reply_with_error (as->connection,
                                        MHD_HTTP_INTERNAL_SERVER_ERROR,
                                        TALER_EC_GENERIC_DB_FETCH_FAILED,
                                        NULL))
      ? WTS_FAILED_WITH_REPLY
      : WTS_FAILED_WITHOUT_REPLY;
  case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
    return WTS_NOT_READY;
  case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
    break;
  }
  GNUNET_log (GNUNET_ERROR_TYPE_INFO,
              "Marking IBAN challenge as satisfied!\n");
  qs = db->mark_challenge_code_satisfied (
    db->cls,
    &as->truth_uuid,
    as->code);
  GNUNET_break (qs > 0);
  return WTS_SUCCESS;
}


/**
 * Begin issuing authentication challenge to user based on @a data.
 * I.e. start to send IBAN or e-mail or launch video identification.
 *
 * @param as authorization state
 * @param timeout how long do we have to produce a reply
 * @param connection HTTP client request (for queuing response, such as redirection to video portal)
 * @return state of the request
 */
static enum ANASTASIS_AUTHORIZATION_Result
iban_process (struct ANASTASIS_AUTHORIZATION_State *as,
              struct GNUNET_TIME_Absolute timeout,
              struct MHD_Connection *connection)
{
  struct IBAN_Context *ctx = as->ctx;
  struct ANASTASIS_DatabasePlugin *db = ctx->ac->db;
  MHD_RESULT mres;
  enum GNUNET_DB_QueryStatus qs;
  struct MHD_Response *resp;
  struct GNUNET_TIME_Absolute now = GNUNET_TIME_absolute_get ();
  struct GNUNET_TIME_Absolute after;

  if (NULL == as->eh)
  {
    struct IbanEventP espec = {
      .header.size = htons (sizeof (espec)),
      .header.type = htons (TALER_DBEVENT_ANASTASIS_AUTH_IBAN_TRANSFER),
      .code = GNUNET_htonll (as->code)
    };

    GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                "Subscribing to events for code %llu from %s\n",
                (unsigned long long) as->code,
                as->iban_number);
    GNUNET_CRYPTO_hash (as->iban_number,
                        strlen (as->iban_number),
                        &espec.debit_iban_hash);
    as->eh = db->event_listen (db->cls,
                               &espec.header,
                               GNUNET_TIME_absolute_get_remaining (
                                 timeout),
                               &bank_event_cb,
                               as);
  }
  after = GNUNET_TIME_absolute_subtract (now,
                                         CODE_VALIDITY_PERIOD);
  (void) GNUNET_TIME_round_abs (&after);
  qs = db->test_challenge_code_satisfied (db->cls,
                                          &as->truth_uuid,
                                          as->code,
                                          after);
  switch (qs)
  {
  case GNUNET_DB_STATUS_HARD_ERROR:
  case GNUNET_DB_STATUS_SOFT_ERROR:
    resp = TALER_MHD_make_error (TALER_EC_GENERIC_DB_FETCH_FAILED,
                                 "test_challenge_code_satisfied");
    mres = MHD_queue_response (connection,
                               MHD_HTTP_INTERNAL_SERVER_ERROR,
                               resp);
    MHD_destroy_response (resp);
    if (MHD_YES != mres)
      return ANASTASIS_AUTHORIZATION_RES_FAILED_REPLY_FAILED;
    return ANASTASIS_AUTHORIZATION_RES_FAILED;
  case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
    switch (test_wire_transfers (as))
    {
    case WTS_SUCCESS:
      GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                  "IBAN authorization finished!\n");
      return ANASTASIS_AUTHORIZATION_RES_FINISHED;
    case WTS_NOT_READY:
      break;   /* continue below */
    case WTS_FAILED_WITH_REPLY:
      return ANASTASIS_AUTHORIZATION_RES_FAILED;
    case WTS_FAILED_WITHOUT_REPLY:
      return ANASTASIS_AUTHORIZATION_RES_FAILED_REPLY_FAILED;
    }
    if (GNUNET_TIME_absolute_is_future (timeout))
    {
      as->connection = connection;
      MHD_suspend_connection (connection);
      return ANASTASIS_AUTHORIZATION_RES_SUSPENDED;
    }
    return respond_with_challenge (as,
                                   connection);
  case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
    GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                "IBAN authorization finished!\n");
    return ANASTASIS_AUTHORIZATION_RES_FINISHED;
  }
  /* should be impossible */
  GNUNET_break (0);
  return ANASTASIS_AUTHORIZATION_RES_FAILED_REPLY_FAILED;
}


/**
 * Free internal state associated with @a as.
 *
 * @param as state to clean up
 */
static void
iban_cleanup (struct ANASTASIS_AUTHORIZATION_State *as)
{
  struct IBAN_Context *ctx = as->ctx;

  if (NULL != as->eh)
  {
    ctx->ac->db->event_listen_cancel (as->eh);
    as->eh = NULL;
  }
  GNUNET_free (as->iban_number);
  GNUNET_free (as);
}


/**
 * Initialize email based authorization plugin
 *
 * @param cls a `struct ANASTASIS_AuthorizationContext`
 * @return NULL on error, otherwise a `struct ANASTASIS_AuthorizationPlugin`
 */
void *
libanastasis_plugin_authorization_iban_init (void *cls)
{
  struct ANASTASIS_AuthorizationContext *ac = cls;
  struct ANASTASIS_AuthorizationPlugin *plugin;
  const struct GNUNET_CONFIGURATION_Handle *cfg = ac->cfg;
  struct IBAN_Context *ctx;

  ctx = GNUNET_new (struct IBAN_Context);
  if (GNUNET_OK !=
      GNUNET_CONFIGURATION_get_value_string (cfg,
                                             "authorization-iban",
                                             "CREDIT_IBAN",
                                             &ctx->business_iban))
  {
    GNUNET_log_config_missing (GNUNET_ERROR_TYPE_ERROR,
                               "authorization-iban",
                               "CREDIT_IBAN");
    GNUNET_free (ctx);
    return NULL;
  }
  if (GNUNET_OK !=
      TALER_config_get_amount (cfg,
                               "authorization-iban",
                               "COST",
                               &ctx->expected_amount))
  {
    GNUNET_log_config_missing (GNUNET_ERROR_TYPE_ERROR,
                               "authorization-iban",
                               "COST");
    GNUNET_free (ctx);
    return NULL;
  }
  if (GNUNET_OK !=
      GNUNET_CONFIGURATION_get_value_string (cfg,
                                             "authorization-iban",
                                             "BUSINESS_NAME",
                                             &ctx->business_name))
  {
    GNUNET_log_config_missing (GNUNET_ERROR_TYPE_ERROR,
                               "authorization-iban",
                               "BUSINESS_NAME");
    GNUNET_free (ctx->business_iban);
    GNUNET_free (ctx);
    return NULL;
  }
  {
    char *fn;
    json_error_t err;
    char *tmp;

    tmp = GNUNET_OS_installation_get_path (GNUNET_OS_IPK_DATADIR);
    GNUNET_asprintf (&fn,
                     "%sauthorization-iban-messages.json",
                     tmp);
    GNUNET_free (tmp);
    ctx->messages = json_load_file (fn,
                                    JSON_REJECT_DUPLICATES,
                                    &err);
    if (NULL == ctx->messages)
    {
      GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                  "Failed to load messages from `%s': %s at %d:%d\n",
                  fn,
                  err.text,
                  err.line,
                  err.column);
      GNUNET_free (ctx->business_iban);
      GNUNET_free (ctx->business_name);
      GNUNET_free (fn);
      GNUNET_free (ctx);
      return NULL;
    }
    GNUNET_free (fn);
  }
  ctx->ac = ac;
  plugin = GNUNET_new (struct ANASTASIS_AuthorizationPlugin);
  plugin->payment_plugin_managed = true;
  plugin->retry_counter = UINT32_MAX; /* long polling */
  plugin->code_validity_period = CODE_VALIDITY_PERIOD;
  plugin->code_rotation_period = GNUNET_TIME_UNIT_ZERO;
  plugin->code_retransmission_frequency = GNUNET_TIME_UNIT_ZERO; /* not applicable */
  plugin->cls = ctx;
  plugin->validate = &iban_validate;
  plugin->start = &iban_start;
  plugin->process = &iban_process;
  plugin->cleanup = &iban_cleanup;

  return plugin;
}


/**
 * Unload authorization plugin
 *
 * @param cls a `struct ANASTASIS_AuthorizationPlugin`
 * @return NULL (always)
 */
void *
libanastasis_plugin_authorization_iban_done (void *cls)
{
  struct ANASTASIS_AuthorizationPlugin *plugin = cls;
  struct IBAN_Context *ctx = plugin->cls;

  json_decref (ctx->messages);
  GNUNET_free (ctx->business_iban);
  GNUNET_free (ctx->business_name);
  GNUNET_free (ctx);
  GNUNET_free (plugin);
  return NULL;
}
