/*
  This file is part of Anastasis
  Copyright (C) 2020, 2021 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU Lesser General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with
  Anastasis; see the file COPYING.GPL.  If not, see <http://www.gnu.org/licenses/>
*/
/**
 * @brief anastasis client api
 * @author Christian Grothoff
 * @author Dominik Meister
 * @author Dennis Neufeld
 */
#include "platform.h"
#include "anastasis.h"
#include <taler/taler_json_lib.h>
#include <gnunet/gnunet_util_lib.h>
#include <taler/taler_merchant_service.h>
#include <zlib.h>


/**
 * Challenge struct contains the uuid and public key's needed for the
 * recovery process and a reference to ANASTASIS_Recovery.
 */
struct ANASTASIS_Challenge
{

  /**
   * Information exported to clients about this challenge.
   */
  struct ANASTASIS_ChallengeDetails ci;

  /**
   * Key used to encrypt the truth passed to the server
   */
  struct ANASTASIS_CRYPTO_TruthKeyP truth_key;

  /**
   * Salt; used to derive hash from security question answers.
   */
  struct ANASTASIS_CRYPTO_QuestionSaltP salt;

  /**
   * Provider salt; used to derive our key material from our identity
   * key.
   */
  struct ANASTASIS_CRYPTO_ProviderSaltP provider_salt;

  /**
   * Decrypted key share for this challenge.  Set once the
   * challenge was @e ri.solved.
   */
  struct ANASTASIS_CRYPTO_KeyShareP key_share;

  /**
   * Callback which gives back the instructions and a status code of
   * the request to the user when answering a challenge was initiated.
   */
  ANASTASIS_AnswerFeedback af;

  /**
   * Closure for the challenge callback
   */
  void *af_cls;

  /**
   * Defines the base URL of the Anastasis provider used for the challenge.
   */
  char *url;

  /**
   * What is the type of this challenge (E-Mail, Security Question, SMS...)
   */
  char *type;

  /**
   * Instructions for solving the challenge (generic, set client-side
   * when challenge was established).
   */
  char *instructions;

  /**
   * Answer to the security question, if @a type is "question". Otherwise NULL.
   */
  char *answer;

  /**
   * Reference to the recovery process which is ongoing
   */
  struct ANASTASIS_Recovery *recovery;

  /**
   * keyshare lookup operation
   */
  struct ANASTASIS_KeyShareLookupOperation *kslo;

};


/**
 * Defines a decryption policy with multiple escrow methods
 */
struct DecryptionPolicy
{

  /**
   * Publicly visible details about a decryption policy.
   */
  struct ANASTASIS_DecryptionPolicy pub_details;

  /**
   * Encrypted masterkey (encrypted with the policy key).
   */
  struct ANASTASIS_CRYPTO_EncryptedMasterKeyP emk;

  /**
   * Salt used to decrypt master key.
   */
  struct ANASTASIS_CRYPTO_MasterSaltP salt;

};


/**
 * stores provider URLs, identity key material, decrypted recovery document (internally!)
 */
struct ANASTASIS_Recovery
{

  /**
   * Identity key material used for the derivation of keys
   */
  struct ANASTASIS_CRYPTO_UserIdentifierP id;

  /**
   * Recovery information which is given to the user
   */
  struct ANASTASIS_RecoveryInformation ri;

  /**
   * Internal of @e ri.dps_len policies that would allow recovery of the core secret.
   */
  struct DecryptionPolicy *dps;

  /**
   * Array of @e ri.cs_len challenges to be solved (for any of the policies).
   */
  struct ANASTASIS_Challenge *cs;

  /**
   * Identity data to user id from.
   */
  json_t *id_data;

  /**
   * Callback to send back a recovery document with the policies and the version
   */
  ANASTASIS_PolicyCallback pc;

  /**
   * closure for the Policy callback
   */
  void *pc_cls;

  /**
   * Callback to send back the core secret which was saved by
   * anastasis, after all challenges are completed
  */
  ANASTASIS_CoreSecretCallback csc;

  /**
   * Closure for the core secret callback
   */
  void *csc_cls;

  /**
   * Curl context
   */
  struct GNUNET_CURL_Context *ctx;

  /**
   * Reference to the policy lookup operation which is executed
   */
  struct ANASTASIS_PolicyLookupOperation *plo;

  /**
   * Array of challenges that have been solved.
   * Valid entries up to @e solved_challenge_pos.
   * Length matches the total number of challenges in @e ri.
   */
  struct ANASTASIS_Challenge **solved_challenges;

  /**
   * Our provider URL.
   */
  char *provider_url;

  /**
   * Name of the secret, can be NULL.
   */
  char *secret_name;

  /**
   * Task to run @e pc asynchronously.
   */
  struct GNUNET_SCHEDULER_Task *do_async;

  /**
   * Retrieved encrypted core secret from policy
   */
  void *enc_core_secret;

  /**
   * Size of the @e enc_core_secret
   */
  size_t enc_core_secret_size;

  /**
   * Current offset in the @e solved_challenges array.
   */
  unsigned int solved_challenge_pos;

};


/**
 * Function called with the results of a #ANASTASIS_keyshare_lookup().
 *
 * @param cls closure
 * @param dd details about the lookup operation
 */
static void
keyshare_lookup_cb (void *cls,
                    const struct ANASTASIS_KeyShareDownloadDetails *dd)
{
  struct ANASTASIS_Challenge *c = cls;
  struct ANASTASIS_Recovery *recovery = c->recovery;
  struct ANASTASIS_CRYPTO_UserIdentifierP id;
  struct DecryptionPolicy *rdps;

  c->kslo = NULL;
  switch (dd->status)
  {
  case ANASTASIS_KSD_SUCCESS:
    break;
  case ANASTASIS_KSD_PAYMENT_REQUIRED:
    {
      struct ANASTASIS_ChallengeStartResponse csr = {
        .cs = ANASTASIS_CHALLENGE_STATUS_PAYMENT_REQUIRED,
        .challenge = c,
        .details.payment_required.taler_pay_uri
          = dd->details.payment_required.taler_pay_uri,
        .details.payment_required.payment_secret
          = dd->details.payment_required.payment_secret
      };

      c->af (c->af_cls,
             &csr);
      return;
    }
  case ANASTASIS_KSD_INVALID_ANSWER:
    {
      struct ANASTASIS_ChallengeStartResponse csr = {
        .cs = ANASTASIS_CHALLENGE_STATUS_INSTRUCTIONS,
        .challenge = c,
        .details.open_challenge.body
          = dd->details.open_challenge.body,
        .details.open_challenge.content_type
          = dd->details.open_challenge.content_type,
        .details.open_challenge.body_size
          = dd->details.open_challenge.body_size,
        .details.open_challenge.http_status
          = dd->details.open_challenge.http_status
      };

      c->af (c->af_cls,
             &csr);
      return;
    }
  case ANASTASIS_KSD_REDIRECT_FOR_AUTHENTICATION:
    {
      struct ANASTASIS_ChallengeStartResponse csr = {
        .cs = ANASTASIS_CHALLENGE_STATUS_REDIRECT_FOR_AUTHENTICATION,
        .challenge = c,
        .details.redirect_url
          = dd->details.redirect_url
      };

      c->af (c->af_cls,
             &csr);
      return;
    }
  case ANASTASIS_KSD_TRUTH_UNKNOWN:
    {
      struct ANASTASIS_ChallengeStartResponse csr = {
        .cs = ANASTASIS_CHALLENGE_STATUS_TRUTH_UNKNOWN,
        .challenge = c
      };

      c->af (c->af_cls,
             &csr);
      return;
    }
  case ANASTASIS_KSD_RATE_LIMIT_EXCEEDED:
    {
      struct ANASTASIS_ChallengeStartResponse csr = {
        .cs = ANASTASIS_CHALLENGE_STATUS_RATE_LIMIT_EXCEEDED,
        .challenge = c
      };

      c->af (c->af_cls,
             &csr);
      return;
    }
  case ANASTASIS_KSD_SERVER_ERROR:
  case ANASTASIS_KSD_CLIENT_FAILURE:
    {
      struct ANASTASIS_ChallengeStartResponse csr = {
        .cs = ANASTASIS_CHALLENGE_STATUS_SERVER_FAILURE,
        .challenge = c,
        .details.server_failure.ec
          = dd->details.server_failure.ec,
        .details.server_failure.http_status
          = dd->details.server_failure.http_status
      };

      c->af (c->af_cls,
             &csr);
      return;
    }
  case ANASTASIS_KSD_AUTHENTICATION_TIMEOUT:
    {
      struct ANASTASIS_ChallengeStartResponse csr = {
        .cs = ANASTASIS_CHALLENGE_STATUS_AUTH_TIMEOUT,
        .challenge = c,
        .details.server_failure.ec
          = dd->details.server_failure.ec,
        .details.server_failure.http_status
          = dd->details.server_failure.http_status
      };

      c->ci.async = true;
      c->af (c->af_cls,
             &csr);
      return;
    }
  case ANASTASIS_KSD_EXTERNAL_CHALLENGE_INSTRUCTIONS:
    {
      struct ANASTASIS_ChallengeStartResponse csr = {
        .cs = ANASTASIS_CHALLENGE_STATUS_EXTERNAL_INSTRUCTIONS,
        .challenge = c,
        .details.external_challenge = dd->details.external_challenge
      };

      c->af (c->af_cls,
             &csr);
      return;
    }
  }

  GNUNET_assert (NULL != dd);
  ANASTASIS_CRYPTO_user_identifier_derive (recovery->id_data,
                                           &c->provider_salt,
                                           &id);
  ANASTASIS_CRYPTO_keyshare_decrypt (&dd->details.eks,
                                     &id,
                                     c->answer,
                                     &c->key_share);
  recovery->solved_challenges[recovery->solved_challenge_pos++] = c;

  {
    struct ANASTASIS_ChallengeStartResponse csr = {
      .cs = ANASTASIS_CHALLENGE_STATUS_SOLVED,
      .challenge = c
    };

    c->ci.solved = true;
    c->af (c->af_cls,
           &csr);
  }


  /* Check if there is a policy for which all challenges have
     been satisfied, if so, store it in 'rdps'. */
  rdps = NULL;
  for (unsigned int i = 0; i < recovery->ri.dps_len; i++)
  {
    struct DecryptionPolicy *dps = &recovery->dps[i];
    bool missing = false;

    for (unsigned int j = 0; j < dps->pub_details.challenges_length; j++)
    {
      bool found = false;

      for (unsigned int k = 0; k < recovery->solved_challenge_pos; k++)
      {
        if (dps->pub_details.challenges[j] == recovery->solved_challenges[k])
        {
          found = true;
          break;
        }
      }
      if (! found)
      {
        missing = true;
        break;
      }
    }
    if (! missing)
    {
      rdps = dps;
      break;
    }
  }
  if (NULL == rdps)
    return;

  {
    void *core_secret;
    size_t core_secret_size;
    struct ANASTASIS_CRYPTO_KeyShareP
      key_shares[rdps->pub_details.challenges_length];
    struct ANASTASIS_CRYPTO_PolicyKeyP policy_key;

    for (unsigned int l = 0; l < rdps->pub_details.challenges_length; l++)
      for (unsigned int m = 0; m < recovery->solved_challenge_pos; m++)
        if (rdps->pub_details.challenges[l] == recovery->solved_challenges[m])
          key_shares[l] = recovery->solved_challenges[m]->key_share;
    ANASTASIS_CRYPTO_policy_key_derive (key_shares,
                                        rdps->pub_details.challenges_length,
                                        &rdps->salt,
                                        &policy_key);
    ANASTASIS_CRYPTO_core_secret_recover (&rdps->emk,
                                          &policy_key,
                                          recovery->enc_core_secret,
                                          recovery->enc_core_secret_size,
                                          &core_secret,
                                          &core_secret_size);
    recovery->csc (recovery->csc_cls,
                   ANASTASIS_RS_SUCCESS,
                   core_secret,
                   core_secret_size);
    GNUNET_free (core_secret);
    ANASTASIS_recovery_abort (recovery);
  }
}


const struct ANASTASIS_ChallengeDetails *
ANASTASIS_challenge_get_details (struct ANASTASIS_Challenge *challenge)
{
  return &challenge->ci;
}


int
ANASTASIS_challenge_start (struct ANASTASIS_Challenge *c,
                           const struct ANASTASIS_PaymentSecretP *psp,
                           struct GNUNET_TIME_Relative timeout,
                           const struct GNUNET_HashCode *hashed_answer,
                           ANASTASIS_AnswerFeedback af,
                           void *af_cls)
{
  if (c->ci.solved)
  {
    GNUNET_break (0);
    return GNUNET_NO; /* already solved */
  }
  if (NULL != c->kslo)
  {
    GNUNET_break (0);
    return GNUNET_NO; /* already solving */
  }
  c->af = af;
  c->af_cls = af_cls;
  c->kslo = ANASTASIS_keyshare_lookup (c->recovery->ctx,
                                       c->url,
                                       &c->ci.uuid,
                                       &c->truth_key,
                                       psp,
                                       timeout,
                                       hashed_answer,
                                       &keyshare_lookup_cb,
                                       c);
  if (NULL == c->kslo)
  {
    GNUNET_break (0);
    return GNUNET_SYSERR;
  }
  return GNUNET_OK;
}


int
ANASTASIS_challenge_answer (
  struct ANASTASIS_Challenge *c,
  const struct ANASTASIS_PaymentSecretP *psp,
  struct GNUNET_TIME_Relative timeout,
  const char *answer_str,
  ANASTASIS_AnswerFeedback af,
  void *af_cls)
{
  struct GNUNET_HashCode hashed_answer;

  GNUNET_free (c->answer);
  c->answer = GNUNET_strdup (answer_str);
  ANASTASIS_CRYPTO_secure_answer_hash (answer_str,
                                       &c->ci.uuid,
                                       &c->salt,
                                       &hashed_answer);
  return ANASTASIS_challenge_start (c,
                                    psp,
                                    timeout,
                                    &hashed_answer,
                                    af,
                                    af_cls);
}


int
ANASTASIS_challenge_answer2 (struct ANASTASIS_Challenge *c,
                             const struct ANASTASIS_PaymentSecretP *psp,
                             struct GNUNET_TIME_Relative timeout,
                             uint64_t answer,
                             ANASTASIS_AnswerFeedback af,
                             void *af_cls)
{
  struct GNUNET_HashCode answer_s;

  ANASTASIS_hash_answer (answer,
                         &answer_s);
  return ANASTASIS_challenge_start (c,
                                    psp,
                                    timeout,
                                    &answer_s,
                                    af,
                                    af_cls);
}


void
ANASTASIS_challenge_abort (struct ANASTASIS_Challenge *c)
{
  if (NULL == c->kslo)
  {
    GNUNET_break (0);
    return;
  }
  ANASTASIS_keyshare_lookup_cancel (c->kslo);
  c->kslo = NULL;
  c->af = NULL;
  c->af_cls = NULL;
}


/**
 * Function called with the results of a #ANASTASIS_policy_lookup()
 *
 * @param cls closure
 * @param http_status HTTp status code.
 * @param dd details about the lookup operation
 */
static void
policy_lookup_cb (void *cls,
                  unsigned int http_status,
                  const struct ANASTASIS_DownloadDetails *dd)
{
  struct ANASTASIS_Recovery *r = cls;
  void *plaintext;
  size_t size_plaintext;
  json_error_t json_error;
  json_t *dec_policies;
  json_t *esc_methods;

  r->plo = NULL;
  switch (http_status)
  {
  case MHD_HTTP_OK:
    break;
  case MHD_HTTP_NOT_FOUND:
    r->csc (r->csc_cls,
            ANASTASIS_RS_POLICY_UNKNOWN,
            NULL,
            0);
    ANASTASIS_recovery_abort (r);
    return;
  case MHD_HTTP_NO_CONTENT:
    /* Account known, policy expired */
    r->csc (r->csc_cls,
            ANASTASIS_RS_POLICY_GONE,
            NULL,
            0);
    ANASTASIS_recovery_abort (r);
    return;
  case MHD_HTTP_INTERNAL_SERVER_ERROR:
    /* Bad server... */
    r->csc (r->csc_cls,
            ANASTASIS_RS_POLICY_SERVER_ERROR,
            NULL,
            0);
    ANASTASIS_recovery_abort (r);
    return;
  case MHD_HTTP_NOT_MODIFIED:
  /* Should not be possible, we do not cache, fall-through! */
  default:
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Unexpected response code %u in %s:%u\n",
                http_status,
                __FILE__,
                __LINE__);
    r->csc (r->csc_cls,
            ANASTASIS_RS_POLICY_DOWNLOAD_FAILED,
            NULL,
            0);
    ANASTASIS_recovery_abort (r);
    return;
  }
  if (NULL == dd->policy)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "No recovery data available");
    r->csc (r->csc_cls,
            ANASTASIS_RS_POLICY_DOWNLOAD_NO_POLICY,
            NULL,
            0);
    ANASTASIS_recovery_abort (r);
    return;
  }
  ANASTASIS_CRYPTO_recovery_document_decrypt (&r->id,
                                              dd->policy,
                                              dd->policy_size,
                                              &plaintext,
                                              &size_plaintext);
  if (size_plaintext < sizeof (uint32_t))
  {
    GNUNET_break_op (0);
    r->csc (r->csc_cls,
            ANASTASIS_RS_POLICY_DOWNLOAD_INVALID_COMPRESSION,
            NULL,
            0);
    ANASTASIS_recovery_abort (r);
    GNUNET_free (plaintext);
    return;
  }
  {
    json_t *recovery_document;
    uint32_t be_size;
    uLongf pt_size;
    char *pt;

    memcpy (&be_size,
            plaintext,
            sizeof (uint32_t));
    pt_size = ntohl (be_size);
    pt = GNUNET_malloc_large (pt_size);
    if (NULL == pt)
    {
      GNUNET_break_op (0);
      r->csc (r->csc_cls,
              ANASTASIS_RS_POLICY_DOWNLOAD_TOO_BIG,
              NULL,
              0);
      ANASTASIS_recovery_abort (r);
      GNUNET_free (plaintext);
      return;
    }
    if (Z_OK !=
        uncompress ((Bytef *) pt,
                    &pt_size,
                    (const Bytef *) plaintext + sizeof (uint32_t),
                    size_plaintext - sizeof (uint32_t)))
    {
      GNUNET_break_op (0);
      r->csc (r->csc_cls,
              ANASTASIS_RS_POLICY_DOWNLOAD_INVALID_COMPRESSION,
              NULL,
              0);
      GNUNET_free (plaintext);
      GNUNET_free (pt);
      ANASTASIS_recovery_abort (r);
      return;
    }
    GNUNET_free (plaintext);
    recovery_document = json_loadb ((char *) pt,
                                    pt_size,
                                    JSON_DECODE_ANY,
                                    &json_error);
    GNUNET_free (pt);
    if (NULL == recovery_document)
    {
      GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                  "Failed to read JSON input: %s at %d:%s (offset: %d)\n",
                  json_error.text,
                  json_error.line,
                  json_error.source,
                  json_error.position);
      GNUNET_break_op (0);
      r->csc (r->csc_cls,
              ANASTASIS_RS_POLICY_DOWNLOAD_NO_JSON,
              NULL,
              0);
      ANASTASIS_recovery_abort (r);
      return;
    }

    {
      const char *secret_name = NULL;
      struct GNUNET_JSON_Specification spec[] = {
        GNUNET_JSON_spec_json ("policies",
                               &dec_policies),
        GNUNET_JSON_spec_json ("escrow_methods",
                               &esc_methods),
        GNUNET_JSON_spec_mark_optional (
          GNUNET_JSON_spec_string ("secret_name",
                                   &secret_name)),
        GNUNET_JSON_spec_varsize ("encrypted_core_secret",
                                  &r->enc_core_secret,
                                  &r->enc_core_secret_size),
        GNUNET_JSON_spec_end ()
      };

      if (GNUNET_OK !=
          GNUNET_JSON_parse (recovery_document,
                             spec,
                             NULL, NULL))
      {
        GNUNET_break_op (0);
        json_dumpf (recovery_document,
                    stderr,
                    0);
        json_decref (recovery_document);
        r->csc (r->csc_cls,
                ANASTASIS_RS_POLICY_MALFORMED_JSON,
                NULL,
                0);
        ANASTASIS_recovery_abort (r);
        return;
      }
      if (NULL != secret_name)
      {
        GNUNET_break (NULL == r->secret_name);
        r->secret_name = GNUNET_strdup (secret_name);
        r->ri.secret_name = r->secret_name;
      }
    }
    json_decref (recovery_document);
  }

  r->ri.version = dd->version;
  r->ri.cs_len = json_array_size (esc_methods);
  r->ri.dps_len = json_array_size (dec_policies);
  r->ri.dps = GNUNET_new_array (r->ri.dps_len,
                                struct ANASTASIS_DecryptionPolicy *);
  r->dps = GNUNET_new_array (r->ri.dps_len,
                             struct DecryptionPolicy);
  r->solved_challenges = GNUNET_new_array (r->ri.cs_len,
                                           struct ANASTASIS_Challenge *);
  r->ri.cs = GNUNET_new_array (r->ri.cs_len,
                               struct ANASTASIS_Challenge *);
  r->cs = GNUNET_new_array (r->ri.cs_len,
                            struct ANASTASIS_Challenge);
  for (unsigned int i = 0; i < r->ri.cs_len; i++)
  {
    struct ANASTASIS_Challenge *cs = &r->cs[i];
    const char *instructions;
    const char *url;
    const char *escrow_type;
    struct GNUNET_JSON_Specification spec[] = {
      GNUNET_JSON_spec_fixed_auto ("uuid",
                                   &cs->ci.uuid),
      GNUNET_JSON_spec_string ("url",
                               &url),
      GNUNET_JSON_spec_string ("instructions",
                               &instructions),
      GNUNET_JSON_spec_fixed_auto ("truth_key",
                                   &cs->truth_key),
      GNUNET_JSON_spec_fixed_auto ("salt",
                                   &cs->salt),
      GNUNET_JSON_spec_fixed_auto ("provider_salt",
                                   &cs->provider_salt),
      GNUNET_JSON_spec_string ("escrow_type",
                               &escrow_type),
      GNUNET_JSON_spec_end ()
    };

    r->ri.cs[i] = cs;
    cs->recovery = r;
    if (GNUNET_OK !=
        GNUNET_JSON_parse (json_array_get (esc_methods,
                                           i),
                           spec,
                           NULL, NULL))
    {
      GNUNET_break_op (0);
      json_decref (esc_methods);
      json_decref (dec_policies);
      r->csc (r->csc_cls,
              ANASTASIS_RS_POLICY_MALFORMED_JSON,
              NULL,
              0);
      ANASTASIS_recovery_abort (r);
      return;
    }
    cs->url = GNUNET_strdup (url);
    cs->type = GNUNET_strdup (escrow_type);
    cs->ci.type = cs->type;
    cs->ci.provider_url = cs->url;
    cs->instructions = GNUNET_strdup (instructions);
    cs->ci.instructions = cs->instructions;
  }
  json_decref (esc_methods);

  for (unsigned int j = 0; j < r->ri.dps_len; j++)
  {
    struct DecryptionPolicy *dp = &r->dps[j];
    json_t *uuids = NULL;
    json_t *uuid;
    size_t n_index;
    struct GNUNET_JSON_Specification spec[] = {
      GNUNET_JSON_spec_fixed_auto ("master_key",
                                   &dp->emk),
      GNUNET_JSON_spec_fixed_auto ("salt",
                                   &dp->salt),
      GNUNET_JSON_spec_json ("uuids",
                             &uuids),
      GNUNET_JSON_spec_end ()
    };

    r->ri.dps[j] = &r->dps[j].pub_details;
    if ( (GNUNET_OK !=
          GNUNET_JSON_parse (json_array_get (dec_policies,
                                             j),
                             spec,
                             NULL, NULL)) ||
         (! json_is_array (uuids)) )
    {
      GNUNET_break_op (0);
      json_decref (uuids);
      json_decref (dec_policies);
      r->csc (r->csc_cls,
              ANASTASIS_RS_POLICY_MALFORMED_JSON,
              NULL,
              0);
      ANASTASIS_recovery_abort (r);
      return;
    }

    dp->pub_details.challenges_length = json_array_size (uuids);
    dp->pub_details.challenges
      = GNUNET_new_array (dp->pub_details.challenges_length,
                          struct ANASTASIS_Challenge *);
    json_array_foreach (uuids, n_index, uuid)
    {
      const char *uuid_str = json_string_value (uuid);
      struct ANASTASIS_CRYPTO_TruthUUIDP uuid;
      bool found = false;

      if ( (NULL == uuid_str) ||
           (GNUNET_OK !=
            GNUNET_STRINGS_string_to_data (
              uuid_str,
              strlen (uuid_str),
              &uuid,
              sizeof (uuid))) )
      {
        GNUNET_break_op (0);
        json_decref (dec_policies);
        json_decref (uuids);
        r->csc (r->csc_cls,
                ANASTASIS_RS_POLICY_MALFORMED_JSON,
                NULL,
                0);
        ANASTASIS_recovery_abort (r);
        return;
      }
      for (unsigned int i = 0; i<r->ri.cs_len; i++)
      {
        if (0 !=
            GNUNET_memcmp (&uuid,
                           &r->cs[i].ci.uuid))
          continue;
        found = true;
        dp->pub_details.challenges[n_index] = &r->cs[i];
        break;
      }
      if (! found)
      {
        GNUNET_break_op (0);
        json_decref (dec_policies);
        json_decref (uuids);
        r->csc (r->csc_cls,
                ANASTASIS_RS_POLICY_MALFORMED_JSON,
                NULL,
                0);
        ANASTASIS_recovery_abort (r);
        return;
      }
    }
    json_decref (uuids);
  }
  json_decref (dec_policies);
  r->pc (r->pc_cls,
         &r->ri);
}


struct ANASTASIS_Recovery *
ANASTASIS_recovery_begin (
  struct GNUNET_CURL_Context *ctx,
  const json_t *id_data,
  unsigned int version,
  const char *anastasis_provider_url,
  const struct ANASTASIS_CRYPTO_ProviderSaltP *provider_salt,
  ANASTASIS_PolicyCallback pc,
  void *pc_cls,
  ANASTASIS_CoreSecretCallback csc,
  void *csc_cls)
{
  struct ANASTASIS_Recovery *r;
  struct ANASTASIS_CRYPTO_AccountPublicKeyP pub_key;

  r = GNUNET_new (struct ANASTASIS_Recovery);
  r->csc = csc;
  r->csc_cls = csc_cls;
  r->pc = pc;
  r->pc_cls = pc_cls;
  r->ctx = ctx;
  r->id_data = json_incref ((json_t *) id_data);
  r->provider_url = GNUNET_strdup (anastasis_provider_url);
  ANASTASIS_CRYPTO_user_identifier_derive (id_data,
                                           provider_salt,
                                           &r->id);
  ANASTASIS_CRYPTO_account_public_key_derive (&r->id,
                                              &pub_key);
  r->ri.version = version;
  if (0 != version)
  {
    r->plo = ANASTASIS_policy_lookup_version (r->ctx,
                                              anastasis_provider_url,
                                              &pub_key,
                                              &policy_lookup_cb,
                                              r,
                                              version);
  }
  else
  {
    r->plo = ANASTASIS_policy_lookup (r->ctx,
                                      anastasis_provider_url,
                                      &pub_key,
                                      &policy_lookup_cb,
                                      r);
  }
  if (NULL == r->plo)
  {
    GNUNET_break (0);
    ANASTASIS_recovery_abort (r);
    return NULL;
  }
  return r;
}


json_t *
ANASTASIS_recovery_serialize (const struct ANASTASIS_Recovery *r)
{
  json_t *dps_arr;
  json_t *cs_arr;

  dps_arr = json_array ();
  GNUNET_assert (NULL != dps_arr);
  for (unsigned int i = 0; i<r->ri.dps_len; i++)
  {
    const struct DecryptionPolicy *dp = &r->dps[i];
    json_t *c_arr;
    json_t *dps;

    c_arr = json_array ();
    GNUNET_assert (NULL != c_arr);
    for (unsigned int j = 0; j < dp->pub_details.challenges_length; j++)
    {
      const struct ANASTASIS_Challenge *c = dp->pub_details.challenges[j];
      json_t *cs;

      cs = GNUNET_JSON_PACK (
        GNUNET_JSON_pack_data_auto ("uuid",
                                    &c->ci.uuid));
      GNUNET_assert (0 ==
                     json_array_append_new (c_arr,
                                            cs));
    }
    dps = GNUNET_JSON_PACK (
      GNUNET_JSON_pack_data_auto ("emk",
                                  &dp->emk),
      GNUNET_JSON_pack_data_auto ("salt",
                                  &dp->salt),
      GNUNET_JSON_pack_array_steal ("challenges",
                                    c_arr));
    GNUNET_assert (0 ==
                   json_array_append_new (dps_arr,
                                          dps));
  }
  cs_arr = json_array ();
  GNUNET_assert (NULL != cs_arr);
  for (unsigned int i = 0; i<r->ri.cs_len; i++)
  {
    const struct ANASTASIS_Challenge *c = &r->cs[i];
    json_t *cs;

    cs = GNUNET_JSON_PACK (
      GNUNET_JSON_pack_data_auto ("uuid",
                                  &c->ci.uuid),
      GNUNET_JSON_pack_data_auto ("truth_key",
                                  &c->truth_key),
      GNUNET_JSON_pack_data_auto ("salt",
                                  &c->salt),
      GNUNET_JSON_pack_data_auto ("provider_salt",
                                  &c->provider_salt),
      GNUNET_JSON_pack_allow_null (
        GNUNET_JSON_pack_data_varsize ("key_share",
                                       c->ci.solved
                                       ? &c->key_share
                                       : NULL,
                                       sizeof (c->key_share))),
      GNUNET_JSON_pack_string ("url",
                               c->url),
      GNUNET_JSON_pack_string ("type",
                               c->type),
      GNUNET_JSON_pack_string ("instructions",
                               c->instructions),
      GNUNET_JSON_pack_bool ("solved",
                             c->ci.solved),
      GNUNET_JSON_pack_bool ("async",
                             c->ci.async));
    GNUNET_assert (0 ==
                   json_array_append_new (cs_arr,
                                          cs));
  }

  return GNUNET_JSON_PACK (
    GNUNET_JSON_pack_data_auto ("id",
                                &r->id),
    GNUNET_JSON_pack_array_steal ("dps",
                                  dps_arr),
    GNUNET_JSON_pack_array_steal ("cs",
                                  cs_arr),
    GNUNET_JSON_pack_uint64 ("version",
                             r->ri.version),
    GNUNET_JSON_pack_object_incref ("id_data",
                                    (json_t *) r->id_data),
    GNUNET_JSON_pack_string ("provider_url",
                             r->provider_url),
    GNUNET_JSON_pack_allow_null (
      GNUNET_JSON_pack_string ("secret_name",
                               r->secret_name)),
    GNUNET_JSON_pack_data_varsize ("core_secret",
                                   r->enc_core_secret,
                                   r->enc_core_secret_size));
}


/**
 * Parse the @a cs_array and update @a r accordingly
 *
 * @param[in,out] r recovery information to update
 * @param cs_arr serialized data to parse
 * @return #GNUNET_OK on success
 */
static int
parse_cs_array (struct ANASTASIS_Recovery *r,
                json_t *cs_arr)
{
  json_t *cs;
  unsigned int n_index;

  if (! json_is_array (cs_arr))
  {
    GNUNET_break_op (0);
    return GNUNET_SYSERR;
  }
  r->ri.cs_len = json_array_size (cs_arr);
  r->solved_challenges = GNUNET_new_array (r->ri.cs_len,
                                           struct ANASTASIS_Challenge *);
  r->ri.cs = GNUNET_new_array (r->ri.cs_len,
                               struct ANASTASIS_Challenge *);
  r->cs = GNUNET_new_array (r->ri.cs_len,
                            struct ANASTASIS_Challenge);
  json_array_foreach (cs_arr, n_index, cs)
  {
    struct ANASTASIS_Challenge *c = &r->cs[n_index];
    const char *instructions;
    const char *url;
    const char *escrow_type;
    struct GNUNET_JSON_Specification spec[] = {
      GNUNET_JSON_spec_fixed_auto ("uuid",
                                   &c->ci.uuid),
      GNUNET_JSON_spec_string ("url",
                               &url),
      GNUNET_JSON_spec_string ("instructions",
                               &instructions),
      GNUNET_JSON_spec_fixed_auto ("truth_key",
                                   &c->truth_key),
      GNUNET_JSON_spec_fixed_auto ("salt",
                                   &c->salt),
      GNUNET_JSON_spec_fixed_auto ("provider_salt",
                                   &c->provider_salt),
      GNUNET_JSON_spec_string ("type",
                               &escrow_type),
      GNUNET_JSON_spec_mark_optional (
        GNUNET_JSON_spec_bool ("async",
                               &c->ci.async)),
      GNUNET_JSON_spec_mark_optional (
        GNUNET_JSON_spec_fixed_auto ("key_share",
                                     &c->key_share)),
      GNUNET_JSON_spec_end ()
    };

    r->ri.cs[n_index] = c;
    c->recovery = r;
    if (GNUNET_OK !=
        GNUNET_JSON_parse (cs,
                           spec,
                           NULL, NULL))
    {
      GNUNET_break_op (0);
      return GNUNET_SYSERR;
    }
    c->url = GNUNET_strdup (url);
    c->type = GNUNET_strdup (escrow_type);
    c->ci.type = c->type;
    c->instructions = GNUNET_strdup (instructions);
    c->ci.instructions = c->instructions;
    c->ci.provider_url = c->url;
    {
      json_t *ks;

      ks = json_object_get (cs,
                            "key_share");
      if ( (NULL != ks) &&
           (! json_is_null (ks)) )
      {
        c->ci.solved = true;
        r->solved_challenges[r->solved_challenge_pos++] = c;
      }
    }
  }

  return GNUNET_OK;
}


/**
 * Parse the @a dps_array and update @a r accordingly
 *
 * @param[in,out] r recovery information to update
 * @param dps_arr serialized data to parse
 * @return #GNUNET_OK on success
 */
static int
parse_dps_array (struct ANASTASIS_Recovery *r,
                 json_t *dps_arr)
{
  json_t *dps;
  unsigned int n_index;

  if (! json_is_array (dps_arr))
  {
    GNUNET_break_op (0);
    return GNUNET_SYSERR;
  }
  r->ri.dps_len = json_array_size (dps_arr);
  r->dps = GNUNET_new_array (r->ri.dps_len,
                             struct DecryptionPolicy);
  r->ri.dps = GNUNET_new_array (r->ri.dps_len,
                                struct ANASTASIS_DecryptionPolicy *);

  json_array_foreach (dps_arr, n_index, dps)
  {
    struct DecryptionPolicy *dp = &r->dps[n_index];
    json_t *challenges;
    struct GNUNET_JSON_Specification spec[] = {
      GNUNET_JSON_spec_fixed_auto ("emk",
                                   &dp->emk),
      GNUNET_JSON_spec_fixed_auto ("salt",
                                   &dp->salt),
      GNUNET_JSON_spec_json ("challenges",
                             &challenges),
      GNUNET_JSON_spec_end ()
    };
    const char *err_json_name;
    unsigned int err_line;

    r->ri.dps[n_index] = &dp->pub_details;
    if (GNUNET_OK !=
        GNUNET_JSON_parse (dps,
                           spec,
                           &err_json_name,
                           &err_line))
    {
      GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                  "Failed to parse decryption policy JSON entry `%s'\n",
                  err_json_name);
      json_dumpf (dps,
                  stderr,
                  JSON_INDENT (2));
      return GNUNET_SYSERR;
    }
    if (! json_is_array (challenges))
    {
      GNUNET_break_op (0);
      GNUNET_JSON_parse_free (spec);
      return GNUNET_SYSERR;
    }
    dp->pub_details.challenges_length = json_array_size (challenges);
    dp->pub_details.challenges = GNUNET_new_array (
      dp->pub_details.challenges_length,
      struct ANASTASIS_Challenge *);

    {
      json_t *challenge;
      unsigned int c_index;
      json_array_foreach (challenges, c_index, challenge)
      {
        struct ANASTASIS_CRYPTO_TruthUUIDP uuid;
        struct GNUNET_JSON_Specification ispec[] = {
          GNUNET_JSON_spec_fixed_auto ("uuid",
                                       &uuid),
          GNUNET_JSON_spec_end ()
        };
        bool found = false;

        if (GNUNET_OK !=
            GNUNET_JSON_parse (challenge,
                               ispec,
                               NULL, NULL))
        {
          GNUNET_break_op (0);
          GNUNET_JSON_parse_free (spec);
          return GNUNET_SYSERR;
        }
        for (unsigned int i = 0; i<r->ri.cs_len; i++)
        {
          if (0 !=
              GNUNET_memcmp (&uuid,
                             &r->cs[i].ci.uuid))
            continue;
          dp->pub_details.challenges[c_index] = &r->cs[i];
          found = true;
        }
        if (! found)
        {
          GNUNET_break_op (0);
          GNUNET_JSON_parse_free (spec);
          return GNUNET_SYSERR;
        }
      }
    }
    GNUNET_JSON_parse_free (spec);
  }
  return GNUNET_OK;
}


/**
 * Asynchronously call "pc" on the recovery information.
 *
 * @param cls a `struct ANASTASIS_Recovery *`
 */
static void
run_async_pc (void *cls)
{
  struct ANASTASIS_Recovery *r = cls;

  r->do_async = NULL;
  r->pc (r->pc_cls,
         &r->ri);
}


struct ANASTASIS_Recovery *
ANASTASIS_recovery_deserialize (struct GNUNET_CURL_Context *ctx,
                                const json_t *input,
                                ANASTASIS_PolicyCallback pc,
                                void *pc_cls,
                                ANASTASIS_CoreSecretCallback csc,
                                void *csc_cls)
{
  struct ANASTASIS_Recovery *r;

  r = GNUNET_new (struct ANASTASIS_Recovery);
  r->csc = csc;
  r->csc_cls = csc_cls;
  r->pc = pc;
  r->pc_cls = pc_cls;
  r->ctx = ctx;
  {
    const char *err_json_name;
    unsigned int err_line;
    uint32_t version;
    json_t *dps_arr;
    json_t *cs_arr;
    json_t *id_data;
    const char *provider_url;
    const char *secret_name;
    void *ecs;
    size_t ecs_size;
    struct GNUNET_JSON_Specification spec[] = {
      GNUNET_JSON_spec_fixed_auto ("id",
                                   &r->id),
      GNUNET_JSON_spec_string ("provider_url",
                               &provider_url),
      GNUNET_JSON_spec_mark_optional (
        GNUNET_JSON_spec_string ("secret_name",
                                 &secret_name)),
      GNUNET_JSON_spec_uint32 ("version",
                               &version),
      GNUNET_JSON_spec_json ("dps",
                             &dps_arr),
      GNUNET_JSON_spec_json ("cs",
                             &cs_arr),
      GNUNET_JSON_spec_json ("id_data",
                             &id_data),
      GNUNET_JSON_spec_varsize ("core_secret",
                                &ecs,
                                &ecs_size),
      GNUNET_JSON_spec_end ()
    };

    if (GNUNET_OK !=
        GNUNET_JSON_parse (input,
                           spec,
                           &err_json_name,
                           &err_line))
    {
      GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                  "Failed to parse recovery document JSON entry `%s'\n",
                  err_json_name);
      json_dumpf (input,
                  stderr,
                  JSON_INDENT (2));
      return NULL;
    }
    r->ri.version = version;
    if ( (GNUNET_OK !=
          parse_cs_array (r,
                          cs_arr)) ||
         (GNUNET_OK !=
          parse_dps_array (r,
                           dps_arr)) )
    {
      GNUNET_break_op (0);
      ANASTASIS_recovery_abort (r);
      GNUNET_JSON_parse_free (spec);
      return NULL;
    }
    r->id_data = json_incref (id_data);
    r->provider_url = GNUNET_strdup (provider_url);
    if (NULL != secret_name)
      r->secret_name = GNUNET_strdup (secret_name);
    r->ri.secret_name = r->secret_name;
    if (0 != ecs_size)
    {
      r->enc_core_secret = GNUNET_memdup (ecs,
                                          ecs_size);
      r->enc_core_secret_size = ecs_size;
    }
    GNUNET_JSON_parse_free (spec);
  }
  if (0 == r->ri.dps_len)
  {
    struct ANASTASIS_CRYPTO_AccountPublicKeyP pub_key;

    ANASTASIS_CRYPTO_account_public_key_derive (&r->id,
                                                &pub_key);
    if (0 != r->ri.version)
    {
      r->plo = ANASTASIS_policy_lookup_version (r->ctx,
                                                r->provider_url,
                                                &pub_key,
                                                &policy_lookup_cb,
                                                r,
                                                r->ri.version);
    }
    else
    {
      r->plo = ANASTASIS_policy_lookup (r->ctx,
                                        r->provider_url,
                                        &pub_key,
                                        &policy_lookup_cb,
                                        r);
    }
    if (NULL == r->plo)
    {
      GNUNET_break (0);
      ANASTASIS_recovery_abort (r);
      return NULL;
    }
  }
  else
  {
    r->do_async = GNUNET_SCHEDULER_add_now (&run_async_pc,
                                            r);
  }
  return r;
}


void
ANASTASIS_recovery_abort (struct ANASTASIS_Recovery *r)
{
  if (NULL != r->do_async)
  {
    GNUNET_SCHEDULER_cancel (r->do_async);
    r->do_async = NULL;
  }
  if (NULL != r->plo)
  {
    ANASTASIS_policy_lookup_cancel (r->plo);
    r->plo = NULL;
  }
  GNUNET_free (r->solved_challenges);
  for (unsigned int j = 0; j < r->ri.dps_len; j++)
    GNUNET_free (r->dps[j].pub_details.challenges);
  GNUNET_free (r->ri.dps);
  for (unsigned int i = 0; i < r->ri.cs_len; i++)
  {
    struct ANASTASIS_Challenge *cs = r->ri.cs[i];

    if (NULL != cs->kslo)
    {
      ANASTASIS_keyshare_lookup_cancel (cs->kslo);
      cs->kslo = NULL;
    }
    GNUNET_free (cs->url);
    GNUNET_free (cs->type);
    GNUNET_free (cs->instructions);
    GNUNET_free (cs->answer);
  }
  GNUNET_free (r->ri.cs);
  GNUNET_free (r->cs);
  GNUNET_free (r->dps);
  json_decref (r->id_data);
  GNUNET_free (r->provider_url);
  GNUNET_free (r->secret_name);
  GNUNET_free (r->enc_core_secret);
  GNUNET_free (r);
}
