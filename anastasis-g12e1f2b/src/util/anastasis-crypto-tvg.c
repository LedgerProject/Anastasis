/*
  This file is part of Anastasis
  Copyright (C) 2020,2021 Anastasis SARL

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
 * @file util/anastasis-crypto-tgv.c
 * @brief Generate test vectors for cryptographic operations.
 * @author Florian Dold
 *
 *
 * Test vectors have the following format (TypeScript pseudo code):
 *
 * interface TestVectorFile {
 *   encoding: "base32crockford";
 *   producer?: string;
 *   vectors: TestVector[];
 * }
 *
 * enum Operation {
 *  Hash("hash"),
 *  ...
 * }
 *
 * interface TestVector {
 *   operation: Operation;
 *   // Inputs for the operation
 *   [ k: string]: string | number;
 * };
 *
 *
 */
#include "platform.h"
#include <gnunet/gnunet_util_lib.h>
#include <gnunet/gnunet_signatures.h>
#include <gnunet/gnunet_testing_lib.h>
#include <jansson.h>
#include <gcrypt.h>
#include "anastasis_crypto_lib.h"


/**
 * Should we verify or output test vectors?
 */
static int verify_flag = GNUNET_NO;


/**
 * Global exit code.
 */
static int global_ret = 0;


/**
 * Create a fresh test vector for a given operation label.
 *
 * @param vecs array of vectors to append the new vector to
 * @param vecname label for the operation of the vector
 * @returns the fresh test vector
 */
static json_t *
vec_for (json_t *vecs, const char *vecname)
{
  json_t *t = json_object ();

  json_object_set_new (t,
                       "operation",
                       json_string (vecname));
  json_array_append_new (vecs, t);
  return t;
}


/**
 * Add a base32crockford encoded value
 * to a test vector.
 *
 * @param vec test vector to add to
 * @param label label for the value
 * @param data data to add
 * @param size size of data
 */
static void
d2j (json_t *vec,
     const char *label,
     const void *data,
     size_t size)
{
  char *buf;
  json_t *json;

  buf = GNUNET_STRINGS_data_to_string_alloc (data, size);
  json = json_string (buf);
  GNUNET_free (buf);
  GNUNET_break (NULL != json);

  json_object_set_new (vec, label, json);
}


static void
d2j_append (json_t *arr,
            const void *data,
            size_t size)
{
  char *buf;
  json_t *json;

  buf = GNUNET_STRINGS_data_to_string_alloc (data, size);
  json = json_string (buf);
  GNUNET_free (buf);
  GNUNET_break (NULL != json);

  json_array_append_new (arr,
                         json);
}


#define d2j_auto(vec, label, d) d2j (vec, label, d, sizeof (*d))
#define d2j_append_auto(arr,  d) d2j_append (arr, d, sizeof (*d))
#define random_auto(d) GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_WEAK, \
                                                   d, \
                                                   sizeof (*d));

/**
 * Add a number to a test vector.
 *
 * @param vec test vector to add to
 * @param label label for the value
 * @param data data to add
 * @param size size of data
 */
static void
uint2j (json_t *vec,
        const char *label,
        unsigned int num)
{
  json_t *json = json_integer (num);

  json_object_set_new (vec, label, json);
}


static int
expect_data_fixed (json_t *vec,
                   const char *name,
                   void *data,
                   size_t expect_len)
{
  const char *s = json_string_value (json_object_get (vec, name));

  if (NULL == s)
    return GNUNET_NO;

  if (GNUNET_OK != GNUNET_STRINGS_string_to_data (s,
                                                  strlen (s),
                                                  data,
                                                  expect_len))
    return GNUNET_NO;
  return GNUNET_OK;
}


static int
expect_data_dynamic (json_t *vec,
                     const char *name,
                     void **data,
                     size_t *ret_len)
{
  const char *s = json_string_value (json_object_get (vec, name));
  char *tmp;
  size_t len;

  if (NULL == s)
    return GNUNET_NO;

  len = (strlen (s) * 5) / 8;
  if (NULL != ret_len)
    *ret_len = len;
  tmp = GNUNET_malloc (len);

  if (GNUNET_OK != GNUNET_STRINGS_string_to_data (s, strlen (s), tmp, len))
  {
    GNUNET_free (tmp);
    return GNUNET_NO;
  }
  *data = tmp;
  return GNUNET_OK;
}


/**
 * Check a single vector.
 *
 * @param operation operator of the vector
 * @param vec the vector, a JSON object.
 *
 * @returns GNUNET_OK if the vector is okay
 */
static int
checkvec (const char *operation,
          json_t *vec)
{
  GNUNET_log (GNUNET_ERROR_TYPE_INFO,
              "checking %s\n", operation);

  if (0 == strcmp (operation, "hash"))
  {
    void *data;
    size_t data_len;
    struct GNUNET_HashCode hash_out;
    struct GNUNET_HashCode hc;

    if (GNUNET_OK != expect_data_dynamic (vec,
                                          "input",
                                          &data,
                                          &data_len))
    {
      GNUNET_break (0);
      return GNUNET_SYSERR;
    }
    if (GNUNET_OK != expect_data_fixed (vec,
                                        "output",
                                        &hash_out,
                                        sizeof (hash_out)))
    {
      GNUNET_free (data);
      GNUNET_break (0);
      return GNUNET_NO;
    }

    GNUNET_CRYPTO_hash (data, data_len, &hc);

    if (0 != GNUNET_memcmp (&hc, &hash_out))
    {
      GNUNET_free (data);
      GNUNET_break (0);
      return GNUNET_NO;
    }
    GNUNET_free (data);
  }

  return GNUNET_OK;
}


/**
 * Check test vectors from stdin.
 *
 * @returns global exit code
 */
static int
check_vectors ()
{
  json_error_t err;
  json_t *vecfile = json_loadf (stdin, 0, &err);
  const char *encoding;
  json_t *vectors;

  if (NULL == vecfile)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR, "unable to parse JSON\n");
    return 1;
  }
  encoding = json_string_value (json_object_get (vecfile,
                                                 "encoding"));
  if ( (NULL == encoding) || (0 != strcmp (encoding, "base32crockford")) )
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR, "unsupported or missing encoding\n");
    json_decref (vecfile);
    return 1;
  }
  vectors = json_object_get (vecfile, "vectors");
  if (! json_is_array (vectors))
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR, "bad vectors\n");
    json_decref (vecfile);
    return 1;
  }
  {
    /* array is a JSON array */
    size_t index;
    json_t *value;
    int ret;

    json_array_foreach (vectors, index, value) {
      const char *op = json_string_value (json_object_get (value,
                                                           "operation"));

      if (NULL == op)
      {
        GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                    "missing operation\n");
        ret = GNUNET_SYSERR;
        break;
      }
      ret = checkvec (op, value);
      if (GNUNET_OK != ret)
      {
        GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                    "bad vector %u\n",
                    (unsigned int) index);
        break;
      }
    }
    return (ret == GNUNET_OK) ? 0 : 1;
  }
}


/**
 * Output test vectors.
 *
 * @returns global exit code
 */
static int
output_vectors ()
{
  json_t *vecfile = json_object ();
  json_t *vecs = json_array ();

  json_object_set_new (vecfile,
                       "encoding",
                       json_string ("base32crockford"));
  json_object_set_new (vecfile,
                       "producer",
                       json_string (
                         "GNU Anastasis (C implementation) " PACKAGE_VERSION " "
                         VCS_VERSION));
  json_object_set_new (vecfile,
                       "vectors",
                       vecs);

  {
    json_t *vec = vec_for (vecs, "hash");
    struct GNUNET_HashCode hc;
    char *str = "Hello, GNUnet";

    GNUNET_CRYPTO_hash (str, strlen (str), &hc);

    d2j (vec, "input", str, strlen (str));
    d2j (vec, "output", &hc, sizeof (struct GNUNET_HashCode));
  }

  {
    json_t *vec = vec_for (vecs, "user_identifier_derive");
    struct ANASTASIS_CRYPTO_ProviderSaltP server_salt;
    struct ANASTASIS_CRYPTO_UserIdentifierP id;
    json_t *id_data = json_pack ("{s:s, s:s}",
                                 "name",
                                 "Fleabag",
                                 "ssn",
                                 "AB123");
    GNUNET_assert (NULL != id_data);
    random_auto (&server_salt);

    ANASTASIS_CRYPTO_user_identifier_derive (id_data,
                                             &server_salt,
                                             &id);
    json_object_set_new (vec, "input_id_data", id_data);
    d2j_auto (vec, "input_server_salt", &server_salt);
    d2j_auto (vec, "output_id", &id);
  }

  {
    json_t *vec = vec_for (vecs, "account_keypair_derive");
    struct ANASTASIS_CRYPTO_UserIdentifierP id;
    struct ANASTASIS_CRYPTO_AccountPrivateKeyP priv_key;
    struct ANASTASIS_CRYPTO_AccountPublicKeyP pub_key;

    random_auto (&id);
    ANASTASIS_CRYPTO_account_public_key_derive (&id, &pub_key);
    ANASTASIS_CRYPTO_account_private_key_derive (&id, &priv_key);

    d2j_auto (vec, "input_id", &id);
    d2j_auto (vec, "output_priv_key", &priv_key);
    d2j_auto (vec, "output_pub_key", &pub_key);

  }

  {
    json_t *vec = vec_for (vecs, "secure_answer_hash");
    const char *answer = "Blah";
    struct ANASTASIS_CRYPTO_TruthUUIDP uuid;
    struct ANASTASIS_CRYPTO_QuestionSaltP salt;
    struct GNUNET_HashCode result;

    random_auto (&uuid);
    random_auto (&salt);
    ANASTASIS_CRYPTO_secure_answer_hash (answer, &uuid, &salt, &result);
    json_object_set_new (vec, "input_answer", json_string (answer));
    d2j_auto (vec, "input_uuid", &uuid);
    d2j_auto (vec, "input_salt", &salt);
    d2j_auto (vec, "output_hash", &result);
  }

  {
    json_t *vec = vec_for (vecs, "recovery_document_encryption");
    struct ANASTASIS_CRYPTO_UserIdentifierP id;
    void *rec_doc = "my recovery doc";
    size_t rd_size = strlen (rec_doc) + 1;
    void *enc_rec_doc;
    size_t erd_size;

    random_auto (&id);

    ANASTASIS_CRYPTO_recovery_document_encrypt (&id,
                                                rec_doc,
                                                rd_size,
                                                &enc_rec_doc,
                                                &erd_size);
    d2j_auto (vec, "input_user_id", &id);
    d2j (vec, "input_recovery_document", rec_doc, rd_size);
    d2j (vec, "output_encrypted_recovery_document", &enc_rec_doc, erd_size);
  }

  {
    /* With extra salt */
    json_t *vec = vec_for (vecs, "keyshare_encryption");
    struct ANASTASIS_CRYPTO_KeyShareP key_share;
    struct ANASTASIS_CRYPTO_UserIdentifierP id;
    char *xsalt = "myanswer";
    struct ANASTASIS_CRYPTO_EncryptedKeyShareP enc_key_share;

    random_auto (&key_share);
    random_auto (&id);

    ANASTASIS_CRYPTO_keyshare_encrypt (&key_share,
                                       &id,
                                       xsalt,
                                       &enc_key_share);
    d2j_auto (vec, "input_key_share", &key_share);
    d2j_auto (vec, "input_user_id", &id);
    json_object_set_new (vec, "input_xsalt", json_string (xsalt));
    d2j_auto (vec, "output_enc_key_share", &enc_key_share);
  }

  {
    /* Without extra salt */
    json_t *vec = vec_for (vecs, "keyshare_encryption");
    struct ANASTASIS_CRYPTO_KeyShareP key_share;
    struct ANASTASIS_CRYPTO_UserIdentifierP id;
    char *xsalt = NULL;
    struct ANASTASIS_CRYPTO_EncryptedKeyShareP enc_key_share;

    random_auto (&key_share);
    random_auto (&id);

    ANASTASIS_CRYPTO_keyshare_encrypt (&key_share,
                                       &id,
                                       xsalt,
                                       &enc_key_share);
    d2j_auto (vec, "input_key_share", &key_share);
    d2j_auto (vec, "input_user_id", &id);
    json_object_set_new (vec, "input_xsalt", json_null ());
    d2j_auto (vec, "output_enc_key_share", &enc_key_share);
  }

  {
    json_t *vec = vec_for (vecs, "truth_encryption");

    struct ANASTASIS_CRYPTO_NonceP nonce;
    struct ANASTASIS_CRYPTO_TruthKeyP truth_enc_key;
    char truth[256];
    size_t truth_size = 256;
    void *enc_truth;
    size_t ect_size;

    random_auto (&nonce);
    random_auto (&truth);
    random_auto (&truth_enc_key);

    ANASTASIS_CRYPTO_truth_encrypt (&nonce,
                                    &truth_enc_key,
                                    truth,
                                    truth_size,
                                    &enc_truth,
                                    &ect_size);

    d2j_auto (vec, "input_nonce", &nonce);
    d2j_auto (vec, "input_truth_enc_key", &truth_enc_key);
    d2j (vec, "input_truth", &truth, truth_size);
    d2j (vec, "output_encrypted_truth", enc_truth, ect_size);
  }

  {
    json_t *vec = vec_for (vecs, "policy_key_derive");

    struct ANASTASIS_CRYPTO_KeyShareP key_shares[2];
    unsigned int keyshare_length = 2;
    struct ANASTASIS_CRYPTO_MasterSaltP salt;
    struct ANASTASIS_CRYPTO_PolicyKeyP policy_key;
    json_t *key_shares_json = json_array ();

    random_auto (&key_shares[0]);
    random_auto (&key_shares[1]);
    random_auto (&salt);

    ANASTASIS_CRYPTO_policy_key_derive (key_shares,
                                        keyshare_length,
                                        &salt,
                                        &policy_key);

    d2j_append_auto (key_shares_json, &key_shares[0]);
    d2j_append_auto (key_shares_json, &key_shares[1]);
    json_object_set_new (vec, "input_key_shares", key_shares_json);
    d2j_auto (vec, "input_salt", &salt);
    d2j_auto (vec, "output_policy_key", &policy_key);
  }

  {
    // json_t *vec = vec_for (vecs, "core_secret_encryption");
    // struct ANASTASIS_CRYPTO_PolicyKeyP policy_keys[2];
    // unsigned int policy_keys_length = 2;
    // char core_secret[256];
    // size_t core_secret_size = 256;
    // void *enc_core_secret;
    // struct ANASTASIS_CRYPTO_EncryptedMasterKeyP encrypted_master_keys[2];
    // json_t *policy_keys_json = json_array ();
    // json_t *encrypted_master_keys_json = json_array ();

    // random_auto (&policy_keys[0]);
    // random_auto (&policy_keys[1]);
    // random_auto (&core_secret);

    // ANASTASIS_CRYPTO_core_secret_encrypt (policy_keys, policy_keys_length,
    //                                       core_secret, core_secret_size,
    //                                       &enc_core_secret,
    //                                       encrypted_master_keys);

    // d2j_append_auto (policy_keys_json, &policy_keys_json[0]);
    // d2j_append_auto (policy_keys_json, &policy_keys_json[1]);
    // d2j_append_auto (encrypted_master_keys_json, &encrypted_master_keys[0]);
    // d2j_append_auto (encrypted_master_keys_json, &encrypted_master_keys[1]);

    // d2j_auto (vec, "input_core_secret", &core_secret);
    // json_object_set_new (vec, "input_policy_keys", policy_keys_json);
    // json_object_set_new (vec, "output_encrypted_core_secret", encrypted_master_keys_json);
    // json_object_set_new (vec, "output_encrypted_master_keys", encrypted_master_keys_json);
  }


  json_dumpf (vecfile, stdout, JSON_INDENT (2));
  json_decref (vecfile);
  printf ("\n");

  return 0;
}


/**
 * Main function that will be run.
 *
 * @param cls closure
 * @param args remaining command-line arguments
 * @param cfgfile name of the configuration file used (for saving, can be NULL!)
 * @param cfg configuration
 */
static void
run (void *cls,
     char *const *args,
     const char *cfgfile,
     const struct GNUNET_CONFIGURATION_Handle *cfg)
{
  if (GNUNET_YES == verify_flag)
    global_ret = check_vectors ();
  else
    global_ret = output_vectors ();
}


/**
 * The main function of the test vector generation tool.
 *
 * @param argc number of arguments from the command line
 * @param argv command line arguments
 * @return 0 ok, 1 on error
 */
int
main (int argc,
      char *const *argv)
{
  const struct GNUNET_GETOPT_CommandLineOption options[] = {
    GNUNET_GETOPT_option_flag ('V',
                               "verify",
                               gettext_noop (
                                 "verify a test vector from stdin"),
                               &verify_flag),
    GNUNET_GETOPT_OPTION_END
  };

  GNUNET_assert (GNUNET_OK ==
                 GNUNET_log_setup ("anastasis-crypto-tvg",
                                   "INFO",
                                   NULL));
  if (GNUNET_OK !=
      GNUNET_PROGRAM_run (argc, argv,
                          "anastasis-crypto-tvg",
                          "Generate test vectors for cryptographic operations",
                          options,
                          &run, NULL))
    return 1;
  return global_ret;
}


/* end of anastasis-crypto-tvg.c */
