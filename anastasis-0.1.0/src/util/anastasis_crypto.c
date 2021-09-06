/*
  This file is part of Anastasis
  Copyright (C) 2020 Anastasis SARL

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
                   "Anastasis-secure-question-uuid-salting",
                   strlen ("Anastasis-secure-question-uuid-salting"),
                   &pow,
                   sizeof (pow),
                   uuid,
                   sizeof (*uuid),
                   NULL,
                   0));
}


/**
 * Compute @a key and @a iv.
 *
 * @param key_material key for calculation
 * @param key_m_len length of key
 * @param nonce nonce for calculation
 * @param salt salt value for calculation
 * @param[out] key where to write the en-/description key
 * @param[out] iv where to write the IV
 */
static void
get_iv_key (const void *key_material,
            size_t key_m_len,
            const struct ANASTASIS_CRYPTO_NonceP *nonce,
            const char *salt,
            const struct ANASTASIS_CRYPTO_SymKeyP *key,
            struct ANASTASIS_CRYPTO_IvP *iv)
{
  char res[sizeof (struct ANASTASIS_CRYPTO_SymKeyP)
           + sizeof (struct ANASTASIS_CRYPTO_IvP)];

  if (GNUNET_YES !=
      GNUNET_CRYPTO_hkdf (res,
                          sizeof (res),
                          GCRY_MD_SHA512,
                          GCRY_MD_SHA256,
                          key_material,
                          key_m_len,
                          nonce,
                          sizeof (struct ANASTASIS_CRYPTO_NonceP),
                          salt,
                          strlen (salt),
                          NULL,
                          0))
  {
    GNUNET_break (0);
    return;
  }
  memcpy ((void *) key,
          res,
          sizeof (*key));
  memcpy (iv,
          &res[sizeof (*key)],
          sizeof (*iv));
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
  struct ANASTASIS_CRYPTO_NonceP *nonceptr;
  gcry_cipher_hd_t cipher;
  struct ANASTASIS_CRYPTO_SymKeyP sym_key;
  struct ANASTASIS_CRYPTO_IvP iv;
  int rc;
  struct ANASTASIS_CRYPTO_AesTagP *tag;
  char *ciphertext;

  *res_size = data_size
              + sizeof (struct ANASTASIS_CRYPTO_NonceP)
              + sizeof (struct ANASTASIS_CRYPTO_AesTagP);
  if (*res_size <= data_size)
  {
    GNUNET_break (0);
    return;
  }
  *res = GNUNET_malloc (*res_size);
  if (*res_size != data_size
      + sizeof (struct ANASTASIS_CRYPTO_NonceP)
      + sizeof (struct ANASTASIS_CRYPTO_AesTagP))
  {
    GNUNET_break (0);
    return;
  }
  nonceptr = (struct ANASTASIS_CRYPTO_NonceP *) *res;
  tag = (struct ANASTASIS_CRYPTO_AesTagP *) &nonceptr[1];
  ciphertext = (char *) &tag[1];
  memcpy (nonceptr,
          nonce,
          sizeof (*nonce));
  get_iv_key (key,
              key_len,
              nonce,
              salt,
              &sym_key,
              &iv);
  GNUNET_assert (0 ==
                 gcry_cipher_open (&cipher,
                                   GCRY_CIPHER_AES256,
                                   GCRY_CIPHER_MODE_GCM,
                                   0));
  rc = gcry_cipher_setkey (cipher,
                           &sym_key,
                           sizeof (sym_key));
  GNUNET_assert ((0 == rc) || ((char) rc == GPG_ERR_WEAK_KEY));
  rc = gcry_cipher_setiv (cipher,
                          &iv,
                          sizeof (iv));
  GNUNET_assert ((0 == rc) || ((char) rc == GPG_ERR_WEAK_KEY));

  GNUNET_assert (0 ==
                 gcry_cipher_encrypt (cipher,
                                      ciphertext,
                                      data_size,
                                      data,
                                      data_size));
  GNUNET_assert (0 ==
                 gcry_cipher_gettag (cipher,
                                     tag,
                                     sizeof (struct ANASTASIS_CRYPTO_AesTagP)));
  gcry_cipher_close (cipher);
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
  gcry_cipher_hd_t cipher;
  const struct ANASTASIS_CRYPTO_SymKeyP sym_key;
  struct ANASTASIS_CRYPTO_IvP iv;
  int rc;
  const struct ANASTASIS_CRYPTO_AesTagP *tag;
  const char *ciphertext;

  *res_size = data_size
              - sizeof (struct ANASTASIS_CRYPTO_NonceP)
              - sizeof (struct ANASTASIS_CRYPTO_AesTagP);
  if (*res_size >= data_size)
  {
    GNUNET_break (0);
    return;
  }
  *res = GNUNET_malloc (*res_size);
  if (*res_size != data_size
      - sizeof (struct ANASTASIS_CRYPTO_NonceP)
      - sizeof (struct ANASTASIS_CRYPTO_AesTagP))
  {
    GNUNET_break (0);
    GNUNET_free (*res);
    return;
  }

  nonce = (const struct ANASTASIS_CRYPTO_NonceP *) data;
  tag = (struct ANASTASIS_CRYPTO_AesTagP *) &nonce[1];
  ciphertext = (const char *) &tag[1];
  get_iv_key (key,
              key_len,
              nonce,
              salt,
              &sym_key,
              &iv);
  GNUNET_assert (0 ==
                 gcry_cipher_open (&cipher,
                                   GCRY_CIPHER_AES256,
                                   GCRY_CIPHER_MODE_GCM,
                                   0));
  rc = gcry_cipher_setkey (cipher,
                           &sym_key,
                           sizeof (sym_key));
  GNUNET_assert ((0 == rc) || ((char) rc == GPG_ERR_WEAK_KEY));

  rc = gcry_cipher_setiv (cipher,
                          &iv,
                          sizeof (iv));
  GNUNET_assert ((0 == rc) || ((char) rc == GPG_ERR_WEAK_KEY));

  GNUNET_assert (0 == gcry_cipher_decrypt (cipher,
                                           *res,
                                           *res_size,
                                           ciphertext,
                                           *res_size));
  if (0 !=
      gcry_cipher_checktag (cipher,
                            tag,
                            sizeof (struct ANASTASIS_CRYPTO_AesTagP)))
  {
    GNUNET_break (0);
    GNUNET_free (*res);
    return;
  }
  gcry_cipher_close (cipher);
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
      GNUNET_CRYPTO_hkdf (&priv_key->priv,
                          sizeof (priv_key->priv),
                          GCRY_MD_SHA512,
                          GCRY_MD_SHA256,
                          id,
                          sizeof (struct ANASTASIS_CRYPTO_UserIdentifierP),
                          "ver",
                          strlen ("ver"),
                          NULL,
                          0))
  {
    GNUNET_break (0);
    return;
  }
  /* go from ver_secret to proper private key (eddsa_d_to_a() in spec) */
  priv_key->priv.d[0] = (priv_key->priv.d[0] & 0x7f) | 0x40;
  priv_key->priv.d[31] &= 0xf8;
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
  GNUNET_CRYPTO_hkdf (policy_key,
                      sizeof (*policy_key),
                      GCRY_MD_SHA512,
                      GCRY_MD_SHA256,
                      key_shares,
                      keyshare_length * sizeof (*key_shares),
                      salt,
                      sizeof (*salt),
                      NULL, 0);
}


void
ANASTASIS_CRYPTO_core_secret_encrypt (
  const struct ANASTASIS_CRYPTO_PolicyKeyP *policy_keys,
  unsigned int policy_keys_length,
  const void *core_secret,
  size_t core_secret_size,
  void **enc_core_secret,
  struct ANASTASIS_CRYPTO_EncryptedMasterKeyP *encrypted_master_keys)
{
  struct GNUNET_CRYPTO_SymmetricSessionKey sk;
  struct GNUNET_CRYPTO_SymmetricInitializationVector iv;
  struct GNUNET_HashCode master_key;

  *enc_core_secret = GNUNET_malloc (core_secret_size);
  GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_STRONG,
                              &master_key,
                              sizeof (struct GNUNET_HashCode));
  GNUNET_CRYPTO_hash_to_aes_key (&master_key,
                                 &sk,
                                 &iv);
  GNUNET_assert (GNUNET_SYSERR !=
                 GNUNET_CRYPTO_symmetric_encrypt (core_secret,
                                                  core_secret_size,
                                                  &sk,
                                                  &iv,
                                                  *enc_core_secret));
  for (unsigned int i = 0; i < policy_keys_length; i++)
  {
    struct GNUNET_CRYPTO_SymmetricSessionKey i_sk;
    struct GNUNET_CRYPTO_SymmetricInitializationVector i_iv;
    struct GNUNET_HashCode key = policy_keys[i].key;

    GNUNET_CRYPTO_hash_to_aes_key (&key,
                                   &i_sk,
                                   &i_iv);
    GNUNET_assert (
      GNUNET_SYSERR !=
      GNUNET_CRYPTO_symmetric_encrypt (&master_key,
                                       sizeof (struct GNUNET_HashCode),
                                       &i_sk,
                                       &i_iv,
                                       &encrypted_master_keys[i]));
  }
}


void
ANASTASIS_CRYPTO_core_secret_recover (
  const struct ANASTASIS_CRYPTO_EncryptedMasterKeyP *encrypted_master_key,
  const struct ANASTASIS_CRYPTO_PolicyKeyP *policy_key,
  const void *encrypted_core_secret,
  size_t encrypted_core_secret_size,
  void **core_secret,
  size_t *core_secret_size)
{
  struct GNUNET_CRYPTO_SymmetricSessionKey mk_sk;
  struct GNUNET_CRYPTO_SymmetricInitializationVector mk_iv;
  struct GNUNET_CRYPTO_SymmetricSessionKey core_sk;
  struct GNUNET_CRYPTO_SymmetricInitializationVector core_iv;
  struct GNUNET_HashCode master_key;
  struct GNUNET_HashCode key = policy_key->key;

  *core_secret = GNUNET_malloc (encrypted_core_secret_size);
  GNUNET_CRYPTO_hash_to_aes_key (&key,
                                 &mk_sk,
                                 &mk_iv);
  GNUNET_assert (
    GNUNET_SYSERR !=
    GNUNET_CRYPTO_symmetric_decrypt (
      encrypted_master_key,
      sizeof (struct ANASTASIS_CRYPTO_EncryptedMasterKeyP),
      &mk_sk,
      &mk_iv,
      &master_key));
  GNUNET_CRYPTO_hash_to_aes_key (&master_key,
                                 &core_sk,
                                 &core_iv);
  GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
              "At %s:%d encrypted core secret is %s-%llu b\n", __FILE__,
              __LINE__,
              TALER_b2s (encrypted_core_secret, encrypted_core_secret_size),
              (unsigned long long) encrypted_core_secret_size);
  *core_secret_size = GNUNET_CRYPTO_symmetric_decrypt (encrypted_core_secret,
                                                       encrypted_core_secret_size,
                                                       &core_sk,
                                                       &core_iv,
                                                       *core_secret);
  GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
              "At %s:%d decrypted core secret is %s-%llu b\n", __FILE__,
              __LINE__,
              TALER_b2s (*core_secret, *core_secret_size),
              (unsigned long long) *core_secret_size);
  GNUNET_assert (GNUNET_SYSERR != *core_secret_size);
}


/* end of anastasis_crypto.c */
