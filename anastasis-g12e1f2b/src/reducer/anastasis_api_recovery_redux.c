/*
  This file is part of Anastasis
  Copyright (C) 2020, 2021 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

  You should have received a copy of the GNU General Public License along with
  Anastasis; see the file COPYING.GPL.  If not, see <http://www.gnu.org/licenses/>
*/
/**
 * @file reducer/anastasis_api_recovery_redux.c
 * @brief anastasis reducer recovery api
 * @author Christian Grothoff
 * @author Dominik Meister
 * @author Dennis Neufeld
 */

#include <platform.h>
#include <jansson.h>
#include "anastasis_redux.h"
#include "anastasis_error_codes.h"
#include "anastasis_api_redux.h"


#define GENERATE_STRING(STRING) #STRING,
static const char *recovery_strings[] = {
  ANASTASIS_RECOVERY_STATES (GENERATE_STRING)
};
#undef GENERATE_STRING


enum ANASTASIS_RecoveryState
ANASTASIS_recovery_state_from_string_ (const char *state_string)
{
  for (enum ANASTASIS_RecoveryState i = 0;
       i < sizeof (recovery_strings) / sizeof(*recovery_strings);
       i++)
    if (0 == strcmp (state_string,
                     recovery_strings[i]))
      return i;
  return ANASTASIS_RECOVERY_STATE_INVALID;
}


const char *
ANASTASIS_recovery_state_to_string_ (enum ANASTASIS_RecoveryState rs)
{
  if ( (rs < 0) ||
       (rs >= sizeof (recovery_strings) / sizeof(*recovery_strings)) )
  {
    GNUNET_break_op (0);
    return NULL;
  }
  return recovery_strings[rs];
}


static void
set_state (json_t *state,
           enum ANASTASIS_RecoveryState new_recovery_state)
{
  GNUNET_assert (
    0 ==
    json_object_set_new (
      state,
      "recovery_state",
      json_string (ANASTASIS_recovery_state_to_string_ (new_recovery_state))));
}


/**
 * Returns an initial ANASTASIS recovery state.
 *
 * @return NULL on failure
 */
json_t *
ANASTASIS_recovery_start (const struct GNUNET_CONFIGURATION_Handle *cfg)
{
  json_t *initial_state;
  const char *external_reducer = ANASTASIS_REDUX_probe_external_reducer ();

  if (NULL != external_reducer)
  {
    int pipefd_stdout[2];
    pid_t pid = 0;
    int status;
    FILE *reducer_stdout;

    GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                "Using external reducer '%s' for recovery start status\n",
                external_reducer);

    GNUNET_assert (0 == pipe (pipefd_stdout));
    pid = fork ();
    if (pid == 0)
    {
      close (pipefd_stdout[0]);
      dup2 (pipefd_stdout[1], STDOUT_FILENO);
      execlp (external_reducer,
              external_reducer,
              "-r",
              NULL);
      GNUNET_assert (0);
    }

    close (pipefd_stdout[1]);
    reducer_stdout = fdopen (pipefd_stdout[0],
                             "r");
    {
      json_error_t err;

      initial_state = json_loadf (reducer_stdout,
                                  0,
                                  &err);

      if (NULL == initial_state)
      {
        GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                    "External reducer did not output valid JSON: %s:%d:%d %s\n",
                    err.source,
                    err.line,
                    err.column,
                    err.text);
        GNUNET_assert (0 == fclose (reducer_stdout));
        waitpid (pid, &status, 0);
        return NULL;
      }
    }

    GNUNET_assert (NULL != initial_state);
    GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                "Waiting for external reducer to terminate.\n");
    GNUNET_assert (0 == fclose (reducer_stdout));
    reducer_stdout = NULL;
    waitpid (pid, &status, 0);

    GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                "External reducer finished with exit status '%d'\n",
                status);
    return initial_state;
  }

  (void) cfg;
  initial_state = ANASTASIS_REDUX_load_continents_ ();
  if (NULL == initial_state)
    return NULL;
  set_state (initial_state,
             ANASTASIS_RECOVERY_STATE_CONTINENT_SELECTING);
  return initial_state;
}


/**
 * Context for a "select_challenge" operation.
 */
struct SelectChallengeContext
{
  /**
   * Handle we returned for cancellation of the operation.
   */
  struct ANASTASIS_ReduxAction ra;

  /**
   * UUID of the challenge selected by the user for solving.
   */
  struct ANASTASIS_CRYPTO_TruthUUIDP uuid;

  /**
   * Which timeout was set for the operation?
   */
  struct GNUNET_TIME_Relative timeout;

  /**
   * Overall recovery action.
   */
  struct ANASTASIS_Recovery *r;

  /**
   * Function to call with the next state.
   */
  ANASTASIS_ActionCallback cb;

  /**
   * Closure for @e cb.
   */
  void *cb_cls;

  /**
   * Our state.
   */
  json_t *state;

  /**
   * Our arguments (like answers to the challenge, if already provided).
   */
  json_t *args;

  /**
   * Task scheduled for delayed success reporting. Needed to make
   * sure that the solved challenge was really the final result,
   * cancelled if the solved challenge resulted in the secret being
   * recovered.
   */
  struct GNUNET_SCHEDULER_Task *delayed_report;

  /**
   * Payment secret, if we are in the "pay" state.
   */
  struct ANASTASIS_PaymentSecretP ps;

  /**
   * Application asked us to only poll for existing
   * asynchronous challenges, and not to being a
   * new one.
   */
  bool poll_only;
};


/**
 * Cleanup a select challenge context.
 *
 * @param cls a `struct SelectChallengeContext *`
 */
static void
sctx_free (void *cls)
{
  struct SelectChallengeContext *sctx = cls;

  if (NULL != sctx->r)
  {
    ANASTASIS_recovery_abort (sctx->r);
    sctx->r = NULL;
  }
  json_decref (sctx->state);
  json_decref (sctx->args);
  if (NULL != sctx->delayed_report)
  {
    GNUNET_SCHEDULER_cancel (sctx->delayed_report);
    sctx->delayed_report = NULL;
  }
  GNUNET_free (sctx);
}


/**
 * Call the action callback with an error result
 *
 * @param cb action callback to call
 * @param cb_cls closure for @a cb
 * @param rc error code to translate to JSON
 */
void
fail_by_error (ANASTASIS_ActionCallback cb,
               void *cb_cls,
               enum ANASTASIS_RecoveryStatus rc)
{
  const char *msg = NULL;
  enum TALER_ErrorCode ec = TALER_EC_INVALID;

  switch (rc)
  {
  case ANASTASIS_RS_SUCCESS:
    GNUNET_assert (0);
    break;
  case ANASTASIS_RS_POLICY_DOWNLOAD_FAILED:
    msg = gettext_noop ("download failed due to unexpected network issue");
    ec = TALER_EC_ANASTASIS_REDUCER_NETWORK_FAILED;
    break;
  case ANASTASIS_RS_POLICY_DOWNLOAD_NO_POLICY:
    GNUNET_break (0);
    msg = gettext_noop ("policy document returned was malformed");
    ec = TALER_EC_ANASTASIS_REDUCER_POLICY_MALFORMED;
    break;
  case ANASTASIS_RS_POLICY_DOWNLOAD_TOO_BIG:
    GNUNET_break (0);
    msg = gettext_noop ("policy document too large for client memory");
    ec = TALER_EC_ANASTASIS_REDUCER_POLICY_MALFORMED;
    break;
  case ANASTASIS_RS_POLICY_DOWNLOAD_INVALID_COMPRESSION:
    GNUNET_break (0);
    msg = gettext_noop ("failed to decompress policy document");
    ec = TALER_EC_ANASTASIS_REDUCER_POLICY_MALFORMED;
    break;
  case ANASTASIS_RS_POLICY_DOWNLOAD_NO_JSON:
    GNUNET_break (0);
    msg = gettext_noop ("policy document returned was not in JSON format");
    ec = TALER_EC_ANASTASIS_REDUCER_POLICY_MALFORMED;
    break;
  case ANASTASIS_RS_POLICY_MALFORMED_JSON:
    GNUNET_break (0);
    msg = gettext_noop (
      "policy document returned was not in required JSON format");
    ec = TALER_EC_ANASTASIS_REDUCER_POLICY_MALFORMED;
    break;
  case ANASTASIS_RS_POLICY_SERVER_ERROR:
    msg = gettext_noop ("Anastasis server reported transient internal error");
    ec = TALER_EC_ANASTASIS_REDUCER_BACKUP_PROVIDER_FAILED;
    break;
  case ANASTASIS_RS_POLICY_GONE:
    msg = gettext_noop ("policy document no longer exists");
    ec = TALER_EC_ANASTASIS_REDUCER_POLICY_LOOKUP_FAILED;
    break;
  case ANASTASIS_RS_POLICY_UNKNOWN:
    msg = gettext_noop ("account unknown to Anastasis server");
    ec = TALER_EC_ANASTASIS_REDUCER_POLICY_LOOKUP_FAILED;
    break;
  }
  ANASTASIS_redux_fail_ (cb,
                         cb_cls,
                         ec,
                         msg);
}


/**
 * This function is called whenever the recovery process ends.
 * On success, the secret is returned in @a secret.
 *
 * @param cls handle for the callback
 * @param rc error code
 * @param secret contains the core secret which is passed to the user
 * @param secret_size defines the size of the core secret
 */
static void
core_secret_cb (void *cls,
                enum ANASTASIS_RecoveryStatus rc,
                const void *secret,
                size_t secret_size)
{
  struct SelectChallengeContext *sctx = cls;

  sctx->r = NULL;
  if (ANASTASIS_RS_SUCCESS == rc)
  {
    json_t *jsecret;

    jsecret = json_loadb (secret,
                          secret_size,
                          JSON_REJECT_DUPLICATES,
                          NULL);
    if (NULL == jsecret)
    {
      ANASTASIS_redux_fail_ (sctx->cb,
                             sctx->cb_cls,
                             TALER_EC_ANASTASIS_REDUCER_SECRET_MALFORMED,
                             NULL);
      sctx_free (sctx);
      return;
    }
    GNUNET_assert (0 ==
                   json_object_set_new (sctx->state,
                                        "core_secret",
                                        jsecret));
    set_state (sctx->state,
               ANASTASIS_RECOVERY_STATE_RECOVERY_FINISHED);
    sctx->cb (sctx->cb_cls,
              TALER_EC_NONE,
              sctx->state);
    sctx_free (sctx);
    return;
  }
  fail_by_error (sctx->cb,
                 sctx->cb_cls,
                 rc);
  sctx_free (sctx);
}


/**
 * A challenge was solved, but we are not yet finished.
 * Report to caller that the challenge was completed.
 *
 * @param cls a `struct SelectChallengeContext`
 */
static void
report_solved (void *cls)
{
  struct SelectChallengeContext *sctx = cls;

  sctx->delayed_report = NULL;
  set_state (sctx->state,
             ANASTASIS_RECOVERY_STATE_CHALLENGE_SELECTING);
  sctx->cb (sctx->cb_cls,
            TALER_EC_NONE,
            sctx->state);
  sctx_free (sctx);
}


/**
 * Find challenge of @a uuid in @a state under "recovery_information".
 *
 * @param state the state to search
 * @param uuid the UUID to search for
 * @return NULL on error, otherwise challenge entry; RC is NOT incremented
 */
static json_t *
find_challenge_in_ri (json_t *state,
                      const struct ANASTASIS_CRYPTO_TruthUUIDP *uuid)
{
  struct ANASTASIS_CRYPTO_TruthUUIDP u;
  struct GNUNET_JSON_Specification spec[] = {
    GNUNET_JSON_spec_fixed_auto ("uuid",
                                 &u),
    GNUNET_JSON_spec_end ()
  };
  json_t *ri;
  json_t *challenges;
  json_t *challenge;
  size_t index;

  ri = json_object_get (state,
                        "recovery_information");
  if (NULL == ri)
  {
    GNUNET_break (0);
    return NULL;
  }
  challenges = json_object_get (ri,
                                "challenges");
  if (NULL == challenges)
  {
    GNUNET_break (0);
    return NULL;
  }
  json_array_foreach (challenges, index, challenge)
  {
    if (GNUNET_OK !=
        GNUNET_JSON_parse (challenge,
                           spec,
                           NULL, NULL))
    {
      GNUNET_break (0);
      return NULL;
    }
    if (0 ==
        GNUNET_memcmp (&u,
                       uuid))
    {
      return challenge;
    }
  }
  return NULL;
}


/**
 * Find challenge of @a uuid in @a state under "cs".
 *
 * @param state the state to search
 * @param uuid the UUID to search for
 * @return NULL on error, otherwise challenge entry; RC is NOT incremented
 */
static json_t *
find_challenge_in_cs (json_t *state,
                      const struct ANASTASIS_CRYPTO_TruthUUIDP *uuid)
{
  json_t *rd = json_object_get (state,
                                "recovery_document");
  json_t *cs = json_object_get (rd,
                                "cs");
  json_t *c;
  size_t off;

  json_array_foreach (cs, off, c)
  {
    struct ANASTASIS_CRYPTO_TruthUUIDP u;
    struct GNUNET_JSON_Specification spec[] = {
      GNUNET_JSON_spec_fixed_auto ("uuid",
                                   &u),
      GNUNET_JSON_spec_end ()
    };

    if (GNUNET_OK !=
        GNUNET_JSON_parse (c,
                           spec,
                           NULL, NULL))
    {
      GNUNET_break (0);
      continue;
    }
    if (0 !=
        GNUNET_memcmp (uuid,
                       &u))
      continue;
    return c;
  }
  return NULL;
}


/**
 * Defines a callback for the response status for a challenge start
 * operation.
 *
 * @param cls a `struct SelectChallengeContext *`
 * @param csr response details
 */
static void
answer_feedback_cb (
  void *cls,
  const struct ANASTASIS_ChallengeStartResponse *csr)
{
  struct SelectChallengeContext *sctx = cls;
  const struct ANASTASIS_ChallengeDetails *cd;
  char uuid[sizeof (cd->uuid) * 2];
  char *end;
  json_t *feedback;

  cd = ANASTASIS_challenge_get_details (csr->challenge);
  end = GNUNET_STRINGS_data_to_string (&cd->uuid,
                                       sizeof (cd->uuid),
                                       uuid,
                                       sizeof (uuid));
  GNUNET_assert (NULL != end);
  *end = '\0';
  feedback = json_object_get (sctx->state,
                              "challenge_feedback");
  if (NULL == feedback)
  {
    feedback = json_object ();
    GNUNET_assert (0 ==
                   json_object_set_new (sctx->state,
                                        "challenge_feedback",
                                        feedback));
  }
  switch (csr->cs)
  {
  case ANASTASIS_CHALLENGE_STATUS_SOLVED:
    {
      json_t *rd;

      rd = ANASTASIS_recovery_serialize (sctx->r);
      if (NULL == rd)
      {
        GNUNET_break (0);
        ANASTASIS_redux_fail_ (sctx->cb,
                               sctx->cb_cls,
                               TALER_EC_GENERIC_INTERNAL_INVARIANT_FAILURE,
                               "unable to serialize recovery state");
        sctx_free (sctx);
        return;
      }
      GNUNET_assert (0 ==
                     json_object_set_new (sctx->state,
                                          "recovery_document",
                                          rd));
    }
    {
      json_t *solved;

      solved = GNUNET_JSON_PACK (
        GNUNET_JSON_pack_string ("state",
                                 "solved"));
      GNUNET_assert (0 ==
                     json_object_set_new (feedback,
                                          uuid,
                                          solved));
    }
    /* Delay reporting challenge success, as we MAY still
       also see a secret recovery success (and we can only
       call the callback once) */
    sctx->delayed_report = GNUNET_SCHEDULER_add_now (&report_solved,
                                                     sctx);
    return;
  case ANASTASIS_CHALLENGE_STATUS_INSTRUCTIONS:
    {
      json_t *instructions;
      const char *mime;

      mime = csr->details.open_challenge.content_type;
      if (NULL != mime)
      {
        if ( (0 == strcasecmp (mime,
                               "text/plain")) ||
             (0 == strcasecmp (mime,
                               "text/utf8")) )
        {
          char *s = GNUNET_strndup (csr->details.open_challenge.body,
                                    csr->details.open_challenge.body_size);

          instructions = GNUNET_JSON_PACK (
            GNUNET_JSON_pack_string ("state",
                                     "hint"),
            GNUNET_JSON_pack_string ("hint",
                                     s),
            GNUNET_JSON_pack_uint64 ("http_status",
                                     (json_int_t) csr->details.open_challenge.
                                     http_status));
          GNUNET_free (s);
        }
        else if (0 == strcasecmp (mime,
                                  "application/json"))
        {
          json_t *body;

          body = json_loadb (csr->details.open_challenge.body,
                             csr->details.open_challenge.body_size,
                             JSON_REJECT_DUPLICATES,
                             NULL);
          if (NULL == body)
          {
            GNUNET_break_op (0);
            mime = NULL;
          }
          else
          {
            instructions = GNUNET_JSON_PACK (
              GNUNET_JSON_pack_string ("state",
                                       "details"),
              GNUNET_JSON_pack_object_steal ("details",
                                             body),
              GNUNET_JSON_pack_uint64 ("http_status",
                                       csr->details.open_challenge.http_status));
          }
        }
        else
        {
          /* unexpected / unsupported mime type */
          mime = NULL;
        }
      }
      if (NULL == mime)
      {
        instructions = GNUNET_JSON_PACK (
          GNUNET_JSON_pack_string ("state",
                                   "body"),
          GNUNET_JSON_pack_data_varsize ("body",
                                         csr->details.open_challenge.body,
                                         csr->details.open_challenge.body_size),
          GNUNET_JSON_pack_uint64 ("http_status",
                                   csr->details.open_challenge.http_status),
          GNUNET_JSON_pack_allow_null (
            GNUNET_JSON_pack_string ("mime_type",
                                     mime)));
      }
      GNUNET_assert (0 ==
                     json_object_set_new (feedback,
                                          uuid,
                                          instructions));
    }
    set_state (sctx->state,
               ANASTASIS_RECOVERY_STATE_CHALLENGE_SOLVING);
    sctx->cb (sctx->cb_cls,
              TALER_EC_NONE,
              sctx->state);
    sctx_free (sctx);
    return;
  case ANASTASIS_CHALLENGE_STATUS_REDIRECT_FOR_AUTHENTICATION:
    {
      json_t *redir;

      redir = GNUNET_JSON_PACK (
        GNUNET_JSON_pack_string ("state",
                                 "redirect"),
        GNUNET_JSON_pack_string ("redirect_url",
                                 csr->details.redirect_url));
      GNUNET_assert (NULL != redir);
      GNUNET_assert (0 ==
                     json_object_set_new (feedback,
                                          uuid,
                                          redir));
    }
    set_state (sctx->state,
               ANASTASIS_RECOVERY_STATE_CHALLENGE_SOLVING);
    sctx->cb (sctx->cb_cls,
              TALER_EC_NONE,
              sctx->state);
    sctx_free (sctx);
    return;
  case ANASTASIS_CHALLENGE_STATUS_PAYMENT_REQUIRED:
    {
      json_t *pay;

      pay = GNUNET_JSON_PACK (
        GNUNET_JSON_pack_string ("state",
                                 "payment"),
        GNUNET_JSON_pack_string ("taler_pay_uri",
                                 csr->details.payment_required.
                                 taler_pay_uri),
        GNUNET_JSON_pack_string ("provider",
                                 cd->provider_url),
        GNUNET_JSON_pack_data_auto (
          "payment_secret",
          &csr->details.payment_required.payment_secret));
      GNUNET_assert (0 ==
                     json_object_set_new (feedback,
                                          uuid,
                                          pay));
    }
    /* Remember payment secret for later (once application claims it paid) */
    {
      json_t *challenge = find_challenge_in_ri (sctx->state,
                                                &cd->uuid);

      GNUNET_assert (NULL != challenge);
      GNUNET_assert (0 ==
                     json_object_set_new (
                       challenge,
                       "payment_secret",
                       GNUNET_JSON_from_data_auto (
                         &csr->details.payment_required.payment_secret)));
    }
    set_state (sctx->state,
               ANASTASIS_RECOVERY_STATE_CHALLENGE_PAYING);
    sctx->cb (sctx->cb_cls,
              TALER_EC_NONE,
              sctx->state);
    sctx_free (sctx);
    return;
  case ANASTASIS_CHALLENGE_STATUS_SERVER_FAILURE:
    {
      json_t *err;

      err = GNUNET_JSON_PACK (
        GNUNET_JSON_pack_string ("state",
                                 "server-failure"),
        GNUNET_JSON_pack_uint64 ("http_status",
                                 csr->details.server_failure.
                                 http_status),
        GNUNET_JSON_pack_uint64 ("error_code",
                                 csr->details.server_failure.ec));
      GNUNET_assert (0 ==
                     json_object_set_new (feedback,
                                          uuid,
                                          err));
    }
    set_state (sctx->state,
               ANASTASIS_RECOVERY_STATE_CHALLENGE_SELECTING);
    sctx->cb (sctx->cb_cls,
              csr->details.server_failure.ec,
              sctx->state);
    sctx_free (sctx);
    return;
  case ANASTASIS_CHALLENGE_STATUS_TRUTH_UNKNOWN:
    {
      json_t *err;

      err = GNUNET_JSON_PACK (
        GNUNET_JSON_pack_string ("state",
                                 "truth-unknown"),
        GNUNET_JSON_pack_uint64 ("error_code",
                                 TALER_EC_ANASTASIS_TRUTH_UNKNOWN));
      GNUNET_assert (0 ==
                     json_object_set_new (feedback,
                                          uuid,
                                          err));
    }
    set_state (sctx->state,
               ANASTASIS_RECOVERY_STATE_CHALLENGE_SELECTING);
    sctx->cb (sctx->cb_cls,
              TALER_EC_ANASTASIS_TRUTH_UNKNOWN,
              sctx->state);
    sctx_free (sctx);
    return;
  case ANASTASIS_CHALLENGE_STATUS_RATE_LIMIT_EXCEEDED:
    {
      json_t *err;

      err = GNUNET_JSON_PACK (
        GNUNET_JSON_pack_string ("state",
                                 "rate-limit-exceeded"),
        GNUNET_JSON_pack_uint64 ("error_code",
                                 TALER_EC_ANASTASIS_TRUTH_RATE_LIMITED));
      GNUNET_assert (0 ==
                     json_object_set_new (feedback,
                                          uuid,
                                          err));
    }
    set_state (sctx->state,
               ANASTASIS_RECOVERY_STATE_CHALLENGE_SELECTING);
    sctx->cb (sctx->cb_cls,
              TALER_EC_ANASTASIS_TRUTH_RATE_LIMITED,
              sctx->state);
    sctx_free (sctx);
    return;
  case ANASTASIS_CHALLENGE_STATUS_AUTH_TIMEOUT:
    {
      json_t *err;

      err = GNUNET_JSON_PACK (
        GNUNET_JSON_pack_string ("state",
                                 "authentication-timeout"),
        GNUNET_JSON_pack_uint64 ("error_code",
                                 TALER_EC_ANASTASIS_TRUTH_AUTH_TIMEOUT));
      GNUNET_assert (0 ==
                     json_object_set_new (feedback,
                                          uuid,
                                          err));
    }
    GNUNET_break_op (0);
    set_state (sctx->state,
               ANASTASIS_RECOVERY_STATE_CHALLENGE_SELECTING);
    sctx->cb (sctx->cb_cls,
              TALER_EC_ANASTASIS_TRUTH_AUTH_TIMEOUT,
              sctx->state);
    sctx_free (sctx);
    return;

  case ANASTASIS_CHALLENGE_STATUS_EXTERNAL_INSTRUCTIONS:
    {
      const json_t *body = csr->details.external_challenge;
      const char *method;
      json_t *details;
      bool is_async = false;
      uint64_t code = 0;
      struct GNUNET_JSON_Specification spec[] = {
        GNUNET_JSON_spec_string ("method",
                                 &method),
        GNUNET_JSON_spec_mark_optional (
          GNUNET_JSON_spec_bool ("async",
                                 &is_async)),
        GNUNET_JSON_spec_mark_optional (
          GNUNET_JSON_spec_uint64 ("answer_code",
                                   &code)),
        GNUNET_JSON_spec_json ("details",
                               &details),
        GNUNET_JSON_spec_end ()
      };
      json_t *reply;

      if (GNUNET_OK !=
          GNUNET_JSON_parse (body,
                             spec,
                             NULL, NULL))
      {
        json_t *err;

        GNUNET_break_op (0);
        err = GNUNET_JSON_PACK (
          GNUNET_JSON_pack_string ("state",
                                   "server-failure"),
          GNUNET_JSON_pack_uint64 ("error_code",
                                   TALER_EC_GENERIC_REPLY_MALFORMED));
        GNUNET_assert (0 ==
                       json_object_set_new (feedback,
                                            uuid,
                                            err));
        return;
      }
      if (is_async)
      {
        json_t *c = find_challenge_in_cs (sctx->state,
                                          &cd->uuid);

        if (NULL == c)
        {
          GNUNET_break (0);
          ANASTASIS_redux_fail_ (sctx->cb,
                                 sctx->cb_cls,
                                 TALER_EC_GENERIC_INTERNAL_INVARIANT_FAILURE,
                                 NULL);
          sctx_free (sctx);
          return;
        }
        GNUNET_assert (0 ==
                       json_object_set_new (c,
                                            "async",
                                            json_true ()));
        GNUNET_assert (0 ==
                       json_object_set_new (c,
                                            "answer-pin",
                                            json_integer (code)));
      }
      reply = GNUNET_JSON_PACK (
        GNUNET_JSON_pack_string ("state",
                                 "external-instructions"),
        GNUNET_JSON_pack_string ("method",
                                 method),
        GNUNET_JSON_pack_object_incref ("details",
                                        details));
      GNUNET_JSON_parse_free (spec);
      GNUNET_assert (0 ==
                     json_object_set_new (feedback,
                                          uuid,
                                          reply));
    }
    json_object_set_new (sctx->state,
                         "selected_challenge_uuid",
                         GNUNET_JSON_from_data_auto (&cd->uuid));
    set_state (sctx->state,
               ANASTASIS_RECOVERY_STATE_CHALLENGE_SOLVING);
    sctx->cb (sctx->cb_cls,
              TALER_EC_NONE,
              sctx->state);
    sctx_free (sctx);
    return;
  }
  GNUNET_break (0);
  ANASTASIS_redux_fail_ (sctx->cb,
                         sctx->cb_cls,
                         TALER_EC_GENERIC_INTERNAL_INVARIANT_FAILURE,
                         NULL);
  sctx_free (sctx);
}


/**
 * Callback which passes back the recovery document and its possible
 * policies. Also passes back the version of the document for the user
 * to check.
 *
 * We find the selected challenge and try to answer it (or begin
 * the process).
 *
 * @param cls a `struct SelectChallengeContext *`
 * @param ri recovery information struct which contains the policies
 */
static void
solve_challenge_cb (void *cls,
                    const struct ANASTASIS_RecoveryInformation *ri)
{
  struct SelectChallengeContext *sctx = cls;
  const struct ANASTASIS_PaymentSecretP *psp = NULL;
  struct ANASTASIS_PaymentSecretP ps;
  struct GNUNET_TIME_Relative timeout = GNUNET_TIME_UNIT_ZERO;
  struct GNUNET_JSON_Specification tspec[] = {
    GNUNET_JSON_spec_mark_optional (
      GNUNET_JSON_spec_relative_time ("timeout",
                                      &timeout)),
    GNUNET_JSON_spec_end ()
  };
  struct GNUNET_JSON_Specification pspec[] = {
    GNUNET_JSON_spec_fixed_auto ("payment_secret",
                                 &ps),
    GNUNET_JSON_spec_end ()
  };
  json_t *challenge;

  if (NULL == ri)
  {
    GNUNET_break_op (0);
    ANASTASIS_redux_fail_ (sctx->cb,
                           sctx->cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "recovery information could not be deserialized");
    sctx_free (sctx);
    return;
  }

  if ( (NULL != sctx->args) &&
       (GNUNET_OK !=
        GNUNET_JSON_parse (sctx->args,
                           tspec,
                           NULL, NULL)) )
  {
    GNUNET_break_op (0);
    ANASTASIS_redux_fail_ (sctx->cb,
                           sctx->cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "'timeout' malformed");
    sctx_free (sctx);
    return;
  }

  /* resume all async, unsolved challenges */
  {
    bool poll_started = false;

    for (unsigned int i = 0; i<ri->cs_len; i++)
    {
      struct ANASTASIS_Challenge *ci = ri->cs[i];
      const struct ANASTASIS_ChallengeDetails *cd;
      json_t *challenge;
      json_t *pin;

      cd = ANASTASIS_challenge_get_details (ci);
      if (cd->solved ||
          (! cd->async) )
        continue;

      challenge = find_challenge_in_cs (sctx->state,
                                        &cd->uuid);
      if (NULL == challenge)
      {
        GNUNET_break_op (0);
        ANASTASIS_redux_fail_ (sctx->cb,
                               sctx->cb_cls,
                               TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                               "challenge not found");
        sctx_free (sctx);
        return;
      }
      pin = json_object_get (challenge,
                             "answer-pin");
      if (! json_is_integer (pin))
      {
        GNUNET_break_op (0);
        ANASTASIS_redux_fail_ (sctx->cb,
                               sctx->cb_cls,
                               TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                               "async challenge 'answer-pin' not found");
        sctx_free (sctx);
        return;
      }
      if (GNUNET_OK !=
          ANASTASIS_challenge_answer2 (ci,
                                       psp,
                                       timeout,
                                       json_integer_value (pin),
                                       &answer_feedback_cb,
                                       sctx))
      {
        ANASTASIS_redux_fail_ (sctx->cb,
                               sctx->cb_cls,
                               TALER_EC_GENERIC_INTERNAL_INVARIANT_FAILURE,
                               "Failed to begin answering asynchronous challenge");
        sctx_free (sctx);
        return;
      }
      poll_started = true;
    }

    if (sctx->poll_only)
    {
      if (! poll_started)
      {
        GNUNET_break_op (0);
        ANASTASIS_redux_fail_ (sctx->cb,
                               sctx->cb_cls,
                               TALER_EC_ANASTASIS_REDUCER_ACTION_INVALID,
                               "no challenge available for polling");
        return;
      }
      /* only polling, do not start new challenges */
      return;
    }
  } /* end resuming async challenges */

  /* Check if we got a payment_secret */
  challenge = find_challenge_in_ri (sctx->state,
                                    &sctx->uuid);
  if (NULL == challenge)
  {
    GNUNET_break_op (0);
    ANASTASIS_redux_fail_ (sctx->cb,
                           sctx->cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "challenge not found");
    sctx_free (sctx);
    return;
  }

  if (NULL !=
      json_object_get (sctx->args,
                       "payment_secret"))
  {
    /* check if we got payment secret in args */
    if (GNUNET_OK !=
        GNUNET_JSON_parse (sctx->args,
                           pspec,
                           NULL, NULL))
    {
      GNUNET_break_op (0);
      ANASTASIS_redux_fail_ (sctx->cb,
                             sctx->cb_cls,
                             TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                             "'payment_secret' malformed");
      sctx_free (sctx);
      return;
    }
    psp = &ps;
  }
  else if (NULL !=
           json_object_get (challenge,
                            "payment_secret"))
  {
    if (GNUNET_OK !=
        GNUNET_JSON_parse (challenge,
                           pspec,
                           NULL, NULL))
    {
      GNUNET_break_op (0);
      ANASTASIS_redux_fail_ (sctx->cb,
                             sctx->cb_cls,
                             TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                             "'payment_secret' malformed");
      sctx_free (sctx);
      return;
    }
    psp = &ps;
  }

  /* start or solve selected challenge */
  for (unsigned int i = 0; i<ri->cs_len; i++)
  {
    struct ANASTASIS_Challenge *ci = ri->cs[i];
    const struct ANASTASIS_ChallengeDetails *cd;
    int ret;
    json_t *c;

    cd = ANASTASIS_challenge_get_details (ci);
    if (cd->async)
      continue; /* handled above */
    if (0 !=
        GNUNET_memcmp (&sctx->uuid,
                       &cd->uuid))
      continue;
    if (cd->solved)
    {
      ANASTASIS_redux_fail_ (sctx->cb,
                             sctx->cb_cls,
                             TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                             "Selected challenge already solved");
      sctx_free (sctx);
      return;
    }
    c = find_challenge_in_cs (sctx->state,
                              &cd->uuid);
    GNUNET_assert (NULL != c);
    if (0 == strcmp ("question",
                     cd->type))
    {
      /* security question, answer must be a string */
      json_t *janswer = json_object_get (sctx->args,
                                         "answer");
      const char *answer = json_string_value (janswer);

      if (NULL == answer)
      {
        ANASTASIS_redux_fail_ (sctx->cb,
                               sctx->cb_cls,
                               TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                               "'answer' missing");
        sctx_free (sctx);
        return;
      }
      /* persist answer, in case payment is required */
      GNUNET_assert (0 ==
                     json_object_set (c,
                                      "answer",
                                      janswer));
      ret = ANASTASIS_challenge_answer (ci,
                                        psp,
                                        timeout,
                                        answer,
                                        &answer_feedback_cb,
                                        sctx);
    }
    else
    {
      /* Check if we got a PIN or a HASH */
      json_t *pin = json_object_get (sctx->args,
                                     "pin");
      json_t *hash = json_object_get (sctx->args,
                                      "hash");
      if (json_is_integer (pin))
      {
        uint64_t ianswer = json_integer_value (pin);

        /* persist answer, in case async processing
           happens via poll */
        GNUNET_assert (0 ==
                       json_object_set (c,
                                        "answer-pin",
                                        pin));
        ret = ANASTASIS_challenge_answer2 (ci,
                                           psp,
                                           timeout,
                                           ianswer,
                                           &answer_feedback_cb,
                                           sctx);
      }
      else if (NULL != hash)
      {
        struct GNUNET_HashCode hashed_answer;
        struct GNUNET_JSON_Specification spec[] = {
          GNUNET_JSON_spec_fixed_auto ("hash",
                                       &hashed_answer),
          GNUNET_JSON_spec_end ()
        };

        if (GNUNET_OK !=
            GNUNET_JSON_parse (sctx->args,
                               spec,
                               NULL, NULL))
        {
          ANASTASIS_redux_fail_ (sctx->cb,
                                 sctx->cb_cls,
                                 TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                                 "'answer' malformed");
          sctx_free (sctx);
          return;
        }
        ret = ANASTASIS_challenge_start (ci,
                                         psp,
                                         timeout,
                                         &hashed_answer,
                                         &answer_feedback_cb,
                                         sctx);
      }
      else
      {
        /* no answer provided */
        ret = ANASTASIS_challenge_start (ci,
                                         psp,
                                         timeout,
                                         NULL,   /* no answer */
                                         &answer_feedback_cb,
                                         sctx);
      }
    }
    if (GNUNET_OK != ret)
    {
      ANASTASIS_redux_fail_ (sctx->cb,
                             sctx->cb_cls,
                             TALER_EC_GENERIC_INTERNAL_INVARIANT_FAILURE,
                             "Failed to begin answering challenge");
      sctx_free (sctx);
      return;
    }
    return;   /* await answer feedback */
  }
  ANASTASIS_redux_fail_ (sctx->cb,
                         sctx->cb_cls,
                         TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                         "'uuid' not in list of challenges");
  sctx_free (sctx);
}


/**
 * Callback which passes back the recovery document and its possible
 * policies. Also passes back the version of the document for the user
 * to check.
 *
 * We find the selected challenge and try to answer it (or begin
 * the process).
 *
 * @param cls a `struct SelectChallengeContext *`
 * @param ri recovery information struct which contains the policies
 */
static void
pay_challenge_cb (void *cls,
                  const struct ANASTASIS_RecoveryInformation *ri)
{
  struct SelectChallengeContext *sctx = cls;
  json_t *challenge;

  if (NULL == ri)
  {
    GNUNET_break_op (0);
    ANASTASIS_redux_fail_ (sctx->cb,
                           sctx->cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "recovery information could not be deserialized");
    sctx_free (sctx);
    return;
  }

  challenge = find_challenge_in_ri (sctx->state,
                                    &sctx->uuid);
  if (NULL == challenge)
  {
    GNUNET_break_op (0);
    ANASTASIS_redux_fail_ (sctx->cb,
                           sctx->cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "challenge not found");
    sctx_free (sctx);
    return;
  }
  /* persist payment, in case we need to run the request again */
  GNUNET_assert (
    0 ==
    json_object_set_new (challenge,
                         "payment_secret",
                         GNUNET_JSON_from_data_auto (&sctx->ps)));

  for (unsigned int i = 0; i<ri->cs_len; i++)
  {
    struct ANASTASIS_Challenge *ci = ri->cs[i];
    const struct ANASTASIS_ChallengeDetails *cd;
    int ret;

    cd = ANASTASIS_challenge_get_details (ci);
    if (0 !=
        GNUNET_memcmp (&sctx->uuid,
                       &cd->uuid))
      continue;
    if (cd->solved)
    {
      ANASTASIS_redux_fail_ (sctx->cb,
                             sctx->cb_cls,
                             TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                             "Selected challenge already solved");
      sctx_free (sctx);
      return;
    }

    if (0 == strcmp ("question",
                     cd->type))
    {
      /* security question, answer must be a string and already ready */
      json_t *janswer = json_object_get (challenge,
                                         "answer");
      const char *answer = json_string_value (janswer);

      if (NULL == answer)
      {
        ANASTASIS_redux_fail_ (sctx->cb,
                               sctx->cb_cls,
                               TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                               "'answer' missing");
        sctx_free (sctx);
        return;
      }
      ret = ANASTASIS_challenge_answer (ci,
                                        &sctx->ps,
                                        sctx->timeout,
                                        answer,
                                        &answer_feedback_cb,
                                        sctx);
    }
    else
    {
      ret = ANASTASIS_challenge_start (ci,
                                       &sctx->ps,
                                       sctx->timeout,
                                       NULL,   /* no answer yet */
                                       &answer_feedback_cb,
                                       sctx);
    }
    if (GNUNET_OK != ret)
    {
      ANASTASIS_redux_fail_ (sctx->cb,
                             sctx->cb_cls,
                             TALER_EC_GENERIC_INTERNAL_INVARIANT_FAILURE,
                             "Failed to begin answering challenge");
      sctx_free (sctx);
      return;
    }
    return;   /* await answer feedback */
  }
  ANASTASIS_redux_fail_ (sctx->cb,
                         sctx->cb_cls,
                         TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                         "'uuid' not in list of challenges");
  sctx_free (sctx);
}


/**
 * The user selected a challenge to be solved. Begin the solving
 * process.
 *
 * @param[in] state we are in
 * @param arguments our arguments with the solution
 * @param cb functiont o call with the new state
 * @param cb_cls closure for @a cb
 * @return handle to cancel challenge selection step
 */
static struct ANASTASIS_ReduxAction *
solve_challenge (json_t *state,
                 const json_t *arguments,
                 ANASTASIS_ActionCallback cb,
                 void *cb_cls)
{
  struct SelectChallengeContext *sctx
    = GNUNET_new (struct SelectChallengeContext);
  json_t *rd;
  struct GNUNET_JSON_Specification spec[] = {
    GNUNET_JSON_spec_fixed_auto ("selected_challenge_uuid",
                                 &sctx->uuid),
    GNUNET_JSON_spec_end ()
  };

  if (NULL == arguments)
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "arguments missing");
    return NULL;
  }
  if (GNUNET_OK !=
      GNUNET_JSON_parse (state,
                         spec,
                         NULL, NULL))
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'selected_challenge_uuid' missing");
    return NULL;
  }
  rd = json_object_get (state,
                        "recovery_document");
  if (NULL == rd)
  {
    GNUNET_break_op (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "solve_challenge");
    return NULL;
  }
  sctx->cb = cb;
  sctx->cb_cls = cb_cls;
  sctx->state = json_incref (state);
  sctx->args = json_incref ((json_t*) arguments);
  sctx->r = ANASTASIS_recovery_deserialize (ANASTASIS_REDUX_ctx_,
                                            rd,
                                            &solve_challenge_cb,
                                            sctx,
                                            &core_secret_cb,
                                            sctx);
  if (NULL == sctx->r)
  {
    json_decref (sctx->state);
    json_decref (sctx->args);
    GNUNET_free (sctx);
    GNUNET_break_op (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'recovery_document' invalid");
    return NULL;
  }
  sctx->ra.cleanup = &sctx_free;
  sctx->ra.cleanup_cls = sctx;
  return &sctx->ra;
}


/**
 * The user asked for us to poll on pending
 * asynchronous challenges to see if they have
 * now completed / been satisfied.
 *
 * @param[in] state we are in
 * @param arguments our arguments with the solution
 * @param cb functiont o call with the new state
 * @param cb_cls closure for @a cb
 * @return handle to cancel challenge selection step
 */
static struct ANASTASIS_ReduxAction *
poll_challenges (json_t *state,
                 const json_t *arguments,
                 ANASTASIS_ActionCallback cb,
                 void *cb_cls)
{
  struct SelectChallengeContext *sctx
    = GNUNET_new (struct SelectChallengeContext);
  json_t *rd;

  rd = json_object_get (state,
                        "recovery_document");
  if (NULL == rd)
  {
    GNUNET_break_op (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "poll_challenges");
    return NULL;
  }
  sctx->poll_only = true;
  sctx->cb = cb;
  sctx->cb_cls = cb_cls;
  sctx->state = json_incref (state);
  sctx->args = json_incref ((json_t*) arguments);
  sctx->r = ANASTASIS_recovery_deserialize (ANASTASIS_REDUX_ctx_,
                                            rd,
                                            &solve_challenge_cb,
                                            sctx,
                                            &core_secret_cb,
                                            sctx);
  if (NULL == sctx->r)
  {
    json_decref (sctx->state);
    json_decref (sctx->args);
    GNUNET_free (sctx);
    GNUNET_break_op (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'recovery_document' invalid");
    return NULL;
  }
  sctx->ra.cleanup = &sctx_free;
  sctx->ra.cleanup_cls = sctx;
  return &sctx->ra;
}


/**
 * The user selected a challenge to be solved. Handle the payment
 * process.
 *
 * @param[in] state we are in
 * @param arguments our arguments with the solution
 * @param cb functiont o call with the new state
 * @param cb_cls closure for @a cb
 * @return handle to cancel challenge selection step
 */
static struct ANASTASIS_ReduxAction *
pay_challenge (json_t *state,
               const json_t *arguments,
               ANASTASIS_ActionCallback cb,
               void *cb_cls)
{
  struct SelectChallengeContext *sctx
    = GNUNET_new (struct SelectChallengeContext);
  json_t *rd;
  struct GNUNET_TIME_Relative timeout = GNUNET_TIME_UNIT_ZERO;
  struct GNUNET_JSON_Specification spec[] = {
    GNUNET_JSON_spec_fixed_auto ("selected_challenge_uuid",
                                 &sctx->uuid),
    GNUNET_JSON_spec_end ()
  };
  struct GNUNET_JSON_Specification aspec[] = {
    GNUNET_JSON_spec_mark_optional (
      GNUNET_JSON_spec_relative_time ("timeout",
                                      &timeout)),
    GNUNET_JSON_spec_fixed_auto ("payment_secret",
                                 &sctx->ps),
    GNUNET_JSON_spec_end ()
  };

  if (NULL == arguments)
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "arguments missing");
    return NULL;
  }
  if (GNUNET_OK !=
      GNUNET_JSON_parse (arguments,
                         aspec,
                         NULL, NULL))
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "'payment_secret' missing");
    return NULL;
  }
  if (GNUNET_OK !=
      GNUNET_JSON_parse (state,
                         spec,
                         NULL, NULL))
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'selected_challenge_uuid' missing");
    return NULL;
  }
  rd = json_object_get (state,
                        "recovery_document");
  if (NULL == rd)
  {
    GNUNET_break_op (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "pay_challenge");
    return NULL;
  }
  sctx->timeout = timeout;
  sctx->cb = cb;
  sctx->cb_cls = cb_cls;
  sctx->state = json_incref (state);
  sctx->args = json_incref ((json_t*) arguments);
  sctx->r = ANASTASIS_recovery_deserialize (ANASTASIS_REDUX_ctx_,
                                            rd,
                                            &pay_challenge_cb,
                                            sctx,
                                            &core_secret_cb,
                                            sctx);
  if (NULL == sctx->r)
  {
    json_decref (sctx->state);
    json_decref (sctx->args);
    GNUNET_free (sctx);
    GNUNET_break_op (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'recovery_document' invalid");
    return NULL;
  }
  sctx->ra.cleanup = &sctx_free;
  sctx->ra.cleanup_cls = sctx;
  return &sctx->ra;
}


/**
 * Callback which passes back the recovery document and its possible
 * policies. Also passes back the version of the document for the user
 * to check.
 *
 * We find the selected challenge and try to answer it (or begin
 * the process).
 *
 * @param cls a `struct SelectChallengeContext *`
 * @param ri recovery information struct which contains the policies
 */
static void
select_challenge_cb (void *cls,
                     const struct ANASTASIS_RecoveryInformation *ri)
{
  struct SelectChallengeContext *sctx = cls;
  const struct ANASTASIS_PaymentSecretP *psp = NULL;
  struct ANASTASIS_PaymentSecretP ps;
  struct GNUNET_TIME_Relative timeout = GNUNET_TIME_UNIT_ZERO;
  struct GNUNET_JSON_Specification tspec[] = {
    GNUNET_JSON_spec_mark_optional (
      GNUNET_JSON_spec_relative_time ("timeout",
                                      &timeout)),
    GNUNET_JSON_spec_end ()
  };
  struct GNUNET_JSON_Specification pspec[] = {
    GNUNET_JSON_spec_fixed_auto ("payment_secret",
                                 &ps),
    GNUNET_JSON_spec_end ()
  };


  if (NULL == ri)
  {
    GNUNET_break_op (0);
    ANASTASIS_redux_fail_ (sctx->cb,
                           sctx->cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "recovery information could not be deserialized");
    sctx_free (sctx);
    return;
  }

  if (GNUNET_OK !=
      GNUNET_JSON_parse (sctx->args,
                         tspec,
                         NULL, NULL))
  {
    GNUNET_break_op (0);
    ANASTASIS_redux_fail_ (sctx->cb,
                           sctx->cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "'timeout' malformed");
    sctx_free (sctx);
    return;
  }

  /* NOTE: do we need both ways to pass payment secrets? */
  if (NULL !=
      json_object_get (sctx->args,
                       "payment_secret"))
  {
    /* check if we got payment secret in args */
    if (GNUNET_OK !=
        GNUNET_JSON_parse (sctx->args,
                           pspec,
                           NULL, NULL))
    {
      GNUNET_break_op (0);
      ANASTASIS_redux_fail_ (sctx->cb,
                             sctx->cb_cls,
                             TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                             "'payment_secret' malformed");
      sctx_free (sctx);
      return;
    }
    psp = &ps;
  }
  else
  {
    /* Check if we got a payment_secret in state */
    json_t *challenge = find_challenge_in_ri (sctx->state,
                                              &sctx->uuid);

    if (NULL == challenge)
    {
      GNUNET_break_op (0);
      ANASTASIS_redux_fail_ (sctx->cb,
                             sctx->cb_cls,
                             TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                             "challenge not found");
      sctx_free (sctx);
      return;
    }
    if (NULL !=
        json_object_get (challenge,
                         "payment_secret"))
    {
      if (GNUNET_OK !=
          GNUNET_JSON_parse (challenge,
                             pspec,
                             NULL, NULL))
      {
        GNUNET_break_op (0);
        ANASTASIS_redux_fail_ (sctx->cb,
                               sctx->cb_cls,
                               TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                               "'payment_secret' malformed");
        sctx_free (sctx);
        return;
      }
      psp = &ps;
    }
  }

  for (unsigned int i = 0; i<ri->cs_len; i++)
  {
    struct ANASTASIS_Challenge *ci = ri->cs[i];
    const struct ANASTASIS_ChallengeDetails *cd;
    int ret;

    cd = ANASTASIS_challenge_get_details (ci);
    if (0 !=
        GNUNET_memcmp (&sctx->uuid,
                       &cd->uuid))
      continue;
    if (cd->solved)
    {
      ANASTASIS_redux_fail_ (sctx->cb,
                             sctx->cb_cls,
                             TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                             "Selected challenge already solved");
      sctx_free (sctx);
      return;
    }
    GNUNET_assert (
      0 ==
      json_object_set_new (sctx->state,
                           "selected_challenge_uuid",
                           GNUNET_JSON_from_data_auto (&cd->uuid)));
    if ( (0 == strcmp ("question",
                       cd->type)) ||
         (0 == strcmp ("totp",
                       cd->type)) )
    {
      /* security question or TOTP:
         immediately request user to answer it */
      set_state (sctx->state,
                 ANASTASIS_RECOVERY_STATE_CHALLENGE_SOLVING);
      sctx->cb (sctx->cb_cls,
                TALER_EC_NONE,
                sctx->state);
      sctx_free (sctx);
      return;
    }
    /* trigger challenge */
    {
      json_t *c = find_challenge_in_cs (sctx->state,
                                        &cd->uuid);
      json_t *pin = json_object_get (c,
                                     "answer-pin");

      if (NULL != pin)
      {
        uint64_t ianswer = json_integer_value (pin);

        ret = ANASTASIS_challenge_answer2 (ci,
                                           psp,
                                           timeout,
                                           ianswer,
                                           &answer_feedback_cb,
                                           sctx);
      }
      else
      {
        ret = ANASTASIS_challenge_start (ci,
                                         psp,
                                         timeout,
                                         NULL, /* no answer */
                                         &answer_feedback_cb,
                                         sctx);
      }
    }
    if (GNUNET_OK != ret)
    {
      ANASTASIS_redux_fail_ (sctx->cb,
                             sctx->cb_cls,
                             TALER_EC_GENERIC_INTERNAL_INVARIANT_FAILURE,
                             "Failed to begin answering challenge");
      sctx_free (sctx);
      return;
    }
    return;   /* await answer feedback */
  }
  ANASTASIS_redux_fail_ (sctx->cb,
                         sctx->cb_cls,
                         TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                         "'uuid' not in list of challenges");
  sctx_free (sctx);
}


/**
 * The user selected a challenge to be solved. Begin the solving
 * process.
 *
 * @param[in] state we are in
 * @param arguments our arguments with the solution
 * @param cb functiont o call with the new state
 * @param cb_cls closure for @a cb
 * @return handle to cancel challenge selection step
 */
static struct ANASTASIS_ReduxAction *
select_challenge (json_t *state,
                  const json_t *arguments,
                  ANASTASIS_ActionCallback cb,
                  void *cb_cls)
{
  struct SelectChallengeContext *sctx
    = GNUNET_new (struct SelectChallengeContext);
  json_t *rd;
  struct GNUNET_JSON_Specification spec[] = {
    GNUNET_JSON_spec_fixed_auto ("uuid",
                                 &sctx->uuid),
    GNUNET_JSON_spec_end ()
  };

  if (NULL == arguments)
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "arguments missing");
    return NULL;
  }
  if (GNUNET_OK !=
      GNUNET_JSON_parse (arguments,
                         spec,
                         NULL, NULL))
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "'uuid' missing");
    return NULL;
  }
  rd = json_object_get (state,
                        "recovery_document");
  if (NULL == rd)
  {
    GNUNET_break_op (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "select_challenge");
    return NULL;
  }
  sctx->cb = cb;
  sctx->cb_cls = cb_cls;
  sctx->state = json_incref (state);
  sctx->args = json_incref ((json_t*) arguments);
  sctx->r = ANASTASIS_recovery_deserialize (ANASTASIS_REDUX_ctx_,
                                            rd,
                                            &select_challenge_cb,
                                            sctx,
                                            &core_secret_cb,
                                            sctx);
  if (NULL == sctx->r)
  {
    json_decref (sctx->state);
    json_decref (sctx->args);
    GNUNET_free (sctx);
    GNUNET_break_op (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'recovery_document' invalid");
    return NULL;
  }
  sctx->ra.cleanup = &sctx_free;
  sctx->ra.cleanup_cls = sctx;
  return &sctx->ra;
}


/**
 * The user pressed "back" during challenge solving.
 * Transition back to selecting another challenge.
 *
 * @param[in] state we are in
 * @param arguments our arguments (unused)
 * @param cb functiont o call with the new state
 * @param cb_cls closure for @a cb
 * @return NULL (synchronous operation)
 */
static struct ANASTASIS_ReduxAction *
back_challenge_solving (json_t *state,
                        const json_t *arguments,
                        ANASTASIS_ActionCallback cb,
                        void *cb_cls)
{
  (void) arguments;
  GNUNET_assert (0 ==
                 json_object_del (state,
                                  "selected_challenge_uuid"));
  set_state (state,
             ANASTASIS_RECOVERY_STATE_CHALLENGE_SELECTING);
  cb (cb_cls,
      TALER_EC_NONE,
      state);
  return NULL;
}


/**
 * The user wants us to change the policy version. Download another version.
 *
 * @param[in] state we are in
 * @param arguments our arguments with the solution
 * @param cb functiont o call with the new state
 * @param cb_cls closure for @a cb
 * @return handle to cancel challenge selection step
 */
static struct ANASTASIS_ReduxAction *
change_version (json_t *state,
                const json_t *arguments,
                ANASTASIS_ActionCallback cb,
                void *cb_cls)
{
  uint64_t version;
  const char *provider_url;
  struct GNUNET_JSON_Specification spec[] = {
    GNUNET_JSON_spec_uint64 ("version",
                             &version),
    GNUNET_JSON_spec_string ("provider_url",
                             &provider_url),
    GNUNET_JSON_spec_end ()
  };
  json_t *ia;
  json_t *args;
  struct ANASTASIS_ReduxAction *ra;

  if (GNUNET_OK !=
      GNUNET_JSON_parse (arguments,
                         spec,
                         NULL, NULL))
  {
    GNUNET_break (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "'version' invalid");
    return NULL;
  }
  GNUNET_assert (NULL != provider_url);
  ia = json_object_get (state,
                        "identity_attributes");
  if (NULL == ia)
  {
    GNUNET_break (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "'identity_attributes' missing");
    return NULL;
  }
  args = GNUNET_JSON_PACK (
    GNUNET_JSON_pack_uint64 ("version",
                             version),
    GNUNET_JSON_pack_object_incref ("identity_attributes",
                                    (json_t *) ia),
    GNUNET_JSON_pack_string ("provider_url",
                             provider_url));
  if (NULL == args)
  {
    GNUNET_break (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           NULL);
    return NULL;
  }
  ra = ANASTASIS_REDUX_recovery_challenge_begin_ (state,
                                                  args,
                                                  cb,
                                                  cb_cls);
  json_decref (args);
  return ra;
}


/**
 * DispatchHandler/Callback function which is called for a
 * "next" action in "secret_selecting" state.
 *
 * @param state state to operate on
 * @param arguments arguments to use for operation on state
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 * @return NULL
 */
static struct ANASTASIS_ReduxAction *
done_secret_selecting (json_t *state,
                       const json_t *arguments,
                       ANASTASIS_ActionCallback cb,
                       void *cb_cls)
{
  const json_t *ri;

  ri = json_object_get (state,
                        "recovery_information");
  if ( (NULL == ri) ||
       (NULL == json_object_get (ri,
                                 "challenges")) )
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID_FOR_STATE,
                           "no valid version selected");
    return NULL;
  }
  set_state (state,
             ANASTASIS_RECOVERY_STATE_CHALLENGE_SELECTING);
  cb (cb_cls,
      TALER_EC_NONE,
      state);
  return NULL;
}


/**
 * Signature of callback function that implements a state transition.
 *
 *  @param state current state
 *  @param arguments arguments for the state transition
 *  @param cb function to call when done
 *  @param cb_cls closure for @a cb
 */
typedef struct ANASTASIS_ReduxAction *
(*DispatchHandler)(json_t *state,
                   const json_t *arguments,
                   ANASTASIS_ActionCallback cb,
                   void *cb_cls);


struct ANASTASIS_ReduxAction *
ANASTASIS_recovery_action_ (json_t *state,
                            const char *action,
                            const json_t *arguments,
                            ANASTASIS_ActionCallback cb,
                            void *cb_cls)
{
  struct Dispatcher
  {
    enum ANASTASIS_RecoveryState recovery_state;
    const char *recovery_action;
    DispatchHandler fun;
  } dispatchers[] = {
    {
      ANASTASIS_RECOVERY_STATE_SECRET_SELECTING,
      "change_version",
      &change_version
    },
    {
      ANASTASIS_RECOVERY_STATE_SECRET_SELECTING,
      "next",
      &done_secret_selecting
    },
    {
      ANASTASIS_RECOVERY_STATE_SECRET_SELECTING,
      "back",
      &ANASTASIS_back_generic_decrement_
    },
    {
      ANASTASIS_RECOVERY_STATE_CHALLENGE_SELECTING,
      "select_challenge",
      &select_challenge
    },
    {
      ANASTASIS_RECOVERY_STATE_CHALLENGE_SELECTING,
      "poll",
      &poll_challenges
    },
    {
      ANASTASIS_RECOVERY_STATE_CHALLENGE_SELECTING,
      "back",
      &ANASTASIS_back_generic_decrement_
    },
    {
      ANASTASIS_RECOVERY_STATE_CHALLENGE_PAYING,
      "pay",
      &pay_challenge
    },
    {
      ANASTASIS_RECOVERY_STATE_CHALLENGE_PAYING,
      "back",
      &ANASTASIS_back_generic_decrement_
    },
    {
      ANASTASIS_RECOVERY_STATE_CHALLENGE_SOLVING,
      "solve_challenge",
      &solve_challenge
    },
    {
      ANASTASIS_RECOVERY_STATE_CHALLENGE_SOLVING,
      "back",
      &back_challenge_solving
    },
    { ANASTASIS_RECOVERY_STATE_INVALID, NULL, NULL }
  };
  const char *s = json_string_value (json_object_get (state,
                                                      "recovery_state"));
  enum ANASTASIS_RecoveryState rs;

  GNUNET_assert (NULL != s);
  rs = ANASTASIS_recovery_state_from_string_ (s);
  if (ANASTASIS_RECOVERY_STATE_INVALID == rs)
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'recovery_state' field invalid");
    return NULL;
  }
  for (unsigned int i = 0; NULL != dispatchers[i].fun; i++)
  {
    if ( (rs == dispatchers[i].recovery_state) &&
         (0 == strcmp (action,
                       dispatchers[i].recovery_action)) )
    {
      return dispatchers[i].fun (state,
                                 arguments,
                                 cb,
                                 cb_cls);
    }
  }
  ANASTASIS_redux_fail_ (cb,
                         cb_cls,
                         TALER_EC_ANASTASIS_REDUCER_ACTION_INVALID,
                         action);
  return NULL;
}


/**
 * State for a "recover secret" CMD.
 */
struct RecoverSecretState;


/**
 * State for a "policy download" as part of a recovery operation.
 */
struct PolicyDownloadEntry
{

  /**
   * Kept in a DLL.
   */
  struct PolicyDownloadEntry *prev;

  /**
   * Kept in a DLL.
   */
  struct PolicyDownloadEntry *next;

  /**
   * Backend we are querying.
   */
  char *backend_url;

  /**
   * Salt to be used to derive the id for this provider
   */
  struct ANASTASIS_CRYPTO_ProviderSaltP salt;

  /**
   * Context we operate in.
   */
  struct RecoverSecretState *rss;

  /**
   * The /policy GET operation handle.
   */
  struct ANASTASIS_Recovery *recovery;

};


/**
 * Entry in the list of all known applicable Anastasis providers.
 * Used to wait for it to complete downloading /config.
 */
struct RecoveryStartStateProviderEntry
{
  /**
   * Kept in a DLL.
   */
  struct RecoveryStartStateProviderEntry *next;

  /**
   * Kept in a DLL.
   */
  struct RecoveryStartStateProviderEntry *prev;

  /**
   * Main operation this entry is part of.
   */
  struct RecoverSecretState *rss;

  /**
   * Resulting provider information, NULL if not (yet) available.
   */
  json_t *istate;

  /**
   * Ongoing reducer action to obtain /config, NULL if completed.
   */
  struct ANASTASIS_ReduxAction *ra;

  /**
   * Final result of the operation (once completed).
   */
  enum TALER_ErrorCode ec;
};


/**
 * State for a "recover secret" CMD.
 */
struct RecoverSecretState
{

  /**
   * Redux action handle associated with this state.
   */
  struct ANASTASIS_ReduxAction ra;

  /**
   * Head of list of provider /config operations we are doing.
   */
  struct RecoveryStartStateProviderEntry *pe_head;

  /**
   * Tail of list of provider /config operations we are doing.
   */
  struct RecoveryStartStateProviderEntry *pe_tail;

  /**
   * Identification data from the user
   */
  json_t *id_data;

  /**
   * Head of DLL of policy downloads.
   */
  struct PolicyDownloadEntry *pd_head;

  /**
   * Tail of DLL of policy downloads.
   */
  struct PolicyDownloadEntry *pd_tail;

  /**
   * Reference to our state.
   */
  json_t *state;

  /**
   * callback to call during/after operation
   */
  ANASTASIS_ActionCallback cb;

  /**
   * closure for action callback @e cb.
   */
  void *cb_cls;

  /**
   * Set if recovery must be done with this provider.
   */
  char *provider_url;

  /**
   * version of the recovery document to request.
   */
  unsigned int version;

  /**
   * Number of provider /config operations in @e ba_head that
   * are still awaiting completion.
   */
  unsigned int pending;

  /**
   * Is @e version set?
   */
  bool have_version;
};


/**
 * Function to free a `struct RecoverSecretState`
 *
 * @param cls must be a `struct RecoverSecretState`
 */
static void
free_rss (void *cls)
{
  struct RecoverSecretState *rss = cls;
  struct PolicyDownloadEntry *pd;
  struct RecoveryStartStateProviderEntry *pe;

  while (NULL != (pe = rss->pe_head))
  {
    GNUNET_CONTAINER_DLL_remove (rss->pe_head,
                                 rss->pe_tail,
                                 pe);
    ANASTASIS_redux_action_cancel (pe->ra);
    rss->pending--;
    GNUNET_free (pe);
  }
  while (NULL != (pd = rss->pd_head))
  {
    GNUNET_CONTAINER_DLL_remove (rss->pd_head,
                                 rss->pd_tail,
                                 pd);
    if (NULL != pd->recovery)
    {
      ANASTASIS_recovery_abort (pd->recovery);
      pd->recovery = NULL;
    }
    GNUNET_free (pd->backend_url);
    GNUNET_free (pd);
  }
  json_decref (rss->state);
  json_decref (rss->id_data);
  GNUNET_assert (0 == rss->pending);
  GNUNET_free (rss->provider_url);
  GNUNET_free (rss);
}


/**
 * This function is called whenever the recovery process ends.
 * In this case, that should not be possible as this callback
 * is used before we even begin with the challenges. So if
 * we are called, it is because of some fatal error.
 *
 * @param cls a `struct PolicyDownloadEntry`
 * @param rc error code
 * @param secret contains the core secret which is passed to the user
 * @param secret_size defines the size of the core secret
 */
static void
core_early_secret_cb (void *cls,
                      enum ANASTASIS_RecoveryStatus rc,
                      const void *secret,
                      size_t secret_size)
{
  struct PolicyDownloadEntry *pd = cls;
  struct RecoverSecretState *rss = pd->rss;

  pd->recovery = NULL;
  GNUNET_assert (NULL == secret);
  GNUNET_CONTAINER_DLL_remove (rss->pd_head,
                               rss->pd_tail,
                               pd);
  GNUNET_free (pd->backend_url);
  GNUNET_free (pd);
  if (NULL != rss->pd_head)
    return;   /* wait for another one */
  /* all failed! report failure! */
  GNUNET_assert (ANASTASIS_RS_SUCCESS != rc);
  fail_by_error (rss->cb,
                 rss->cb_cls,
                 rc);
  rss->cb = NULL;
  free_rss (rss);
}


/**
 * Determine recovery @a cost of solving a challenge of type @a type
 * at @a provider_url by inspecting @a state.
 *
 * @param state the state to inspect
 * @param provider_url the provider to lookup config info from
 * @param type the method to lookup the cost of
 * @param[out] cost the recovery cost to return
 * @return #GNUNET_OK on success, #GNUNET_NO if not found, #GNUNET_SYSERR on state error
 */
static int
lookup_cost (const json_t *state,
             const char *provider_url,
             const char *type,
             struct TALER_Amount *cost)
{
  const json_t *providers;
  const json_t *provider;
  const json_t *methods;

  providers = json_object_get (state,
                               "authentication_providers");
  if (NULL == providers)
  {
    GNUNET_break (0);
    return GNUNET_SYSERR;
  }
  provider = json_object_get (providers,
                              provider_url);
  if (NULL == provider)
  {
    GNUNET_break (0);
    return GNUNET_SYSERR;
  }
  methods = json_object_get (provider,
                             "methods");
  if ( (NULL == methods) ||
       (! json_is_array (methods)) )
  {
    GNUNET_break (0);
    return GNUNET_SYSERR;
  }
  {
    size_t index;
    json_t *method;

    json_array_foreach (methods, index, method) {
      const char *t;
      struct GNUNET_JSON_Specification spec[] = {
        GNUNET_JSON_spec_string ("type",
                                 &t),
        TALER_JSON_spec_amount_any ("usage_fee",
                                    cost),
        GNUNET_JSON_spec_end ()
      };

      if (GNUNET_OK !=
          GNUNET_JSON_parse (method,
                             spec,
                             NULL, NULL))
      {
        GNUNET_break (0);
        continue;
      }
      if (0 == strcmp (t,
                       type))
        return GNUNET_OK;
    }
  }
  return GNUNET_NO; /* not found */
}


/**
 * We failed to download a policy. Show an error to the user and
 * allow the user to specify alternative providers and/or policy
 * versions.
 *
 * @param[in] rss state to fail with the policy download
 * @param offline true of the reason to show is that all providers
 *        were offline / did not return a salt to us
 */
static void
return_no_policy (struct RecoverSecretState *rss,
                  bool offline)
{
  json_t *estate;
  const char *detail;
  enum TALER_ErrorCode ec;

  ec = TALER_EC_ANASTASIS_REDUCER_NETWORK_FAILED;
  GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
              "No provider online, need user to manually specify providers!\n");

  if (offline)
    detail = "could not contact provider (offline)";
  else
    detail = "provider does not know you";

  estate = GNUNET_JSON_PACK (
    GNUNET_JSON_pack_allow_null (
      GNUNET_JSON_pack_string ("detail",
                               detail)),
    GNUNET_JSON_pack_uint64 ("code",
                             ec),
    GNUNET_JSON_pack_string ("hint",
                             TALER_ErrorCode_get_hint (ec)));
  rss->cb (rss->cb_cls,
           ec,
           estate);
  free_rss (rss);
}


/**
 * Callback which passes back the recovery document and its possible
 * policies. Also passes back the version of the document for the user
 * to check.
 *
 * Once the first policy lookup succeeds, we update our state and
 * cancel all of the others, passing the obtained recovery information
 * back to the user.
 *
 * @param cls closure for the callback
 * @param ri recovery information struct which contains the policies
 */
static void
policy_lookup_cb (void *cls,
                  const struct ANASTASIS_RecoveryInformation *ri)
{
  struct PolicyDownloadEntry *pd = cls;
  struct RecoverSecretState *rss = pd->rss;
  json_t *policies;
  json_t *challenges;
  json_t *recovery_information;

  if (NULL == ri)
  {
    /* Woopsie, failed hard. */
    GNUNET_CONTAINER_DLL_remove (rss->pd_head,
                                 rss->pd_tail,
                                 pd);
    ANASTASIS_recovery_abort (pd->recovery);
    GNUNET_free (pd->backend_url);
    GNUNET_free (pd);
    if (NULL != rss->pd_head)
      return; /* wait for another one */
    /* all failed! report failure! */
    return_no_policy (rss,
                      false);
    return;
  }
  policies = json_array ();
  GNUNET_assert (NULL != policies);
  for (unsigned int i = 0; i<ri->dps_len; i++)
  {
    struct ANASTASIS_DecryptionPolicy *dps = ri->dps[i];
    json_t *pchallenges;

    pchallenges = json_array ();
    GNUNET_assert (NULL != pchallenges);
    for (unsigned int j = 0; j<dps->challenges_length; j++)
    {
      struct ANASTASIS_Challenge *c = dps->challenges[j];
      const struct ANASTASIS_ChallengeDetails *cd;
      json_t *cj;

      cd = ANASTASIS_challenge_get_details (c);
      cj = GNUNET_JSON_PACK (
        GNUNET_JSON_pack_data_auto ("uuid",
                                    &cd->uuid));
      GNUNET_assert (0 ==
                     json_array_append_new (pchallenges,
                                            cj));

    }
    GNUNET_assert (0 ==
                   json_array_append_new (policies,
                                          pchallenges));
  } /* end for all policies */
  challenges = json_array ();
  GNUNET_assert (NULL != challenges);
  for (unsigned int i = 0; i<ri->cs_len; i++)
  {
    struct ANASTASIS_Challenge *c = ri->cs[i];
    const struct ANASTASIS_ChallengeDetails *cd;
    json_t *cj;
    struct TALER_Amount cost;
    int ret;

    cd = ANASTASIS_challenge_get_details (c);
    ret = lookup_cost (rss->state,
                       cd->provider_url,
                       cd->type,
                       &cost);
    if (GNUNET_SYSERR == ret)
    {
      json_decref (challenges);
      json_decref (policies);
      ANASTASIS_redux_fail_ (rss->cb,
                             rss->cb_cls,
                             TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                             "failed to 'lookup_cost'");
      free_rss (rss);
      return;
    }

    cj = GNUNET_JSON_PACK (
      GNUNET_JSON_pack_data_auto ("uuid",
                                  &cd->uuid),
      TALER_JSON_pack_amount ("cost",
                              (GNUNET_NO == ret)
                              ? NULL
                              : &cost),
      GNUNET_JSON_pack_string ("type",
                               cd->type),
      GNUNET_JSON_pack_string ("uuid-display",
                               ANASTASIS_CRYPTO_uuid2s (&cd->uuid)),
      GNUNET_JSON_pack_string ("instructions",
                               cd->instructions));
    GNUNET_assert (0 ==
                   json_array_append_new (challenges,
                                          cj));
  } /* end for all challenges */
  recovery_information = GNUNET_JSON_PACK (
    GNUNET_JSON_pack_array_steal ("challenges",
                                  challenges),
    GNUNET_JSON_pack_array_steal ("policies",
                                  policies),
    GNUNET_JSON_pack_allow_null (
      GNUNET_JSON_pack_string ("secret_name",
                               ri->secret_name)),
    GNUNET_JSON_pack_string ("provider_url",
                             pd->backend_url),
    GNUNET_JSON_pack_uint64 ("version",
                             ri->version));
  GNUNET_assert (0 ==
                 json_object_set_new (rss->state,
                                      "recovery_information",
                                      recovery_information));
  {
    json_t *rd;

    rd = ANASTASIS_recovery_serialize (pd->recovery);
    if (NULL == rd)
    {
      GNUNET_break (0);
      ANASTASIS_redux_fail_ (rss->cb,
                             rss->cb_cls,
                             TALER_EC_GENERIC_INTERNAL_INVARIANT_FAILURE,
                             "unable to serialize recovery state");
      free_rss (rss);
      return;
    }
    GNUNET_assert (0 ==
                   json_object_set_new (rss->state,
                                        "recovery_document",
                                        rd));
  }
  set_state (rss->state,
             ANASTASIS_RECOVERY_STATE_SECRET_SELECTING);
  rss->cb (rss->cb_cls,
           TALER_EC_NONE,
           rss->state);
  free_rss (rss);
}


/**
 * Try to launch recovery at provider @a provider_url with config @a p_cfg.
 *
 * @param[in,out] rss recovery context
 * @param provider_url base URL of the provider to try
 * @param p_cfg configuration of the provider
 * @return true if a recovery was launched
 */
static bool
launch_recovery (struct RecoverSecretState *rss,
                 const char *provider_url,
                 const json_t *p_cfg)
{
  struct PolicyDownloadEntry *pd = GNUNET_new (struct PolicyDownloadEntry);
  struct GNUNET_JSON_Specification spec[] = {
    GNUNET_JSON_spec_fixed_auto ("salt",
                                 &pd->salt),
    GNUNET_JSON_spec_end ()
  };

  if (MHD_HTTP_OK !=
      json_integer_value (json_object_get (p_cfg,
                                           "http_status")))
    return false; /* skip providers that are down */
  if (GNUNET_OK !=
      GNUNET_JSON_parse (p_cfg,
                         spec,
                         NULL, NULL))
  {
    GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                "No salt for `%s', provider offline?\n",
                provider_url);
    GNUNET_free (pd);
    return false;
  }
  pd->backend_url = GNUNET_strdup (provider_url);
  pd->rss = rss;
  pd->recovery = ANASTASIS_recovery_begin (ANASTASIS_REDUX_ctx_,
                                           rss->id_data,
                                           rss->have_version
                                           ? rss->version
                                           : 0,
                                           pd->backend_url,
                                           &pd->salt,
                                           &policy_lookup_cb,
                                           pd,
                                           &core_early_secret_cb,
                                           pd);
  if (NULL != pd->recovery)
  {
    GNUNET_CONTAINER_DLL_insert (rss->pd_head,
                                 rss->pd_tail,
                                 pd);
    return true;
  }
  GNUNET_free (pd->backend_url);
  GNUNET_free (pd);
  return false;
}


/**
 * We finished downloading /config from all providers, merge
 * into the main state, trigger the continuation and free our
 * state.
 *
 * @param[in] rss main state to merge into
 */
static void
providers_complete (struct RecoverSecretState *rss)
{
  bool launched = false;
  struct RecoveryStartStateProviderEntry *pe;
  json_t *tlist;

  tlist = json_object_get (rss->state,
                           "authentication_providers");
  if (NULL == tlist)
  {
    tlist = json_object ();
    GNUNET_assert (NULL != tlist);
    GNUNET_assert (0 ==
                   json_object_set_new (rss->state,
                                        "authentication_providers",
                                        tlist));
  }
  while (NULL != (pe = rss->pe_head))
  {
    json_t *provider_list;

    GNUNET_CONTAINER_DLL_remove (rss->pe_head,
                                 rss->pe_tail,
                                 pe);
    provider_list = json_object_get (pe->istate,
                                     "authentication_providers");
    /* merge provider_list into tlist (overriding existing entries) */
    if (NULL != provider_list)
    {
      const char *url;
      json_t *value;

      json_object_foreach (provider_list, url, value) {
        GNUNET_assert (0 ==
                       json_object_set (tlist,
                                        url,
                                        value));
      }
    }
    json_decref (pe->istate);
    GNUNET_free (pe);
  }

  /* now iterate over providers and begin downloading */
  if (NULL != rss->provider_url)
  {
    json_t *p_cfg;

    p_cfg = json_object_get (tlist,
                             rss->provider_url);
    if (NULL != p_cfg)
      launched = launch_recovery (rss,
                                  rss->provider_url,
                                  p_cfg);
  }
  else
  {
    json_t *p_cfg;
    const char *provider_url;

    json_object_foreach (tlist, provider_url, p_cfg)
    {
      launched |= launch_recovery (rss,
                                   provider_url,
                                   p_cfg);
    }
  }
  if (! launched)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                "No provider online, need user to specify different provider!\n");
    return_no_policy (rss,
                      true);
    return;
  }
}


/**
 * Function called when the complete information about a provider
 * was added to @a new_state.
 *
 * @param cls a `struct RecoveryStartStateProviderEntry`
 * @param error error code
 * @param new_state resulting new state
 */
static void
provider_added_cb (void *cls,
                   enum TALER_ErrorCode error,
                   json_t *new_state)
{
  struct RecoveryStartStateProviderEntry *pe = cls;

  pe->ra = NULL;
  pe->istate = json_incref (new_state);
  pe->ec = error;
  pe->rss->pending--;
  if (0 == pe->rss->pending)
    providers_complete (pe->rss);
}


/**
 * Start to query provider for recovery document.
 *
 * @param[in,out] rss overall recovery state
 * @param provider_url base URL of the provider to query
 */
static void
begin_query_provider (struct RecoverSecretState *rss,
                      const char *provider_url)
{
  struct RecoveryStartStateProviderEntry *pe;
  json_t *istate;

  pe = GNUNET_new (struct RecoveryStartStateProviderEntry);
  pe->rss = rss;
  istate = json_object ();
  GNUNET_assert (NULL != istate);
  GNUNET_CONTAINER_DLL_insert (rss->pe_head,
                               rss->pe_tail,
                               pe);
  pe->ra = ANASTASIS_REDUX_add_provider_to_state_ (provider_url,
                                                   istate,
                                                   &provider_added_cb,
                                                   pe);
  json_decref (istate);
  if (NULL != pe->ra)
    rss->pending++;
}


struct ANASTASIS_ReduxAction *
ANASTASIS_REDUX_recovery_challenge_begin_ (json_t *state,
                                           const json_t *arguments,
                                           ANASTASIS_ActionCallback cb,
                                           void *cb_cls)
{
  json_t *version;
  json_t *providers;
  const json_t *attributes;
  struct RecoverSecretState *rss;
  const char *provider_url;

  providers = json_object_get (state,
                               "authentication_providers");
  if ( (NULL == providers) ||
       (! json_is_object (providers)) )
  {
    GNUNET_break (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'authentication_providers' missing");
    return NULL;
  }
  attributes = json_object_get (arguments,
                                "identity_attributes");
  if ( (NULL == attributes) ||
       (! json_is_object (attributes)) )
  {
    GNUNET_break (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'identity_attributes' missing");
    return NULL;
  }
  rss = GNUNET_new (struct RecoverSecretState);
  rss->id_data = json_incref ((json_t *) attributes);
  version = json_object_get (arguments,
                             "version");
  if (NULL != version)
  {
    rss->version = (unsigned int) json_integer_value (version);
    rss->have_version = true;
  }
  rss->state = json_incref (state);
  rss->cb = cb;
  rss->cb_cls = cb_cls;
  rss->pending = 1; /* decremented after initialization loop */

  provider_url = json_string_value (json_object_get (arguments,
                                                     "provider_url"));
  if (NULL != provider_url)
  {
    rss->provider_url = GNUNET_strdup (provider_url);
    begin_query_provider (rss,
                          provider_url);
  }
  else
  {
    json_t *prov;
    const char *url;

    json_object_foreach (providers, url, prov) {
      bool disabled = false;
      struct GNUNET_JSON_Specification spec[] = {
        GNUNET_JSON_spec_mark_optional (
          GNUNET_JSON_spec_bool ("disabled",
                                 &disabled)),
        GNUNET_JSON_spec_end ()
      };

      if (GNUNET_OK !=
          GNUNET_JSON_parse (prov,
                             spec,
                             NULL, NULL))
      {
        /* skip malformed provider entry */
        GNUNET_break_op (0);
        continue;
      }
      begin_query_provider (rss,
                            url);
    }
  }
  rss->pending--;
  if (0 == rss->pending)
  {
    providers_complete (rss);
    if (NULL == rss->cb)
      return NULL;
  }
  rss->ra.cleanup = &free_rss;
  rss->ra.cleanup_cls = rss;
  return &rss->ra;
}
