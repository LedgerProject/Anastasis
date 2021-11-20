/*
  This file is part of Anastasis
  Copyright (C) 2014-2020 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify
  it under the terms of the GNU General Public License as
  published by the Free Software Foundation; either version 3, or
  (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but
  WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public
  License along with Anastasis; see the file COPYING.  If not, see
  <http://www.gnu.org/licenses/>
*/

/**
 * @file lib/test_anastasis_api.c
 * @brief testcase to test anastasis' HTTP API interface
 * @author Christian Grothoff
 * @author Dennis Neufeld
 * @author Dominik Meister
 */
#include "platform.h"
#include <taler/taler_util.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis_crypto_lib.h"

/**
 * Testing derivation of the user identifier
 */
static int
test_user_identifier_derive (void)
{
  json_t *id_data_1;
  json_t *id_data_2;
  json_t *id_data_3;
  struct ANASTASIS_CRYPTO_UserIdentifierP id_1;
  struct ANASTASIS_CRYPTO_UserIdentifierP id_2;
  struct ANASTASIS_CRYPTO_UserIdentifierP id_3;
  struct ANASTASIS_CRYPTO_ProviderSaltP server_salt;

  char *salt_str = "Server-Salt-Test";

  GNUNET_memcpy (&server_salt,
                 salt_str,
                 strlen (salt_str));
  // sample data 1
  id_data_1 = json_object ();
  json_object_set_new (id_data_1, "arg1", json_string ("Hallo"));
  // sample data 2, equal to sample data 1
  id_data_2 = json_object ();
  json_object_set_new (id_data_2, "arg1", json_string ("Hallo"));
  // sample data 3, differs
  id_data_3 = json_object ();
  json_object_set_new (id_data_3, "arg1", json_string ("Hallo2"));

  ANASTASIS_CRYPTO_user_identifier_derive (id_data_1,
                                           &server_salt,
                                           &id_1);
  ANASTASIS_CRYPTO_user_identifier_derive (id_data_2,
                                           &server_salt,
                                           &id_2);
  ANASTASIS_CRYPTO_user_identifier_derive (id_data_3,
                                           &server_salt,
                                           &id_3);
  GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
              "UserIdentifier_1: %s\n",
              TALER_B2S (&id_1));
  GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
              "UserIdentifier_2: %s\n",
              TALER_B2S (&id_2));
  GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
              "UserIdentifier_3: %s\n",
              TALER_B2S (&id_3));
  GNUNET_assert (0 == GNUNET_memcmp (&id_1, &id_2));
  GNUNET_assert (0 != GNUNET_memcmp (&id_1, &id_3));
  json_decref (id_data_1);
  json_decref (id_data_2);
  json_decref (id_data_3);
  return 0;
}


/**
 * Testing the encryption of an recovery document and the
 * decryption of the encrypted recovery document
 */
static int
test_recovery_document (void)
{
  void *ciphertext;
  size_t size_ciphertext;
  void *plaintext;
  size_t size_plaintext;
  struct ANASTASIS_CRYPTO_UserIdentifierP id;
  struct ANASTASIS_CRYPTO_ProviderSaltP server_salt;
  int ret;

  json_t *id_data = json_object ();
  const char *test = "TEST_ERD";
  char *salt_str = "Server-Salt-Test";

  GNUNET_memcpy (&server_salt,
                 salt_str,
                 strlen (salt_str));
  json_object_set_new (id_data, "arg1", json_string ("ID_DATA"));
  ANASTASIS_CRYPTO_user_identifier_derive (id_data,
                                           &server_salt,
                                           &id);
  ANASTASIS_CRYPTO_recovery_document_encrypt (&id,
                                              test,
                                              strlen (test),
                                              &ciphertext,
                                              &size_ciphertext);

  ANASTASIS_CRYPTO_recovery_document_decrypt (&id,
                                              ciphertext,
                                              size_ciphertext,
                                              &plaintext,
                                              &size_plaintext);
  GNUNET_assert (strlen (test) == size_plaintext);
  ret = strncmp (plaintext, test, strlen (test));
  json_decref (id_data);
  GNUNET_free (ciphertext);
  GNUNET_free (plaintext);
  return ret;
}


static int
test_key_share (void)
{
  struct ANASTASIS_CRYPTO_EncryptedKeyShareP ciphertext;
  struct ANASTASIS_CRYPTO_KeyShareP plaintext;
  struct ANASTASIS_CRYPTO_UserIdentifierP id;
  struct ANASTASIS_CRYPTO_KeyShareP key_share;
  struct ANASTASIS_CRYPTO_KeyShareP key_share_1;
  struct ANASTASIS_CRYPTO_KeyShareP key_share_2;

  // testing creation of keyshares
  ANASTASIS_CRYPTO_keyshare_create (&key_share_1);
  ANASTASIS_CRYPTO_keyshare_create (&key_share_2);
  GNUNET_assert (0 !=
                 GNUNET_memcmp (&key_share_1,
                                &key_share_2));

  // testing of enc-/decryption of a keyshare
  GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_NONCE,
                              &id,
                              sizeof (struct ANASTASIS_CRYPTO_UserIdentifierP));
  ANASTASIS_CRYPTO_keyshare_create (&key_share);
  ANASTASIS_CRYPTO_keyshare_encrypt (&key_share,
                                     &id,
                                     NULL,
                                     &ciphertext);
  ANASTASIS_CRYPTO_keyshare_decrypt (&ciphertext,
                                     &id,
                                     NULL,
                                     &plaintext);
  return GNUNET_memcmp (&key_share,
                        &plaintext);
}


static int
test_truth (void)
{
  const char *test = "TEST_TRUTH";
  void *ciphertext;
  size_t size_ciphertext;
  void *plaintext;
  size_t size_plaintext;
  struct ANASTASIS_CRYPTO_TruthKeyP truth_enc_key;
  int ret;
  struct ANASTASIS_CRYPTO_NonceP nonce;

  GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
              "TRUTH_BEFORE: %s\n",
              TALER_b2s (test,
                         strlen (test)));
  GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_NONCE,
                              &truth_enc_key,
                              sizeof (struct ANASTASIS_CRYPTO_TruthKeyP));
  GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_NONCE,
                              &nonce,
                              sizeof (nonce));
  ANASTASIS_CRYPTO_truth_encrypt (&nonce,
                                  &truth_enc_key,
                                  test,
                                  strlen (test),
                                  &ciphertext,
                                  &size_ciphertext);

  ANASTASIS_CRYPTO_truth_decrypt (&truth_enc_key,
                                  ciphertext,
                                  size_ciphertext,
                                  &plaintext,
                                  &size_plaintext);
  GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
              "TRUTH_AFTER:   %s\n",
              TALER_b2s (plaintext, size_plaintext));
  GNUNET_assert (strlen (test) == size_plaintext);
  ret = strncmp (plaintext, test, strlen (test));
  GNUNET_free (ciphertext);
  GNUNET_free (plaintext);
  return ret;
}


static int
test_core_secret (void)
{
  const char *test = "TEST_CORE_SECRET";
  const char *test_wrong = "TEST_CORE_WRONG";
  unsigned int policy_keys_length = 5;
  struct ANASTASIS_CRYPTO_MasterSaltP salt;
  struct ANASTASIS_CoreSecretEncryptionResult *cser;

  GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_WEAK,
                              &salt,
                              sizeof (salt));

  // construction of PolicyKey-array
  struct ANASTASIS_CRYPTO_PolicyKeyP policy_keys[policy_keys_length];
  for (unsigned int i = 0; i < policy_keys_length; i++)
  {
    // construction of KeyShare-array
    unsigned int keyshare_length = 5;
    struct ANASTASIS_CRYPTO_KeyShareP keyshares[keyshare_length];
    for (unsigned int j = 0; j < keyshare_length; j++)
    {
      ANASTASIS_CRYPTO_keyshare_create (&keyshares[j]);
      if (j > 0)
        GNUNET_assert (0 !=
                       GNUNET_memcmp (&keyshares[j - 1], &keyshares[j]));
    }

    // derive policy-keys
    ANASTASIS_CRYPTO_policy_key_derive ((struct
                                         ANASTASIS_CRYPTO_KeyShareP *)
                                        keyshares,
                                        keyshare_length,
                                        &salt,
                                        &policy_keys[i]);
    if (i > 0)
      GNUNET_assert (0 !=
                     GNUNET_memcmp (&policy_keys[i - 1], &policy_keys[i]));
  }

  GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
              "CORE_SECRET_BEFORE:   %s\n",
              TALER_b2s (test, strlen (test)));

  // test encryption of core_secret
  cser = ANASTASIS_CRYPTO_core_secret_encrypt (policy_keys,
                                               policy_keys_length,
                                               test,
                                               strlen (test));

  // test recover of core secret
  for (unsigned int k = 0; k < policy_keys_length; k++)
  {
    void *dec_core_secret;
    size_t core_secret_size;

    ANASTASIS_CRYPTO_core_secret_recover (cser->enc_master_keys[k],
                                          cser->enc_master_key_sizes[k],
                                          &policy_keys[k],
                                          cser->enc_core_secret,
                                          cser->enc_core_secret_size,
                                          &dec_core_secret,
                                          &core_secret_size);
    GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
                "CORE_SECRET_AFTER_%i:   %s\n",
                k,
                TALER_b2s (dec_core_secret, strlen (test)));
    GNUNET_assert (strlen (test) == core_secret_size);
    GNUNET_assert (0 ==
                   strncmp (dec_core_secret, test, strlen (test)));
    GNUNET_assert (0 !=
                   strncmp (dec_core_secret, test_wrong, strlen (
                              test)));
    GNUNET_free (dec_core_secret);
  }
  ANASTASIS_CRYPTO_destroy_encrypted_core_secret (cser);
  return 0;
}


static int
test_public_key_derive (void)
{
  struct ANASTASIS_CRYPTO_UserIdentifierP id;
  struct ANASTASIS_CRYPTO_AccountPublicKeyP pub_key;
  struct ANASTASIS_CRYPTO_ProviderSaltP server_salt;
  json_t *id_data = json_object ();
  const char *salt_str = "Server-Salt-Test";

  GNUNET_memcpy (&server_salt,
                 salt_str,
                 strlen (salt_str));

  json_object_set_new (id_data, "arg1", json_string ("ID_DATA"));
  ANASTASIS_CRYPTO_user_identifier_derive (id_data,
                                           &server_salt,
                                           &id);

  ANASTASIS_CRYPTO_account_public_key_derive (&id,
                                              &pub_key);
  // FIXME: write a real test, e.g. signing and verification
  json_decref (id_data);
  return 0;
}


int
main (int argc,
      const char *const argv[])
{
  GNUNET_log_setup (argv[0], "DEBUG", NULL);
  if (0 != test_recovery_document ())
    return 1;
  if (0 != test_user_identifier_derive ())
    return 1;
  if (0 != test_key_share ())
    return 1;
  if (0 != test_truth ())
    return 1;
  if (0 != test_core_secret ())
    return 1;
  if (0 != test_public_key_derive ())
    return 1;
  return 0;
}


/* end of test_anastasis_crypto.c */
