/*
  This file is part of Anastasis
  Copyright (C) 2019-2021 Anastasis SARL

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
 * @file anastasis_authorization_plugin_email.c
 * @brief authorization plugin email based
 * @author Dominik Meister
 */
#include "platform.h"
#include "anastasis_authorization_plugin.h"
#include <taler/taler_mhd_lib.h>
#include <taler/taler_json_lib.h>
#include <regex.h>
#include "anastasis_util_lib.h"
#include <gnunet/gnunet_db_lib.h>
#include "anastasis_database_lib.h"

/**
 * How many retries do we allow per code?
 */
#define INITIAL_RETRY_COUNTER 3

/**
 * Saves the State of a authorization plugin.
 */
struct Email_Context
{

  /**
   * Command which is executed to run the plugin (some bash script or a
   * command line argument)
   */
  char *auth_command;

  /**
   * Regex for email address validation.
   */
  regex_t regex;

  /**
   * Messages of the plugin, read from a resource file.
   */
  json_t *messages;

  /**
   * Context we operate in.
   */
  const struct ANASTASIS_AuthorizationContext *ac;

};


/**
 * Saves the state of a authorization process
 */
struct ANASTASIS_AUTHORIZATION_State
{
  /**
   * Public key of the challenge which is authorised
   */
  struct ANASTASIS_CRYPTO_TruthUUIDP truth_uuid;

  /**
   * Code which is sent to the user.
   */
  uint64_t code;

  /**
   * Our plugin context.
   */
  struct Email_Context *ctx;

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
  char *email;

  /**
   * Handle to the helper process.
   */
  struct GNUNET_OS_Process *child;

  /**
   * Handle to wait for @e child
   */
  struct GNUNET_ChildWaitHandle *cwh;

  /**
   * Our client connection, set if suspended.
   */
  struct MHD_Connection *connection;

  /**
   * Message to send.
   */
  char *msg;

  /**
   * Offset of transmission in msg.
   */
  size_t msg_off;

  /**
   * Exit code from helper.
   */
  long unsigned int exit_code;

  /**
   * How did the helper die?
   */
  enum GNUNET_OS_ProcessStatusType pst;

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
 * i.e. @a data is a well-formed phone number for sending an SMS, or
 * a well-formed e-mail address for sending an e-mail. Not expected to
 * check that the phone number or e-mail account actually exists.
 *
 * To be possibly used before issuing a 402 payment required to the client.
 *
 * @param cls closure
 * @param connection HTTP client request (for queuing response)
 * @param mime_type mime type of @e data
 * @param data input to validate (i.e. is it a valid phone number, etc.)
 * @param data_length number of bytes in @a data
 * @return #GNUNET_OK if @a data is valid,
 *         #GNUNET_NO if @a data is invalid and a reply was successfully queued on @a connection
 *         #GNUNET_SYSERR if @a data invalid but we failed to queue a reply on @a connection
 */
static enum GNUNET_GenericReturnValue
email_validate (void *cls,
                struct MHD_Connection *connection,
                const char *mime_type,
                const char *data,
                size_t data_length)
{
  struct Email_Context *ctx = cls;
  int regex_result;
  char *phone_number;

  phone_number = GNUNET_strndup (data,
                                 data_length);
  regex_result = regexec (&ctx->regex,
                          phone_number,
                          0,
                          NULL,
                          0);
  GNUNET_free (phone_number);
  if (0 != regex_result)
  {
    if (MHD_NO ==
        TALER_MHD_reply_with_error (connection,
                                    MHD_HTTP_EXPECTATION_FAILED,
                                    TALER_EC_ANASTASIS_EMAIL_INVALID,
                                    NULL))
      return GNUNET_SYSERR;
    return GNUNET_NO;
  }
  return GNUNET_OK;
}


/**
 * Begin issuing authentication challenge to user based on @a data.
 * I.e. start to send SMS or e-mail or launch video identification.
 *
 * @param cls closure
 * @param trigger function to call when we made progress
 * @param trigger_cls closure for @a trigger
 * @param truth_uuid Identifier of the challenge, to be (if possible) included in the
 *             interaction with the user
 * @param code secret code that the user has to provide back to satisfy the challenge in
 *             the main anastasis protocol
 * @param data input to validate (i.e. is it a valid phone number, etc.)
 * @param data_length number of bytes in @a data
 * @return state to track progress on the authorization operation, NULL on failure
 */
static struct ANASTASIS_AUTHORIZATION_State *
email_start (void *cls,
             GNUNET_SCHEDULER_TaskCallback trigger,
             void *trigger_cls,
             const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
             uint64_t code,
             const void *data,
             size_t data_length)
{
  struct Email_Context *ctx = cls;
  struct ANASTASIS_AUTHORIZATION_State *as;
  enum GNUNET_DB_QueryStatus qs;

  /* If the user can show this challenge code, this
     plugin is already happy (no additional
     requirements), so mark this challenge as
     already satisfied from the start. */
  qs = ctx->ac->db->mark_challenge_code_satisfied (ctx->ac->db->cls,
                                                   truth_uuid,
                                                   code);
  if (qs <= 0)
  {
    GNUNET_break (0);
    return NULL;
  }
  as = GNUNET_new (struct ANASTASIS_AUTHORIZATION_State);
  as->trigger = trigger;
  as->trigger_cls = trigger_cls;
  as->ctx = ctx;
  as->truth_uuid = *truth_uuid;
  as->code = code;
  as->email = GNUNET_strndup (data,
                              data_length);
  return as;
}


/**
 * Function called when our Email helper has terminated.
 *
 * @param cls our `struct ANASTASIS_AUHTORIZATION_State`
 * @param type type of the process
 * @param exit_code status code of the process
 */
static void
email_done_cb (void *cls,
               enum GNUNET_OS_ProcessStatusType type,
               long unsigned int exit_code)
{
  struct ANASTASIS_AUTHORIZATION_State *as = cls;

  as->child = NULL;
  as->cwh = NULL;
  as->pst = type;
  as->exit_code = exit_code;
  MHD_resume_connection (as->connection);
  as->trigger (as->trigger_cls);
}


/**
 * Begin issuing authentication challenge to user based on @a data.
 * I.e. start to send SMS or e-mail or launch video identification.
 *
 * @param as authorization state
 * @param timeout how long do we have to produce a reply
 * @param connection HTTP client request (for queuing response, such as redirection to video portal)
 * @return state of the request
 */
static enum ANASTASIS_AUTHORIZATION_Result
email_process (struct ANASTASIS_AUTHORIZATION_State *as,
               struct GNUNET_TIME_Absolute timeout,
               struct MHD_Connection *connection)
{
  MHD_RESULT mres;
  const char *mime;
  const char *lang;

  (void) timeout;
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
  if (NULL == as->msg)
  {
    /* First time, start child process and feed pipe */
    struct GNUNET_DISK_PipeHandle *p;
    struct GNUNET_DISK_FileHandle *pipe_stdin;

    p = GNUNET_DISK_pipe (GNUNET_DISK_PF_BLOCKING_RW);
    if (NULL == p)
    {
      mres = TALER_MHD_reply_with_error (connection,
                                         MHD_HTTP_INTERNAL_SERVER_ERROR,
                                         TALER_EC_ANASTASIS_EMAIL_HELPER_EXEC_FAILED,
                                         "pipe");
      if (MHD_YES != mres)
        return ANASTASIS_AUTHORIZATION_RES_FAILED_REPLY_FAILED;
      return ANASTASIS_AUTHORIZATION_RES_FAILED;
    }
    as->child = GNUNET_OS_start_process (GNUNET_OS_INHERIT_STD_ERR,
                                         p,
                                         NULL,
                                         NULL,
                                         as->ctx->auth_command,
                                         as->ctx->auth_command,
                                         as->email,
                                         NULL);
    if (NULL == as->child)
    {
      GNUNET_DISK_pipe_close (p);
      mres = TALER_MHD_reply_with_error (connection,
                                         MHD_HTTP_INTERNAL_SERVER_ERROR,
                                         TALER_EC_ANASTASIS_EMAIL_HELPER_EXEC_FAILED,
                                         "exec");
      if (MHD_YES != mres)
        return ANASTASIS_AUTHORIZATION_RES_FAILED_REPLY_FAILED;
      return ANASTASIS_AUTHORIZATION_RES_FAILED;
    }
    pipe_stdin = GNUNET_DISK_pipe_detach_end (p,
                                              GNUNET_DISK_PIPE_END_WRITE);
    GNUNET_assert (NULL != pipe_stdin);
    GNUNET_DISK_pipe_close (p);
    GNUNET_asprintf (&as->msg,
                     get_message (as->ctx->messages,
                                  connection,
                                  "body"),
                     (unsigned long long) as->code,
                     ANASTASIS_CRYPTO_uuid2s (&as->truth_uuid));

    {
      const char *off = as->msg;
      size_t left = strlen (off);

      while (0 != left)
      {
        ssize_t ret;

        if (0 == left)
          break;
        ret = GNUNET_DISK_file_write (pipe_stdin,
                                      off,
                                      left);
        if (ret <= 0)
        {
          mres = TALER_MHD_reply_with_error (connection,
                                             MHD_HTTP_INTERNAL_SERVER_ERROR,
                                             TALER_EC_ANASTASIS_EMAIL_HELPER_EXEC_FAILED,
                                             "write");
          if (MHD_YES != mres)
            return ANASTASIS_AUTHORIZATION_RES_FAILED_REPLY_FAILED;
          return ANASTASIS_AUTHORIZATION_RES_FAILED;
        }
        as->msg_off += ret;
        off += ret;
        left -= ret;
      }
      GNUNET_DISK_file_close (pipe_stdin);
    }
    as->cwh = GNUNET_wait_child (as->child,
                                 &email_done_cb,
                                 as);
    as->connection = connection;
    MHD_suspend_connection (connection);
    return ANASTASIS_AUTHORIZATION_RES_SUSPENDED;
  }
  if (NULL != as->cwh)
  {
    /* Spurious call, why are we here? */
    GNUNET_break (0);
    MHD_suspend_connection (connection);
    return ANASTASIS_AUTHORIZATION_RES_SUSPENDED;
  }
  if ( (GNUNET_OS_PROCESS_EXITED != as->pst) ||
       (0 != as->exit_code) )
  {
    char es[32];

    GNUNET_snprintf (es,
                     sizeof (es),
                     "%u/%d",
                     (unsigned int) as->exit_code,
                     as->pst);
    mres = TALER_MHD_reply_with_error (connection,
                                       MHD_HTTP_INTERNAL_SERVER_ERROR,
                                       TALER_EC_ANASTASIS_EMAIL_HELPER_COMMAND_FAILED,
                                       es);
    if (MHD_YES != mres)
      return ANASTASIS_AUTHORIZATION_RES_FAILED_REPLY_FAILED;
    return ANASTASIS_AUTHORIZATION_RES_FAILED;
  }

  /* Build HTTP response */
  {
    struct MHD_Response *resp;
    const char *at;
    size_t len;

    at = strchr (as->email, '@');
    if (NULL == at)
      len = 0;
    else
      len = at - as->email;

    if (TALER_MHD_xmime_matches (mime,
                                 "application/json"))
    {
      char *user;

      user = GNUNET_strndup (as->email,
                             len);
      resp = TALER_MHD_MAKE_JSON_PACK (
        GNUNET_JSON_pack_uint64 ("code",
                                 TALER_EC_ANASTASIS_TRUTH_CHALLENGE_RESPONSE_REQUIRED),
        GNUNET_JSON_pack_string ("hint",
                                 TALER_ErrorCode_get_hint (
                                   TALER_EC_ANASTASIS_TRUTH_CHALLENGE_RESPONSE_REQUIRED)),
        GNUNET_JSON_pack_string ("detail",
                                 user));
      GNUNET_free (user);
    }
    else
    {
      size_t reply_len;
      char *reply;

      reply_len = GNUNET_asprintf (&reply,
                                   get_message (as->ctx->messages,
                                                connection,
                                                "instructions"),
                                   (unsigned int) len,
                                   as->email);
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
                               MHD_HTTP_FORBIDDEN,
                               resp);
    MHD_destroy_response (resp);
    if (MHD_YES != mres)
      return ANASTASIS_AUTHORIZATION_RES_SUCCESS_REPLY_FAILED;
    return ANASTASIS_AUTHORIZATION_RES_SUCCESS;
  }
}


/**
 * Free internal state associated with @a as.
 *
 * @param as state to clean up
 */
static void
email_cleanup (struct ANASTASIS_AUTHORIZATION_State *as)
{
  if (NULL != as->cwh)
  {
    GNUNET_wait_child_cancel (as->cwh);
    as->cwh = NULL;
  }
  if (NULL != as->child)
  {
    (void) GNUNET_OS_process_kill (as->child,
                                   SIGKILL);
    GNUNET_break (GNUNET_OK ==
                  GNUNET_OS_process_wait (as->child));
    as->child = NULL;
  }
  GNUNET_free (as->msg);
  GNUNET_free (as->email);
  GNUNET_free (as);
}


/**
 * Initialize email based authorization plugin
 *
 * @param cls a configuration instance
 * @return NULL on error, otherwise a `struct ANASTASIS_AuthorizationPlugin`
 */
void *
libanastasis_plugin_authorization_email_init (void *cls)
{
  const struct ANASTASIS_AuthorizationContext *ac = cls;
  struct ANASTASIS_AuthorizationPlugin *plugin;
  const struct GNUNET_CONFIGURATION_Handle *cfg = ac->cfg;
  struct Email_Context *ctx;

  ctx = GNUNET_new (struct Email_Context);
  ctx->ac = ac;
  {
    char *fn;
    json_error_t err;
    char *tmp;

    tmp = GNUNET_OS_installation_get_path (GNUNET_OS_IPK_DATADIR);
    GNUNET_asprintf (&fn,
                     "%sauthorization-email-messages.json",
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
      GNUNET_free (fn);
      GNUNET_free (ctx);
      return NULL;
    }
    GNUNET_free (fn);
  }
  {
    int regex_result;
    const char *regexp = "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,4}";

    regex_result = regcomp (&ctx->regex,
                            regexp,
                            REG_EXTENDED);
    if (0 < regex_result)
    {
      GNUNET_break (0);
      json_decref (ctx->messages);
      GNUNET_free (ctx);
      return NULL;
    }
  }

  plugin = GNUNET_new (struct ANASTASIS_AuthorizationPlugin);
  plugin->retry_counter = INITIAL_RETRY_COUNTER;
  plugin->code_validity_period = GNUNET_TIME_UNIT_DAYS;
  plugin->code_rotation_period = GNUNET_TIME_UNIT_HOURS;
  plugin->code_retransmission_frequency = GNUNET_TIME_UNIT_MINUTES;
  plugin->cls = ctx;
  plugin->validate = &email_validate;
  plugin->start = &email_start;
  plugin->process = &email_process;
  plugin->cleanup = &email_cleanup;

  if (GNUNET_OK !=
      GNUNET_CONFIGURATION_get_value_string (cfg,
                                             "authorization-email",
                                             "COMMAND",
                                             &ctx->auth_command))
  {
    GNUNET_log_config_missing (GNUNET_ERROR_TYPE_ERROR,
                               "authorization-email",
                               "COMMAND");
    regfree (&ctx->regex);
    json_decref (ctx->messages);
    GNUNET_free (ctx);
    GNUNET_free (plugin);
    return NULL;
  }
  return plugin;
}


/**
 * Unload authorization plugin
 *
 * @param cls a `struct ANASTASIS_AuthorizationPlugin`
 * @return NULL (always)
 */
void *
libanastasis_plugin_authorization_email_done (void *cls)
{
  struct ANASTASIS_AuthorizationPlugin *plugin = cls;
  struct Email_Context *ctx = plugin->cls;

  GNUNET_free (ctx->auth_command);
  regfree (&ctx->regex);
  json_decref (ctx->messages);
  GNUNET_free (ctx);
  GNUNET_free (plugin);
  return NULL;
}
