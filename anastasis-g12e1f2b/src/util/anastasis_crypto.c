/*
  This file is part of Anastasis
  Copyright (C) 2020 Anastasis SARL

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
 * @file util/anastasis_crypto.c
 * @brief anastasis crypto api
 * @author Christian Grothoff
 * @author Dominik Meister
 * @author Dennis Neufeld
 */
#include "platform.h"
#include "anastasis_crypto_lib.h"
#include <gcrypt.h>
#include <taler/taler_json_lib.h>
#include <gnunet/gnunet_util_lib.h>
#include <string.h>


void
ANASTASIS_hash_answer (uint64_t code,
                       struct GNUNET_HashCode *hashed_code)
{
  char cbuf[40];

  GNUNET_snprintf (cbuf,
                   sizeof (cbuf),
                   "%llu",
                   (unsigned long long) code);
  GNUNET_CRYPTO_hash (cbuf,
                      strlen (cbuf),
                      hashed_code);
}


void
ANASTASIS_CRYPTO_secure_answer_hash (
  const char *answer,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *uuid,
  const struct ANASTASIS_CRYPTO_QuestionSaltP *salt,
  struct GNUNET_HashCode *result)
{
  struct GNUNET_HashCode pow;

  GNUNET_CRYPTO_pow_hash (&salt->pow_salt,
                          answer,
                          strlen (answer),
                          &pow);
  GNUNET_assert (GNUNET_YES ==
                 GNUNET_CRYPTO_kdf (
                   result,
                   sizeof (*result),
                   /* salt / XTS */
                   uuid,
                   sizeof (*uuid),
                   /* skm */
                   &pow,
                   sizeof (pow),
                   /* info chunks */
                   "anastasis-secure-question-hashing",
                   strlen ("anastasis-secure-question-hashing"),
                   NULL,
                   0));
}


/**
 * Compute @a key.
 *
 * @param key_material key for calculation
 * @param key_m_len length of key
 * @param nonce nonce for calculation
 * @param salt salt value for calculation
 * @param[out] key where to write the en-/description key
 */
static void
derive_key (const void *key_material,
            size_t key_m_len,
            const struct ANASTASIS_CRYPTO_NonceP *nonce,
            const char *salt,
            struct ANASTASIS_CRYPTO_SymKeyP *key)
{
  if (GNUNET_YES !=
      GNUNET_CRYPTO_kdf (key,
                         sizeof (struct ANASTASIS_CRYPTO_SymKeyP),
                         /* salt / XTS */
                         nonce,
                         sizeof (struct ANASTASIS_CRYPTO_NonceP),
                         /* ikm */
                         key_material,
                         key_m_len,
                         /* info chunks */
                         /* The "salt" passed here is actually not something random,
                            but a protocol-specific identifier string.  Thus
                            we pass it as a context info to the HKDF */
                         salt,
                         strlen (salt),
                         NULL,
                         0))
  {
    // FIXME: Huh?!  Why would we continue here?
    GNUNET_break (0);
    return;
  }
}


/**
 * Encryption of data like recovery document etc.
 *
 * @param nonce value to use for the nonce
 * @param key key which is used to derive a key/iv pair from
 * @param key_len length of key
 * @param data data to encrypt
 * @param data_size size of the data
 * @param salt salt value which is used for key derivation
 * @param[out] res ciphertext output
 * @param[out] res_size size of the ciphertext
 */
static void
anastasis_encrypt (const struct ANASTASIS_CRYPTO_NonceP *nonce,
                   const void *key,
                   size_t key_len,
                   const void *data,
                   size_t data_size,
                   const char *salt,
                   void **res,
                   size_t *res_size)
{
  size_t ciphertext_size;
  struct ANASTASIS_CRYPTO_SymKeyP skey;

  derive_key (key,
              key_len,
              nonce,
              salt,
              &skey);
  ciphertext_size = crypto_secretbox_NONCEBYTES
                    + crypto_secretbox_MACBYTES + data_size;
  *res_size = ciphertext_size;
  *res = GNUNET_malloc (ciphertext_size);
  memcpy (*res, nonce, crypto_secretbox_NONCEBYTES);
  GNUNET_assert (0 ==
                 crypto_secretbox_easy (*res + crypto_secretbox_NONCEBYTES,
                                        data,
                                        data_size,
                                        (void *) nonce,
                                        (void *) &skey));
}


/**
 * Decryption of data like encrypted recovery document etc.
 *
 * @param key key which is used to derive a key/iv pair from
 * @param key_len length of key
 * @param data data to decrypt
 * @param data_size size of the data
 * @param salt salt value which is used for key derivation
 * @param[out] res plaintext output
 * @param[out] res_size size of the plaintext
 */
static void
anastasis_decrypt (const void *key,
                   size_t key_len,
                   const void *data,
                   size_t data_size,
                   const char *salt,
                   void **res,
                   size_t *res_size)
{
  const struct ANASTASIS_CRYPTO_NonceP *nonce;
  struct ANASTASIS_CRYPTO_SymKeyP skey;
  size_t plaintext_size;

  GNUNET_assert (data_size >= crypto_secretbox_NONCEBYTES
                 + crypto_secretbox_MACBYTES);
  nonce = data;
  derive_key (key,
              key_len,
              nonce,
              salt,
              &skey);
  plaintext_size = data_size - (crypto_secretbox_NONCEBYTES
                                + crypto_secretbox_MACBYTES);
  *res = GNUNET_malloc (plaintext_size);
  *res_size = plaintext_size;
  if (0 != crypto_secretbox_open_easy (*res,
                                       data + crypto_secretbox_NONCEBYTES,
                                       data_size - crypto_secretbox_NONCEBYTES,
                                       (void *) nonce,
                                       (void *) &skey))
  {
    GNUNET_break (0);
    GNUNET_free (*res);
  }
}


void
ANASTASIS_CRYPTO_user_identifier_derive (
  const json_t *id_data,
  const struct ANASTASIS_CRYPTO_ProviderSaltP *server_salt,
  struct ANASTASIS_CRYPTO_UserIdentifierP *id)
{
  char *json_enc;
  struct GNUNET_HashCode hash;

  json_enc = json_dumps (id_data,
                         JSON_COMPACT | JSON_SORT_KEYS);
  GNUNET_assert (NULL != json_enc);
  GNUNET_CRYPTO_pow_hash (&server_salt->salt,
                          json_enc,
                          strlen (json_enc),
                          &hash);
  id->hash = hash;
  free (json_enc);
}


void
ANASTASIS_CRYPTO_account_private_key_derive (
  const struct ANASTASIS_CRYPTO_UserIdentifierP *id,
  struct ANASTASIS_CRYPTO_AccountPrivateKeyP *priv_key)
{
  /* priv_key = ver_secret */
  if (GNUNET_YES !=
      GNUNET_CRYPTO_kdf (&priv_key->priv,
                         sizeof (priv_key->priv),
                         /* salt / XTS */
                         NULL,
                         0,
                         /* ikm */
                         id,
                         sizeof (struct ANASTASIS_CRYPTO_UserIdentifierP),
                         /* context chunks */
                         "ver",
                         strlen ("ver"),
                         NULL,
                         0))
  {
    GNUNET_break (0);
    return;
  }
}


void
ANASTASIS_CRYPTO_account_public_key_derive (
  const struct ANASTASIS_CRYPTO_UserIdentifierP *id,
  struct ANASTASIS_CRYPTO_AccountPublicKeyP *pub_key)
{
  struct ANASTASIS_CRYPTO_AccountPrivateKeyP priv;

  ANASTASIS_CRYPTO_account_private_key_derive (id,
                                               &priv);
  GNUNET_CRYPTO_eddsa_key_get_public (&priv.priv,
                                      &pub_key->pub);
}


void
ANASTASIS_CRYPTO_recovery_document_encrypt (
  const struct ANASTASIS_CRYPTO_UserIdentifierP *id,
  const void *rec_doc,
  size_t rd_size,
  void **enc_rec_doc,
  size_t *erd_size)
{
  const char *salt = "erd";
  struct ANASTASIS_CRYPTO_NonceP nonce;

  GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_NONCE,
                              &nonce,
                              sizeof (nonce));
  anastasis_encrypt (&nonce,
                     id,
                     sizeof (struct ANASTASIS_CRYPTO_UserIdentifierP),
                     rec_doc,
                     rd_size,
                     salt,
                     enc_rec_doc,
                     erd_size);
}


void
ANASTASIS_CRYPTO_recovery_document_decrypt (
  const struct ANASTASIS_CRYPTO_UserIdentifierP *id,
  const void *enc_rec_doc,
  size_t erd_size,
  void **rec_doc,
  size_t *rd_size)
{
  const char *salt = "erd";

  anastasis_decrypt (id,
                     sizeof (struct ANASTASIS_CRYPTO_UserIdentifierP),
                     enc_rec_doc,
                     erd_size,
                     salt,
                     rec_doc,
                     rd_size);
}


void
ANASTASIS_CRYPTO_keyshare_encrypt (
  const struct ANASTASIS_CRYPTO_KeyShareP *key_share,
  const struct ANASTASIS_CRYPTO_UserIdentifierP *id,
  const char *xsalt,
  struct ANASTASIS_CRYPTO_EncryptedKeyShareP *enc_key_share)
{
  const char *salt = "eks";
  size_t eks_size = 0;
  void *eks = NULL;
  struct ANASTASIS_CRYPTO_NonceP nonce;

  GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_NONCE,
                              &nonce,
                              sizeof (nonce));
  anastasis_encrypt (&nonce,
                     id,
                     sizeof (struct ANASTASIS_CRYPTO_UserIdentifierP),
                     key_share,
                     sizeof (struct ANASTASIS_CRYPTO_KeyShareP),
                     (NULL == xsalt) ? salt : xsalt,
                     &eks,
                     &eks_size);
  GNUNET_assert (eks_size ==
                 sizeof (struct ANASTASIS_CRYPTO_EncryptedKeyShareP));
  memcpy (enc_key_share,
          eks,
          sizeof (struct ANASTASIS_CRYPTO_EncryptedKeyShareP));
  GNUNET_free (eks);
}


void
ANASTASIS_CRYPTO_keyshare_decrypt (
  const struct ANASTASIS_CRYPTO_EncryptedKeyShareP *enc_key_share,
  const struct ANASTASIS_CRYPTO_UserIdentifierP *id,
  const char *xsalt,
  struct ANASTASIS_CRYPTO_KeyShareP *key_share)
{
  const char *salt = "eks";
  size_t ks_size = 0;
  void *ks = NULL;

  anastasis_decrypt (id,
                     sizeof (struct ANASTASIS_CRYPTO_UserIdentifierP),
                     enc_key_share,
                     sizeof (struct ANASTASIS_CRYPTO_EncryptedKeyShareP),
                     (NULL == xsalt) ? salt : xsalt,
                     &ks,
                     &ks_size);
  GNUNET_assert (ks_size ==
                 sizeof (struct ANASTASIS_CRYPTO_KeyShareP));
  memcpy (key_share,
          ks,
          sizeof (struct ANASTASIS_CRYPTO_KeyShareP));
  GNUNET_free (ks);
}


void
ANASTASIS_CRYPTO_truth_encrypt (
  const struct ANASTASIS_CRYPTO_NonceP *nonce,
  const struct ANASTASIS_CRYPTO_TruthKeyP *truth_enc_key,
  const void *truth,
  size_t truth_size,
  void **enc_truth,
  size_t *ect_size)
{
  const char *salt = "ect";

  anastasis_encrypt (nonce,
                     truth_enc_key,
                     sizeof (struct ANASTASIS_CRYPTO_TruthKeyP),
                     truth,
                     truth_size,
                     salt,
                     enc_truth,
                     ect_size);
}


void
ANASTASIS_CRYPTO_truth_decrypt (
  const struct ANASTASIS_CRYPTO_TruthKeyP *truth_enc_key,
  const void *enc_truth,
  size_t ect_size,
  void **truth,
  size_t *truth_size)
{
  const char *salt = "ect";

  anastasis_decrypt (truth_enc_key,
                     sizeof (struct ANASTASIS_CRYPTO_TruthKeyP),
                     enc_truth,
                     ect_size,
                     salt,
                     truth,
                     truth_size);
}


void
ANASTASIS_CRYPTO_keyshare_create (
  struct ANASTASIS_CRYPTO_KeyShareP *key_share)
{
  GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_STRONG,
                              key_share,
                              sizeof (struct ANASTASIS_CRYPTO_KeyShareP));
}


void
ANASTASIS_CRYPTO_policy_key_derive (
  const struct ANASTASIS_CRYPTO_KeyShareP *key_shares,
  unsigned int keyshare_length,
  const struct ANASTASIS_CRYPTO_MasterSaltP *salt,
  struct ANASTASIS_CRYPTO_PolicyKeyP *policy_key)
{
  GNUNET_CRYPTO_kdf (policy_key,
                     sizeof (*policy_key),
                     /* salt / XTS */
                     salt,
                     sizeof (*salt),
                     /* ikm */
                     key_shares,
                     keyshare_length * sizeof (*key_shares),
                     /* info chunks */
                     "anastasis-policy-key-derive",
                     strlen ("anastasis-policy-key-derive"),
                     NULL, 0);
}


struct ANASTASIS_CoreSecretEncryptionResult *
ANASTASIS_CRYPTO_core_secret_encrypt (
  const struct ANASTASIS_CRYPTO_PolicyKeyP *policy_keys,
  unsigned int policy_keys_length,
  const void *core_secret,
  size_t core_secret_size)
{
  struct GNUNET_HashCode master_key;
  struct ANASTASIS_CoreSecretEncryptionResult *cser;
  struct ANASTASIS_CRYPTO_NonceP nonce;

  cser = GNUNET_new (struct ANASTASIS_CoreSecretEncryptionResult);

  GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_STRONG,
                              &master_key,
                              sizeof (struct GNUNET_HashCode));
  GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_STRONG,
                              &nonce,
                              sizeof (struct ANASTASIS_CRYPTO_NonceP));

  anastasis_encrypt (&nonce,
                     &master_key,
                     sizeof (struct GNUNET_HashCode),
                     core_secret,
                     core_secret_size,
                     "cse",
                     &cser->enc_core_secret,
                     &cser->enc_core_secret_size);

  /* Allocate result arrays with NULL-termination so we don't
     need to store the length to free */
  cser->enc_master_key_sizes = GNUNET_new_array (policy_keys_length + 1,
                                                 size_t);
  cser->enc_master_keys = GNUNET_new_array (policy_keys_length + 1,
                                            void *);

  for (unsigned int i = 0; i < policy_keys_length; i++)
  {
    struct ANASTASIS_CRYPTO_NonceP nonce_i;

    GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_STRONG,
                                &nonce_i,
                                sizeof (struct ANASTASIS_CRYPTO_NonceP));

    anastasis_encrypt (&nonce_i,
                       &policy_keys[i].key,
                       sizeof (struct GNUNET_HashCode),
                       &master_key,
                       sizeof (struct GNUNET_HashCode),
                       "emk",
                       &cser->enc_master_keys[i],
                       &cser->enc_master_key_sizes[i]);
  }
  return cser;
}


/**
 * Decrypts the core secret with the master key. First the master key is decrypted with the provided policy key.
 * Afterwards the core secret is encrypted with the master key. The core secret is returned.
 *
 * @param encrypted_master_key master key for decrypting the core secret, is itself encrypted by the policy key
 * @param encrypted_master_key_size size of the encrypted master key
 * @param policy_key built policy key which will decrypt the master key
 * @param encrypted_core_secret the encrypted core secret from the user, will be encrypted with the policy key
 * @param encrypted_core_secret_size size of the encrypted core secret
 * @param[out] core_secret decrypted core secret will be returned
 * @param[out] core_secret_size size of core secret
 */
void
ANASTASIS_CRYPTO_core_secret_recover (
  const void *encrypted_master_key,
  size_t encrypted_master_key_size,
  const struct ANASTASIS_CRYPTO_PolicyKeyP *policy_key,
  const void *encrypted_core_secret,
  size_t encrypted_core_secret_size,
  void **core_secret,
  size_t *core_secret_size)
{
  void *master_key;
  size_t master_key_size;

  *core_secret = GNUNET_malloc (encrypted_core_secret_size);
  anastasis_decrypt (&policy_key->key,
                     sizeof (struct GNUNET_HashCode),
                     encrypted_master_key,
                     encrypted_master_key_size,
                     "emk",
                     &master_key,
                     &master_key_size);
  GNUNET_break (NULL != master_key);
  GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
              "At %s:%d encrypted core secret is %s-%llu b\n", __FILE__,
              __LINE__,
              TALER_b2s (encrypted_core_secret, encrypted_core_secret_size),
              (unsigned long long) encrypted_core_secret_size);
  anastasis_decrypt (master_key,
                     master_key_size,
                     encrypted_core_secret,
                     encrypted_core_secret_size,
                     "cse",
                     core_secret,
                     core_secret_size);
  GNUNET_break (NULL != *core_secret);
  GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
              "At %s:%d decrypted core secret is %s-%llu b\n", __FILE__,
              __LINE__,
              TALER_b2s (*core_secret, *core_secret_size),
              (unsigned long long) *core_secret_size);
  GNUNET_assert (GNUNET_SYSERR != *core_secret_size);
}


/**
 * Destroy a core secret encryption result.
 *
 * @param cser the result to destroy
 */
void
ANASTASIS_CRYPTO_destroy_encrypted_core_secret (
  struct ANASTASIS_CoreSecretEncryptionResult *cser)
{
  for (unsigned int i = 0; NULL != cser->enc_master_keys[i]; i++)
    GNUNET_free (cser->enc_master_keys[i]);
  GNUNET_free (cser->enc_master_keys);
  GNUNET_free (cser->enc_master_key_sizes);
  GNUNET_free (cser->enc_core_secret);
  GNUNET_free (cser);
}


/**
 * Convert a @a uuid to a shortened, human-readable string
 * useful to show to users to identify the truth.
 * Note that the return value is in a global variable and
 * only valid until the next invocation of this function.
 *
 * @param uuid UUID to convert
 * @return string representation
 */
const char *
ANASTASIS_CRYPTO_uuid2s (const struct ANASTASIS_CRYPTO_TruthUUIDP *uuid)
{
  static char uuids[7];
  char *tpk;

  tpk = GNUNET_STRINGS_data_to_string_alloc (uuid,
                                             sizeof (*uuid));
  memcpy (uuids,
          tpk,
          sizeof (uuids) - 1);
  GNUNET_free (tpk);
  return uuids;
}


/* end of anastasis_crypto.c */
