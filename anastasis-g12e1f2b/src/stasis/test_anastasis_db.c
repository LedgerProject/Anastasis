/*
  This file is part of Anastasis
  Copyright (C) 2020, 2021 Anastasis SARL

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
 * @file anastasis/test_anastasis_db.c
 * @brief testcase for anastasis postgres db plugin
 * @author Marcello Stanisci
 * @author Christian Grothoff
 */
#include "platform.h"
#include "anastasis_database_lib.h"
#include "anastasis_util_lib.h"
#include <gnunet/gnunet_signatures.h>


#define FAILIF(cond)                            \
  do {                                          \
    if (! (cond)) { break;}                       \
    GNUNET_break (0);                           \
    goto drop;                                     \
  } while (0)

#define RND_BLK(ptr)                                                    \
  GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_WEAK, ptr, sizeof (*ptr))

/**
 * Global return value for the test.  Initially -1, set to 0 upon
 * completion.   Other values indicate some kind of error.
 */
static int result;

/**
 * Handle to the plugin we are testing.
 */
static struct ANASTASIS_DatabasePlugin *plugin;


/**
 * Main function that will be run by the scheduler.
 *
 * @param cls closure with config
 */
static void
run (void *cls)
{
  struct GNUNET_CONFIGURATION_Handle *cfg = cls;
  struct TALER_Amount amount;
  struct ANASTASIS_PaymentSecretP paymentSecretP;
  struct ANASTASIS_CRYPTO_AccountPublicKeyP accountPubP;
  struct ANASTASIS_AccountSignatureP accountSig;
  struct ANASTASIS_AccountSignatureP res_account_sig;
  struct GNUNET_HashCode recoveryDataHash;
  struct GNUNET_HashCode res_recovery_data_hash;
  struct GNUNET_HashCode r;
  struct GNUNET_TIME_Relative rel_time;
  struct ANASTASIS_CRYPTO_TruthUUIDP truth_uuid;
  struct ANASTASIS_CRYPTO_EncryptedKeyShareP key_share;
  unsigned int post_counter;
  char *mime_type;
  char *method;
  uint32_t docVersion;
  uint32_t res_version;
  size_t recoverydatasize;
  void *res_recovery_data = NULL;
  struct ANASTASIS_CRYPTO_EncryptedKeyShareP res_key_share;
  bool paid;
  bool valid_counter;
  uint32_t recversion = 1;
  unsigned char aes_gcm_tag[16];
  const char *recovery_data = "RECOVERY_DATA";
  uint64_t challenge_code = 1234;
  struct GNUNET_HashCode c_hash;
  struct ANASTASIS_UploadSignaturePS usp = {
    .purpose.purpose = htonl (GNUNET_SIGNATURE_PURPOSE_TEST),
    .purpose.size = htonl (sizeof (usp))
  };

  if (NULL == (plugin = ANASTASIS_DB_plugin_load (cfg)))
  {
    result = 77;
    return;
  }
  (void) plugin->drop_tables (plugin->cls);
  if (GNUNET_OK !=
      plugin->create_tables (plugin->cls))
  {
    result = 77;
    return;
  }
  if (GNUNET_OK !=
      plugin->connect (plugin->cls))
  {
    result = 77;
    return;
  }

  GNUNET_CRYPTO_hash (recovery_data,
                      strlen (recovery_data),
                      &recoveryDataHash);
  RND_BLK (&paymentSecretP);
  RND_BLK (&aes_gcm_tag);
  post_counter = 2;
  mime_type = "Picture";
  method = "Method";
  TALER_string_to_amount ("EUR:30",&amount);

  GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_NONCE,
                              &truth_uuid,
                              sizeof (truth_uuid));
  rel_time = GNUNET_TIME_UNIT_MONTHS;

  GNUNET_assert (GNUNET_OK ==
                 TALER_string_to_amount ("EUR:1",
                                         &amount));

  memset (&key_share, 1, sizeof (key_share));
  FAILIF (GNUNET_DB_STATUS_SUCCESS_ONE_RESULT !=
          plugin->store_truth (plugin->cls,
                               &truth_uuid,
                               &key_share,
                               mime_type,
                               "encrypted_truth",
                               strlen ("encrypted_truth"),
                               method,
                               rel_time));

  FAILIF (GNUNET_DB_STATUS_SUCCESS_NO_RESULTS !=
          plugin->check_payment_identifier (plugin->cls,
                                            &paymentSecretP,
                                            &paid,
                                            &valid_counter));

  memset (&accountPubP, 2, sizeof (accountPubP));
  memset (&accountSig, 3, sizeof (accountSig));
  FAILIF (GNUNET_DB_STATUS_SUCCESS_ONE_RESULT !=
          plugin->record_recdoc_payment (plugin->cls,
                                         &accountPubP,
                                         post_counter,
                                         &paymentSecretP,
                                         &amount));
  {
    struct GNUNET_TIME_Absolute res_time;

    FAILIF (GNUNET_DB_STATUS_SUCCESS_ONE_RESULT !=
            plugin->increment_lifetime (plugin->cls,
                                        &accountPubP,
                                        &paymentSecretP,
                                        rel_time,
                                        &res_time));
  }
  FAILIF (GNUNET_DB_STATUS_SUCCESS_ONE_RESULT !=
          plugin->check_payment_identifier (plugin->cls,
                                            &paymentSecretP,
                                            &paid,
                                            &valid_counter));
  FAILIF (GNUNET_DB_STATUS_SUCCESS_NO_RESULTS !=
          plugin->check_challenge_payment (plugin->cls,
                                           &paymentSecretP,
                                           &truth_uuid,
                                           &paid));
  FAILIF (GNUNET_DB_STATUS_SUCCESS_ONE_RESULT !=
          plugin->record_challenge_payment (plugin->cls,
                                            &truth_uuid,
                                            &paymentSecretP,
                                            &amount));
  FAILIF (GNUNET_DB_STATUS_SUCCESS_ONE_RESULT !=
          plugin->update_challenge_payment (plugin->cls,
                                            &truth_uuid,
                                            &paymentSecretP));
  FAILIF (GNUNET_DB_STATUS_SUCCESS_ONE_RESULT !=
          plugin->check_challenge_payment (plugin->cls,
                                           &paymentSecretP,
                                           &truth_uuid,
                                           &paid));
  FAILIF (! paid);
  FAILIF (ANASTASIS_DB_STORE_STATUS_SUCCESS !=
          plugin->store_recovery_document (plugin->cls,
                                           &accountPubP,
                                           &accountSig,
                                           &recoveryDataHash,
                                           recovery_data,
                                           strlen (recovery_data),
                                           &paymentSecretP,
                                           &docVersion));
  {
    uint32_t vrs;
    struct GNUNET_TIME_Absolute exp;

    FAILIF (ANASTASIS_DB_ACCOUNT_STATUS_VALID_HASH_RETURNED !=
            plugin->lookup_account (plugin->cls,
                                    &accountPubP,
                                    &exp,
                                    &r,
                                    &vrs));
  }
  FAILIF (GNUNET_DB_STATUS_SUCCESS_ONE_RESULT !=
          plugin->get_key_share (plugin->cls,
                                 &truth_uuid,
                                 &res_key_share));
  FAILIF (0 !=
          GNUNET_memcmp (&res_key_share,
                         &key_share));

  FAILIF (GNUNET_DB_STATUS_SUCCESS_ONE_RESULT !=
          plugin->get_recovery_document (plugin->cls,
                                         &accountPubP,
                                         recversion,
                                         &res_account_sig,
                                         &res_recovery_data_hash,
                                         &recoverydatasize,
                                         &res_recovery_data));
  FAILIF (0 != memcmp (res_recovery_data,
                       recovery_data,
                       strlen (recovery_data)));
  GNUNET_free (res_recovery_data);

  FAILIF (GNUNET_DB_STATUS_SUCCESS_ONE_RESULT !=
          plugin->get_latest_recovery_document (plugin->cls,
                                                &accountPubP,
                                                &res_account_sig,
                                                &res_recovery_data_hash,
                                                &recoverydatasize,
                                                &res_recovery_data,
                                                &res_version));
  FAILIF (0 != memcmp (res_recovery_data,
                       recovery_data,
                       strlen (recovery_data)));
  GNUNET_free (res_recovery_data);

  {
    struct GNUNET_TIME_Absolute rt;

    FAILIF (GNUNET_DB_STATUS_SUCCESS_ONE_RESULT !=
            plugin->create_challenge_code (plugin->cls,
                                           &truth_uuid,
                                           GNUNET_TIME_UNIT_HOURS,
                                           GNUNET_TIME_UNIT_DAYS,
                                           3, /* retry counter */
                                           &rt,
                                           &challenge_code));
    FAILIF (0 != rt.abs_value_us);
  }
  {
    struct GNUNET_TIME_Absolute rt;
    uint64_t c2;

    FAILIF (GNUNET_DB_STATUS_SUCCESS_ONE_RESULT !=
            plugin->create_challenge_code (plugin->cls,
                                           &truth_uuid,
                                           GNUNET_TIME_UNIT_HOURS,
                                           GNUNET_TIME_UNIT_DAYS,
                                           3, /* retry counter */
                                           &rt,
                                           &c2));
    FAILIF (c2 != challenge_code);
  }
  ANASTASIS_hash_answer (123,
                         &c_hash);
  {
    bool sat;
    uint64_t r_code;

    FAILIF (ANASTASIS_DB_CODE_STATUS_CHALLENGE_CODE_MISMATCH !=
            plugin->verify_challenge_code (plugin->cls,
                                           &truth_uuid,
                                           &c_hash,
                                           &r_code,
                                           &sat));

    ANASTASIS_hash_answer (challenge_code,
                           &c_hash);
    FAILIF (ANASTASIS_DB_CODE_STATUS_VALID_CODE_STORED !=
            plugin->verify_challenge_code (plugin->cls,
                                           &truth_uuid,
                                           &c_hash,
                                           &r_code,
                                           &sat));
  }
  if (-1 == result)
    result = 0;

drop:
  GNUNET_break (GNUNET_OK ==
                plugin->drop_tables (plugin->cls));
  ANASTASIS_DB_plugin_unload (plugin);
  if (NULL != plugin)
  {
    plugin = NULL;
  }
}


int
main (int argc,
      char *const argv[])
{
  const char *plugin_name;
  char *config_filename;
  char *testname;
  struct GNUNET_CONFIGURATION_Handle *cfg;

  result = -1;
  if (NULL == (plugin_name = strrchr (argv[0], (int) '-')))
  {
    GNUNET_break (0);
    return -1;
  }
  /* FIRST get the libtalerutil initialization out
      of the way. Then throw that one away, and force
      the SYNC defaults to be used! */
  (void) TALER_project_data_default ();
  GNUNET_OS_init (ANASTASIS_project_data_default ());
  GNUNET_log_setup (argv[0], "DEBUG", NULL);
  plugin_name++;
  GNUNET_asprintf (&testname,
                   "%s",
                   plugin_name);
  GNUNET_asprintf (&config_filename,
                   "test_anastasis_db_%s.conf",
                   testname);
  cfg = GNUNET_CONFIGURATION_create ();
  if (GNUNET_OK !=
      GNUNET_CONFIGURATION_load (cfg,
                                 config_filename))
  {
    GNUNET_break (0);
    GNUNET_free (config_filename);
    GNUNET_free (testname);
    return 2;
  }
  GNUNET_SCHEDULER_run (&run,
                        cfg);
  GNUNET_CONFIGURATION_destroy (cfg);
  GNUNET_free (config_filename);
  GNUNET_free (testname);
  return result;
}


/* end of test_anastasis_db.c */
