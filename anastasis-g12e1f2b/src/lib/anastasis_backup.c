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
 * @brief anastasis client api
 * @author Christian Grothoff
 * @author Dominik Meister
 * @author Dennis Neufeld
 */
#include "platform.h"
#include "anastasis.h"
#include <taler/taler_merchant_service.h>
#include <zlib.h>


struct ANASTASIS_Truth
{
  /**
   * Identification of the truth.
   */
  struct ANASTASIS_CRYPTO_TruthUUIDP uuid;

  /**
   * Keyshare of this truth, used to generate policy keys
   */
  struct ANASTASIS_CRYPTO_KeyShareP key_share;

  /**
   * Nonce used for the symmetric encryption.
   */
  struct ANASTASIS_CRYPTO_NonceP nonce;

  /**
   * Key used to encrypt this truth
   */
  struct ANASTASIS_CRYPTO_TruthKeyP truth_key;

  /**
   * Server salt used to derive user identifier
   */
  struct ANASTASIS_CRYPTO_ProviderSaltP provider_salt;

  /**
   * Server salt used to derive hash from security answer
   */
  struct ANASTASIS_CRYPTO_QuestionSaltP salt;

  /**
   * Url of the server
   */
  char *url;

  /**
   * Method used for this truth
   */
  char *type;

  /**
   * Instructions for the user to recover this truth.
   */
  char *instructions;

  /**
   * Mime type of the truth, NULL if not given.
   */
  char *mime_type;

};


struct ANASTASIS_Truth *
ANASTASIS_truth_from_json (const json_t *json)
{
  struct ANASTASIS_Truth *t = GNUNET_new (struct ANASTASIS_Truth);
  const char *url;
  const char *type;
  const char *instructions;
  const char *mime_type = NULL;
  struct GNUNET_JSON_Specification spec[] = {
    GNUNET_JSON_spec_string ("url",
                             &url),
    GNUNET_JSON_spec_string ("type",
                             &type),
    GNUNET_JSON_spec_string ("instructions",
                             &instructions),
    GNUNET_JSON_spec_mark_optional (
      GNUNET_JSON_spec_string ("mime_type",
                               &mime_type)),
    GNUNET_JSON_spec_fixed_auto ("uuid",
                                 &t->uuid),
    GNUNET_JSON_spec_fixed_auto ("nonce",
                                 &t->nonce),
    GNUNET_JSON_spec_fixed_auto ("key_share",
                                 &t->key_share),
    GNUNET_JSON_spec_fixed_auto ("truth_key",
                                 &t->truth_key),
    GNUNET_JSON_spec_fixed_auto ("salt",
                                 &t->salt),
    GNUNET_JSON_spec_fixed_auto ("provider_salt",
                                 &t->provider_salt),
    GNUNET_JSON_spec_end ()
  };

  if (GNUNET_OK !=
      GNUNET_JSON_parse (json,
                         spec,
                         NULL, NULL))
  {
    GNUNET_break_op (0);
    GNUNET_free (t);
    return NULL;
  }
  t->url = GNUNET_strdup (url);
  t->type = GNUNET_strdup (type);
  t->instructions = GNUNET_strdup (instructions);
  if (NULL != mime_type)
    t->mime_type = GNUNET_strdup (mime_type);
  return t;
}


json_t *
ANASTASIS_truth_to_json (const struct ANASTASIS_Truth *t)
{
  return GNUNET_JSON_PACK (
    GNUNET_JSON_pack_data_auto ("uuid",
                                &t->uuid),
    GNUNET_JSON_pack_data_auto ("key_share",
                                &t->key_share),
    GNUNET_JSON_pack_data_auto ("truth_key",
                                &t->truth_key),
    GNUNET_JSON_pack_data_auto ("salt",
                                &t->salt),
    GNUNET_JSON_pack_data_auto ("nonce",
                                &t->nonce),
    GNUNET_JSON_pack_data_auto ("provider_salt",
                                &t->provider_salt),
    GNUNET_JSON_pack_string ("url",
                             t->url),
    GNUNET_JSON_pack_string ("type",
                             t->type),
    GNUNET_JSON_pack_string ("instructions",
                             t->instructions),
    GNUNET_JSON_pack_allow_null (
      GNUNET_JSON_pack_string ("mime_type",
                               t->mime_type)));
}


struct ANASTASIS_TruthUpload
{

  /**
   * User identifier used for the keyshare encryption
   */
  struct ANASTASIS_CRYPTO_UserIdentifierP id;

  /**
   * CURL Context for the Post Request
   */
  struct GNUNET_CURL_Context *ctx;

  /**
   * Callback which sends back the generated truth object later used to build the policy
   */
  ANASTASIS_TruthCallback tc;

  /**
   * Closure for the Callback
   */
  void *tc_cls;

  /**
   * Reference to the Truthstore Operation
   */
  struct ANASTASIS_TruthStoreOperation *tso;

  /**
   * The truth we are uploading.
   */
  struct ANASTASIS_Truth *t;

};


/**
 * Function called with the result of trying to upload truth.
 *
 * @param cls our `struct ANASTASIS_TruthUpload`
 * @param ud details about the upload result
 */
static void
truth_store_callback (void *cls,
                      const struct ANASTASIS_UploadDetails *ud)
{
  struct ANASTASIS_TruthUpload *tu = cls;

  tu->tso = NULL;
  tu->tc (tu->tc_cls,
          tu->t,
          ud);
  tu->t = NULL;
  ANASTASIS_truth_upload_cancel (tu);
}


struct ANASTASIS_TruthUpload *
ANASTASIS_truth_upload3 (struct GNUNET_CURL_Context *ctx,
                         const struct ANASTASIS_CRYPTO_UserIdentifierP *user_id,
                         struct ANASTASIS_Truth *t,
                         const void *truth_data,
                         size_t truth_data_size,
                         uint32_t payment_years_requested,
                         struct GNUNET_TIME_Relative pay_timeout,
                         ANASTASIS_TruthCallback tc,
                         void *tc_cls)
{
  struct ANASTASIS_TruthUpload *tu;
  struct ANASTASIS_CRYPTO_EncryptedKeyShareP encrypted_key_share;
  struct GNUNET_HashCode nt;
  void *encrypted_truth;
  size_t encrypted_truth_size;

  tu = GNUNET_new (struct ANASTASIS_TruthUpload);
  tu->tc = tc;
  tu->tc_cls = tc_cls;
  tu->ctx = ctx;
  tu->id = *user_id;
  tu->tc = tc;
  tu->tc_cls = tc_cls;
  tu->t = t;

  if (0 == strcmp ("question",
                   t->type))
  {
    char *answer;

    answer = GNUNET_strndup (truth_data,
                             truth_data_size);
    ANASTASIS_CRYPTO_secure_answer_hash (answer,
                                         &t->uuid,
                                         &t->salt,
                                         &nt);
    ANASTASIS_CRYPTO_keyshare_encrypt (&t->key_share,
                                       &tu->id,
                                       answer,
                                       &encrypted_key_share);
    GNUNET_free (answer);
    truth_data = &nt;
    truth_data_size = sizeof (nt);
  }
  else
  {
    ANASTASIS_CRYPTO_keyshare_encrypt (&t->key_share,
                                       &tu->id,
                                       NULL,
                                       &encrypted_key_share);
  }
  ANASTASIS_CRYPTO_truth_encrypt (&t->nonce,
                                  &t->truth_key,
                                  truth_data,
                                  truth_data_size,
                                  &encrypted_truth,
                                  &encrypted_truth_size);
  tu->tso = ANASTASIS_truth_store (tu->ctx,
                                   t->url,
                                   &t->uuid,
                                   t->type,
                                   &encrypted_key_share,
                                   t->mime_type,
                                   encrypted_truth_size,
                                   encrypted_truth,
                                   payment_years_requested,
                                   pay_timeout,
                                   &truth_store_callback,
                                   tu);
  GNUNET_free (encrypted_truth);
  if (NULL == tu->tso)
  {
    GNUNET_break (0);
    ANASTASIS_truth_free (t);
    ANASTASIS_truth_upload_cancel (tu);
    return NULL;
  }
  return tu;
}


struct ANASTASIS_TruthUpload *
ANASTASIS_truth_upload2 (
  struct GNUNET_CURL_Context *ctx,
  const struct ANASTASIS_CRYPTO_UserIdentifierP *user_id,
  const char *provider_url,
  const char *type,
  const char *instructions,
  const char *mime_type,
  const struct ANASTASIS_CRYPTO_ProviderSaltP *provider_salt,
  const void *truth_data,
  size_t truth_data_size,
  uint32_t payment_years_requested,
  struct GNUNET_TIME_Relative pay_timeout,
  const struct ANASTASIS_CRYPTO_NonceP *nonce,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *uuid,
  const struct ANASTASIS_CRYPTO_QuestionSaltP *salt,
  const struct ANASTASIS_CRYPTO_TruthKeyP *truth_key,
  const struct ANASTASIS_CRYPTO_KeyShareP *key_share,
  ANASTASIS_TruthCallback tc,
  void *tc_cls)
{
  struct ANASTASIS_Truth *t;

  t = GNUNET_new (struct ANASTASIS_Truth);
  t->url = GNUNET_strdup (provider_url);
  t->type = GNUNET_strdup (type);
  t->instructions = (NULL != instructions)
    ? GNUNET_strdup (instructions)
    : NULL;
  t->mime_type = (NULL != mime_type)
    ? GNUNET_strdup (mime_type)
    : NULL;
  t->provider_salt = *provider_salt;
  t->salt = *salt;
  t->nonce = *nonce;
  t->uuid = *uuid;
  t->truth_key = *truth_key;
  t->key_share = *key_share;
  return ANASTASIS_truth_upload3 (ctx,
                                  user_id,
                                  t,
                                  truth_data,
                                  truth_data_size,
                                  payment_years_requested,
                                  pay_timeout,
                                  tc,
                                  tc_cls);
}


struct ANASTASIS_TruthUpload *
ANASTASIS_truth_upload (
  struct GNUNET_CURL_Context *ctx,
  const struct ANASTASIS_CRYPTO_UserIdentifierP *user_id,
  const char *provider_url,
  const char *type,
  const char *instructions,
  const char *mime_type,
  const struct ANASTASIS_CRYPTO_ProviderSaltP *provider_salt,
  const void *truth_data,
  size_t truth_data_size,
  uint32_t payment_years_requested,
  struct GNUNET_TIME_Relative pay_timeout,
  ANASTASIS_TruthCallback tc,
  void *tc_cls)
{
  struct ANASTASIS_CRYPTO_QuestionSaltP question_salt;
  struct ANASTASIS_CRYPTO_TruthUUIDP uuid;
  struct ANASTASIS_CRYPTO_TruthKeyP truth_key;
  struct ANASTASIS_CRYPTO_KeyShareP key_share;
  struct ANASTASIS_CRYPTO_NonceP nonce;

  GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_NONCE,
                              &nonce,
                              sizeof (nonce));
  GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_NONCE,
                              &question_salt,
                              sizeof (question_salt));
  GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_NONCE,
                              &uuid,
                              sizeof (uuid));
  GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_STRONG,
                              &truth_key,
                              sizeof (truth_key));
  ANASTASIS_CRYPTO_keyshare_create (&key_share);
  return ANASTASIS_truth_upload2 (ctx,
                                  user_id,
                                  provider_url,
                                  type,
                                  instructions,
                                  mime_type,
                                  provider_salt,
                                  truth_data,
                                  truth_data_size,
                                  payment_years_requested,
                                  pay_timeout,
                                  &nonce,
                                  &uuid,
                                  &question_salt,
                                  &truth_key,
                                  &key_share,
                                  tc,
                                  tc_cls);
}


void
ANASTASIS_truth_upload_cancel (struct ANASTASIS_TruthUpload *tu)
{
  if (NULL != tu->tso)
  {
    ANASTASIS_truth_store_cancel (tu->tso);
    tu->tso = NULL;
  }
  if (NULL != tu->t)
  {
    ANASTASIS_truth_free (tu->t);
    tu->t = NULL;
  }
  GNUNET_free (tu);
}


void
ANASTASIS_truth_free (struct ANASTASIS_Truth *t)
{
  GNUNET_free (t->url);
  GNUNET_free (t->type);
  GNUNET_free (t->instructions);
  GNUNET_free (t->mime_type);
  GNUNET_free (t);
}


struct ANASTASIS_Policy
{
  /**
   * Encrypted policy master key
   */
  struct ANASTASIS_CRYPTO_PolicyKeyP policy_key;

  /**
   * Salt used to encrypt the master key
   */
  struct ANASTASIS_CRYPTO_MasterSaltP salt;

  /**
   * Array of truths
   */
  struct ANASTASIS_Truth **truths;

  /**
   * Length of @ truths array.
   */
  uint32_t truths_length;

};


/**
 * Duplicate truth object.
 *
 * @param t object to duplicate
 * @return copy of @a t
 */
static struct ANASTASIS_Truth *
truth_dup (const struct ANASTASIS_Truth *t)
{
  struct ANASTASIS_Truth *d = GNUNET_new (struct ANASTASIS_Truth);

  *d = *t;
  d->url = GNUNET_strdup (t->url);
  d->type = GNUNET_strdup (t->type);
  d->instructions = GNUNET_strdup (t->instructions);
  if (NULL != t->mime_type)
    d->mime_type = GNUNET_strdup (t->mime_type);
  return d;
}


struct ANASTASIS_Policy *
ANASTASIS_policy_create (const struct ANASTASIS_Truth *truths[],
                         unsigned int truths_len)
{
  struct ANASTASIS_Policy *p;

  p = GNUNET_new (struct ANASTASIS_Policy);
  GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_NONCE,
                              &p->salt,
                              sizeof (p->salt));
  {
    struct ANASTASIS_CRYPTO_KeyShareP key_shares[truths_len];

    for (unsigned int i = 0; i < truths_len; i++)
      key_shares[i] = truths[i]->key_share;
    ANASTASIS_CRYPTO_policy_key_derive (key_shares,
                                        truths_len,
                                        &p->salt,
                                        &p->policy_key);
  }
  p->truths = GNUNET_new_array (truths_len,
                                struct ANASTASIS_Truth *);
  for (unsigned int i = 0; i<truths_len; i++)
    p->truths[i] = truth_dup (truths[i]);
  p->truths_length = truths_len;
  return p;
}


void
ANASTASIS_policy_destroy (struct ANASTASIS_Policy *p)
{
  for (unsigned int i = 0; i<p->truths_length; i++)
    ANASTASIS_truth_free (p->truths[i]);
  GNUNET_free (p->truths);
  GNUNET_free (p);
}


/**
 * State for a "policy store" CMD.
 */
struct PolicyStoreState
{
  /**
   * User identifier used as entropy source for the account public key
   */
  struct ANASTASIS_CRYPTO_UserIdentifierP id;

  /**
   * Hash of the current upload.  Used to check the server's response.
   */
  struct GNUNET_HashCode curr_hash;

  /**
   * Payment identifier.
   */
  struct ANASTASIS_PaymentSecretP payment_secret;

  /**
   * Server salt. Points into a truth object from which we got the
   * salt.
   */
  struct ANASTASIS_CRYPTO_ProviderSaltP server_salt;

  /**
   * The /policy POST operation handle.
   */
  struct ANASTASIS_PolicyStoreOperation *pso;

  /**
   * URL of the anastasis backend.
   */
  char *anastasis_url;

  /**
   * Payment request returned by this provider, if any.
   */
  char *payment_request;

  /**
   * reference to SecretShare
   */
  struct ANASTASIS_SecretShare *ss;

  /**
   * Version of the policy created at the provider.
   */
  unsigned long long policy_version;

  /**
   * When will the policy expire at the provider.
   */
  struct GNUNET_TIME_Absolute policy_expiration;

};

/**
* Defines a recovery document upload process (recovery document consists of multiple policies)
*/
struct ANASTASIS_SecretShare
{
  /**
   * Closure for the Result Callback
   */
  struct GNUNET_CURL_Context *ctx;

  /**
   * Callback which gives back the result of the POST Request
   */
  ANASTASIS_ShareResultCallback src;

  /**
   * Closure for the Result Callback
   */
  void *src_cls;

  /**
   * References for the upload states and operations (size of truths passed)
   */
  struct PolicyStoreState *pss;

  /**
   * Closure for the Result Callback
   */
  unsigned int pss_length;
};


/**
 * Callback to process a POST /policy request
 *
 * @param cls closure
 * @param ud the decoded response body
 */
static void
policy_store_cb (void *cls,
                 const struct ANASTASIS_UploadDetails *ud)
{
  struct PolicyStoreState *pss = cls;
  struct ANASTASIS_SecretShare *ss = pss->ss;
  enum ANASTASIS_UploadStatus us;

  pss->pso = NULL;
  if (NULL == ud)
    us = ANASTASIS_US_HTTP_ERROR;
  else
    us = ud->us;
  if ( (ANASTASIS_US_SUCCESS == us) &&
       (0 != GNUNET_memcmp (&pss->curr_hash,
                            ud->details.success.curr_backup_hash)) )
  {
    GNUNET_break_op (0);
    us = ANASTASIS_US_SERVER_ERROR;
  }
  switch (us)
  {
  case ANASTASIS_US_SUCCESS:
    pss->policy_version = ud->details.success.policy_version;
    pss->policy_expiration = ud->details.success.policy_expiration;
    break;
  case ANASTASIS_US_PAYMENT_REQUIRED:
    pss->payment_request = GNUNET_strdup (ud->details.payment.payment_request);
    pss->payment_secret = ud->details.payment.ps;
    break;
  case ANASTASIS_US_HTTP_ERROR:
  case ANASTASIS_US_CLIENT_ERROR:
  case ANASTASIS_US_SERVER_ERROR:
    {
      struct ANASTASIS_ShareResult sr = {
        .ss = ANASTASIS_SHARE_STATUS_PROVIDER_FAILED,
        .details.provider_failure.provider_url = pss->anastasis_url,
        .details.provider_failure.http_status = ud->http_status,
        .details.provider_failure.ec = ud->ec,
      };

      ss->src (ss->src_cls,
               &sr);
      ANASTASIS_secret_share_cancel (ss);
      return;
    }
  case ANASTASIS_US_CONFLICTING_TRUTH:
    GNUNET_break (0);
    break;
  }
  for (unsigned int i = 0; i<ss->pss_length; i++)
    if (NULL != ss->pss[i].pso)
      /* some upload is still pending, let's wait for it to finish */
      return;

  {
    struct ANASTASIS_SharePaymentRequest spr[GNUNET_NZL (ss->pss_length)];
    struct ANASTASIS_ProviderSuccessStatus apss[GNUNET_NZL (ss->pss_length)];
    unsigned int off = 0;
    unsigned int voff = 0;
    struct ANASTASIS_ShareResult sr;

    for (unsigned int i = 0; i<ss->pss_length; i++)
    {
      struct PolicyStoreState *pssi = &ss->pss[i];

      if (NULL == pssi->payment_request)
      {
        apss[voff].policy_version = pssi->policy_version;
        apss[voff].provider_url = pssi->anastasis_url;
        apss[voff].policy_expiration = pssi->policy_expiration;
        voff++;
      }
      else
      {
        spr[off].payment_request_url = pssi->payment_request;
        spr[off].provider_url = pssi->anastasis_url;
        spr[off].payment_secret = pssi->payment_secret;
        off++;
      }
    }
    if (off > 0)
    {
      sr.ss = ANASTASIS_SHARE_STATUS_PAYMENT_REQUIRED;
      sr.details.payment_required.payment_requests = spr;
      sr.details.payment_required.payment_requests_length = off;
    }
    else
    {
      sr.ss = ANASTASIS_SHARE_STATUS_SUCCESS;
      sr.details.success.pss = apss;
      sr.details.success.num_providers = voff;
    }
    ss->src (ss->src_cls,
             &sr);
  }
  ANASTASIS_secret_share_cancel (ss);
}


struct ANASTASIS_SecretShare *
ANASTASIS_secret_share (struct GNUNET_CURL_Context *ctx,
                        const json_t *id_data,
                        const struct ANASTASIS_ProviderDetails providers[],
                        unsigned int pss_length,
                        const struct ANASTASIS_Policy *policies[],
                        unsigned int policies_len,
                        uint32_t payment_years_requested,
                        struct GNUNET_TIME_Relative pay_timeout,
                        ANASTASIS_ShareResultCallback src,
                        void *src_cls,
                        const char *secret_name,
                        const void *core_secret,
                        size_t core_secret_size)
{
  struct ANASTASIS_SecretShare *ss;
  struct ANASTASIS_CoreSecretEncryptionResult *cser;
  json_t *dec_policies;
  json_t *esc_methods;
  size_t recovery_document_size;
  char *recovery_document_str;

  if (0 == pss_length)
  {
    GNUNET_break (0);
    return NULL;
  }
  ss = GNUNET_new (struct ANASTASIS_SecretShare);
  ss->src = src;
  ss->src_cls = src_cls;
  ss->pss = GNUNET_new_array (pss_length,
                              struct PolicyStoreState);
  ss->pss_length = pss_length;
  ss->ctx = ctx;

  {
    struct ANASTASIS_CRYPTO_PolicyKeyP policy_keys[GNUNET_NZL (policies_len)];

    for (unsigned int i = 0; i < policies_len; i++)
      policy_keys[i] = policies[i]->policy_key;
    cser = ANASTASIS_CRYPTO_core_secret_encrypt (policy_keys,
                                                 policies_len,
                                                 core_secret,
                                                 core_secret_size);
  }
  dec_policies = json_array ();
  GNUNET_assert (NULL != dec_policies);
  for (unsigned int k = 0; k < policies_len; k++)
  {
    const struct ANASTASIS_Policy *policy = policies[k];
    json_t *uuids = json_array ();

    GNUNET_assert (NULL != uuids);
    for (unsigned int b = 0; b < policy->truths_length; b++)
      GNUNET_assert (0 ==
                     json_array_append_new (
                       uuids,
                       GNUNET_JSON_from_data_auto (
                         &policy->truths[b]->uuid)));
    GNUNET_assert (0 ==
                   json_array_append_new (
                     dec_policies,
                     GNUNET_JSON_PACK (
                       GNUNET_JSON_pack_data_varsize ("master_key",
                                                      cser->enc_master_keys[k],
                                                      cser->enc_master_key_sizes
                                                      [k]),
                       GNUNET_JSON_pack_array_steal ("uuids",
                                                     uuids),
                       GNUNET_JSON_pack_data_auto ("salt",
                                                   &policy->salt))));
  }

  esc_methods = json_array ();
  for (unsigned int k = 0; k < policies_len; k++)
  {
    const struct ANASTASIS_Policy *policy = policies[k];

    for (unsigned int l = 0; l < policy->truths_length; l++)
    {
      const struct ANASTASIS_Truth *pt = policy->truths[l];
      bool unique = true;

      /* Only append each truth once */
      for (unsigned int k2 = 0; k2 < k; k2++)
      {
        const struct ANASTASIS_Policy *p2 = policies[k2];
        for (unsigned int l2 = 0; l2 < p2->truths_length; l2++)
          if (0 ==
              GNUNET_memcmp (&pt->uuid,
                             &p2->truths[l2]->uuid))
          {
            unique = false;
            break;
          }
        if (! unique)
          break;
      }
      if (! unique)
        continue;

      GNUNET_assert (0 ==
                     json_array_append_new (
                       esc_methods,
                       GNUNET_JSON_PACK (
                         GNUNET_JSON_pack_data_auto ("uuid",
                                                     &pt->uuid),
                         GNUNET_JSON_pack_string ("url",
                                                  pt->url),
                         GNUNET_JSON_pack_string ("instructions",
                                                  pt->instructions),
                         GNUNET_JSON_pack_data_auto ("truth_key",
                                                     &pt->truth_key),
                         GNUNET_JSON_pack_data_auto ("truth_salt",
                                                     &pt->salt),
                         GNUNET_JSON_pack_data_auto ("provider_salt",
                                                     &pt->provider_salt),
                         GNUNET_JSON_pack_string ("escrow_type",
                                                  pt->type))));
    }
  }

  {
    json_t *recovery_document;
    size_t rd_size;
    char *rd_str;
    Bytef *cbuf;
    uLongf cbuf_size;
    int ret;
    uint32_t be_size;

    recovery_document = GNUNET_JSON_PACK (
      GNUNET_JSON_pack_allow_null (
        GNUNET_JSON_pack_string ("secret_name",
                                 secret_name)),
      GNUNET_JSON_pack_array_steal ("policies",
                                    dec_policies),
      GNUNET_JSON_pack_array_steal ("escrow_methods",
                                    esc_methods),
      GNUNET_JSON_pack_data_varsize ("encrypted_core_secret",
                                     cser->enc_core_secret,
                                     cser->enc_core_secret_size));
    GNUNET_assert (NULL != recovery_document);
    ANASTASIS_CRYPTO_destroy_encrypted_core_secret (cser);
    cser = NULL;

    rd_str = json_dumps (recovery_document,
                         JSON_COMPACT | JSON_SORT_KEYS);
    GNUNET_assert (NULL != rd_str);
    json_decref (recovery_document);
    rd_size = strlen (rd_str);
    cbuf_size = compressBound (rd_size);
    be_size = htonl ((uint32_t) rd_size);
    cbuf = GNUNET_malloc (cbuf_size + sizeof (uint32_t));
    memcpy (cbuf,
            &be_size,
            sizeof (uint32_t));
    ret = compress (cbuf + sizeof (uint32_t),
                    &cbuf_size,
                    (const Bytef *) rd_str,
                    rd_size);
    if (Z_OK != ret)
    {
      /* compression failed!? */
      GNUNET_break (0);
      free (rd_str);
      GNUNET_free (cbuf);
      ANASTASIS_secret_share_cancel (ss);
      return NULL;
    }
    free (rd_str);
    recovery_document_size = (size_t) (cbuf_size + sizeof (uint32_t));
    recovery_document_str = (char *) cbuf;
  }

  for (unsigned int l = 0; l < ss->pss_length; l++)
  {
    struct PolicyStoreState *pss = &ss->pss[l];
    void *recovery_data;
    size_t recovery_data_size;
    struct ANASTASIS_CRYPTO_AccountPrivateKeyP anastasis_priv;

    pss->ss = ss;
    pss->anastasis_url = GNUNET_strdup (providers[l].provider_url);
    pss->server_salt = providers[l].provider_salt;
    pss->payment_secret = providers[l].payment_secret;
    ANASTASIS_CRYPTO_user_identifier_derive (id_data,
                                             &pss->server_salt,
                                             &pss->id);
    ANASTASIS_CRYPTO_account_private_key_derive (&pss->id,
                                                 &anastasis_priv);
    ANASTASIS_CRYPTO_recovery_document_encrypt (&pss->id,
                                                recovery_document_str,
                                                recovery_document_size,
                                                &recovery_data,
                                                &recovery_data_size);
    GNUNET_CRYPTO_hash (recovery_data,
                        recovery_data_size,
                        &pss->curr_hash);
    pss->pso = ANASTASIS_policy_store (
      ss->ctx,
      pss->anastasis_url,
      &anastasis_priv,
      recovery_data,
      recovery_data_size,
      payment_years_requested,
      (! GNUNET_is_zero (&pss->payment_secret))
      ? &pss->payment_secret
      : NULL,
      pay_timeout,
      &policy_store_cb,
      pss);
    GNUNET_free (recovery_data);
    if (NULL == pss->pso)
    {
      GNUNET_break (0);
      ANASTASIS_secret_share_cancel (ss);
      GNUNET_free (recovery_document_str);
      return NULL;
    }
  }
  GNUNET_free (recovery_document_str);
  return ss;
}


void
ANASTASIS_secret_share_cancel (struct ANASTASIS_SecretShare *ss)
{
  for (unsigned int i = 0; i<ss->pss_length; i++)
  {
    struct PolicyStoreState *pssi = &ss->pss[i];

    if (NULL != pssi->pso)
    {
      ANASTASIS_policy_store_cancel (pssi->pso);
      pssi->pso = NULL;
    }
    GNUNET_free (pssi->anastasis_url);
    GNUNET_free (pssi->payment_request);
  }
  GNUNET_free (ss->pss);
  GNUNET_free (ss);
}
