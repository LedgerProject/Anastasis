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
 * @file include/anastasis_testing_lib.h
 * @brief API for writing an interpreter to test Taler components
 * @author Christian Grothoff <christian@grothoff.org>
 * @author Dennis Neufeld
 * @author Dominik Meister
 */
#ifndef ANASTASIS_TESTING_LIB_H
#define ANASTASIS_TESTING_LIB_H

#include "anastasis.h"
#include <taler/taler_testing_lib.h>
#include <microhttpd.h>

/* ********************* Helper functions ********************* */

#define ANASTASIS_FAIL() \
  do {GNUNET_break (0); return NULL; } while (0)

/**
 * Index used in #ANASTASIS_TESTING_get_trait_hash() for the current hash.
 */
#define ANASTASIS_TESTING_TRAIT_HASH_CURRENT 0

/**
 * Obtain a hash from @a cmd.
 *
 * @param cmd command to extract the number from.
 * @param index the number's index number, use #ANASTASIS_TESTING_TRAIT_HASH_CURRENT
 * @param[out] h set to the hash coming from @a cmd.
 * @return #GNUNET_OK on success.
 */
int
ANASTASIS_TESTING_get_trait_hash (const struct TALER_TESTING_Command *cmd,
                                  unsigned int index,
                                  const struct GNUNET_HashCode **h);


/**
 * Offer a hash.
 *
 * @param index the number's index number.
 * @param h the hash to offer.
 * @return trait on success.
 */
struct TALER_TESTING_Trait
ANASTASIS_TESTING_make_trait_hash (unsigned int index,
                                   const struct GNUNET_HashCode *h);


/**
 * Obtain a truth decryption key from @a cmd.
 *
 * @param cmd command to extract the public key from.
 * @param index usually 0
 * @param[out] key set to the account public key used in @a cmd.
 * @return #GNUNET_OK on success.
 */
int
ANASTASIS_TESTING_get_trait_truth_key (
  const struct TALER_TESTING_Command *cmd,
  unsigned int index,
  const struct ANASTASIS_CRYPTO_TruthKeyP **key);


/**
 * Offer an truth decryption key.
 *
 * @param index usually zero
 * @param h the account_pub to offer.
 * @return trait on success.
 */
struct TALER_TESTING_Trait
ANASTASIS_TESTING_make_trait_truth_key (
  unsigned int index,
  const struct ANASTASIS_CRYPTO_TruthKeyP *h);


/**
 * Obtain an account public key from @a cmd.
 *
 * @param cmd command to extract the public key from.
 * @param index usually 0
 * @param[out] pub set to the account public key used in @a cmd.
 * @return #GNUNET_OK on success.
 */
int
ANASTASIS_TESTING_get_trait_account_pub (
  const struct TALER_TESTING_Command *cmd,
  unsigned int index,
  const struct ANASTASIS_CRYPTO_AccountPublicKeyP **pub);


/**
 * Offer an account public key.
 *
 * @param index usually zero
 * @param h the account_pub to offer.
 * @return trait on success
 */
struct TALER_TESTING_Trait
ANASTASIS_TESTING_make_trait_account_pub (
  unsigned int index,
  const struct ANASTASIS_CRYPTO_AccountPublicKeyP *h);


/**
 * Obtain an account private key from @a cmd.
 *
 * @param cmd command to extract the number from.
 * @param index must be 0
 * @param[out] priv set to the account private key used in @a cmd.
 * @return #GNUNET_OK on success.
 */
int
ANASTASIS_TESTING_get_trait_account_priv (
  const struct
  TALER_TESTING_Command *cmd,
  unsigned int index,
  const struct ANASTASIS_CRYPTO_AccountPrivateKeyP **priv);


/**
 * Offer an account private key.
 *
 * @param index usually zero
 * @param priv the account_priv to offer.
 * @return trait on success
 */
struct TALER_TESTING_Trait
ANASTASIS_TESTING_make_trait_account_priv (
  unsigned int index,
  const struct
  ANASTASIS_CRYPTO_AccountPrivateKeyP *priv);

/**
 * Obtain an account public key from @a cmd.
 *
 * @param cmd command to extract the payment identifier from.
 * @param index the payment identifier's index number.
 * @param[out] payment_secret set to the payment secret coming from @a cmd.
 * @return #GNUNET_OK on success.
 */
int
ANASTASIS_TESTING_get_trait_payment_secret (
  const struct TALER_TESTING_Command *cmd,
  unsigned int index,
  const struct ANASTASIS_PaymentSecretP **payment_secret);


/**
 * Offer a payment secret.
 *
 * @param index usually zero
 * @param h the payment secret to offer.
 * @return trait on success
 */
struct TALER_TESTING_Trait
ANASTASIS_TESTING_make_trait_payment_secret (
  unsigned int index,
  const struct ANASTASIS_PaymentSecretP *h);


/**
 * Obtain an truth UUID from @a cmd.
 *
 * @param cmd command to extract the number from.
 * @param index the number's index number.
 * @param[out] tpk set to the number coming from @a cmd.
 * @return #GNUNET_OK on success.
 */
int
ANASTASIS_TESTING_get_trait_truth_uuid (
  const struct TALER_TESTING_Command *cmd,
  unsigned int index,
  const struct ANASTASIS_CRYPTO_TruthUUIDP **tpk);


/**
 * Offer a truth UUID.
 *
 * @param index the number's index number.
 * @param tpk the UUID to offer.
 * @return trait on success
 */
struct TALER_TESTING_Trait
ANASTASIS_TESTING_make_trait_truth_uuid (
  unsigned int index,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *tpk);


/**
 * Obtain an encrypted key share from @a cmd.
 *
 * @param cmd command to extract the number from.
 * @param index the number's index number.
 * @param[out] eks set to the key share coming from @a cmd.
 * @return #GNUNET_OK on success.
 */
int
ANASTASIS_TESTING_get_trait_eks (
  const struct TALER_TESTING_Command *cmd,
  unsigned int index,
  const struct ANASTASIS_CRYPTO_EncryptedKeyShareP **eks);


/**
 * Offer an encrypted key share.
 *
 * @param index the number's index number.
 * @param eks the encrypted key share to offer.
 * @return trait on success
 */
struct TALER_TESTING_Trait
ANASTASIS_TESTING_make_trait_eks (
  unsigned int index,
  const struct ANASTASIS_CRYPTO_EncryptedKeyShareP *eks);


/**
 * Obtain a code from @a cmd.
 *
 * @param cmd command to extract the number from.
 * @param index the number's index number.
 * @param[out] code set to the number coming from @a cmd.
 * @return #GNUNET_OK on success.
 */
int
ANASTASIS_TESTING_get_trait_code (
  const struct TALER_TESTING_Command *cmd,
  unsigned int index,
  const char **code);


/**
 * Offer an authentication code.
 *
 * @param index the number's index number.
 * @param code the code to offer.
 * @return trait on success
 */
struct TALER_TESTING_Trait
ANASTASIS_TESTING_make_trait_code (unsigned int index,
                                   const char *code);


/**
 * Prepare the merchant execution.  Create tables and check if
 * the port is available.
 *
 * @param config_filename configuration filename.
 *
 * @return the base url, or NULL upon errors.  Must be freed
 *         by the caller.
 */
char *
TALER_TESTING_prepare_merchant (const char *config_filename);


/**
 * Start the merchant backend process.  Assume the port
 * is available and the database is clean.  Use the "prepare
 * merchant" function to do such tasks.
 *
 * @param config_filename configuration filename.
 *
 * @return the process, or NULL if the process could not
 *         be started.
 */
struct GNUNET_OS_Process *
TALER_TESTING_run_merchant (const char *config_filename,
                            const char *merchant_url);


/**
 * Start the anastasis backend process.  Assume the port
 * is available and the database is clean.  Use the "prepare
 * anastasis" function to do such tasks.
 *
 * @param config_filename configuration filename.
 * @param anastasis_url URL to use to confirm service running
 * @return the process, or NULL if the process could not
 *         be started.
 */
struct GNUNET_OS_Process *
ANASTASIS_TESTING_run_anastasis (const char *config_filename,
                                 const char *anastasis_url);


/**
 * Prepare the anastasis execution.  Create tables and check if
 * the port is available.
 *
 * @param config_filename configuration filename.
 *
 * @return the base url, or NULL upon errors.  Must be freed
 *         by the caller.
 */
char *
ANASTASIS_TESTING_prepare_anastasis (const char *config_filename);


/* ************** Specific interpreter commands ************ */


/**
 * Types of options for performing the upload. Used as a bitmask.
 */
enum ANASTASIS_TESTING_PolicyStoreOption
{
  /**
   * Do everything by the book.
   */
  ANASTASIS_TESTING_PSO_NONE = 0,

  /**
   * Use random hash for previous upload instead of correct
   * previous hash.
   */
  ANASTASIS_TESTING_PSO_PREV_HASH_WRONG = 1,

  /**
   * Request payment.
   */
  ANASTASIS_TESTING_PSO_REQUEST_PAYMENT = 2,

  /**
   * Reference payment order ID from linked previous upload.
   */
  ANASTASIS_TESTING_PSO_REFERENCE_ORDER_ID = 4

};


/**
 * Make a "policy store" command.
 *
 * @param label command label
 * @param anastasis_url base URL of the anastasis serving
 *        the policy store request.
 * @param prev_upload reference to a previous upload we are
 *        supposed to update, NULL for none
 * @param http_status expected HTTP status.
 * @param pso policy store options
 * @param recovery_data recovery data to post
 * @param recovery_data_size size of recovery/policy data
 * @return the command
 */
struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_policy_store (
  const char *label,
  const char *anastasis_url,
  const char *prev_upload,
  unsigned int http_status,
  enum ANASTASIS_TESTING_PolicyStoreOption pso,
  const void *recovery_data,
  size_t recovery_data_size);


/**
 * Make the "policy lookup" command.
 *
 * @param label command label
 * @param anastasis_url base URL of the ANASTASIS serving
 *        the policy store request.
 * @param http_status expected HTTP status.
 * @param upload_ref reference to upload command
 * @return the command
 */
struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_policy_lookup (const char *label,
                                     const char *anastasis_url,
                                     unsigned int http_status,
                                     const char *upload_ref);


/**
 * Make the "policy lookup" command for a non-existent upload.
 *
 * @param label command label
 * @param anastasis_url base URL of the ANASTASIS serving
 *        the policy lookup request.
 * @return the command
 */
struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_policy_nx (const char *label,
                                 const char *anastasis_url);


/**
 * Types of options for performing the upload. Used as a bitmask.
 */
enum ANASTASIS_TESTING_TruthStoreOption
{
  /**
   * Do everything by the book.
   */
  ANASTASIS_TESTING_TSO_NONE = 0,

  /**
   * Re-use UUID of previous upload instead of creating a random one.
   */
  ANASTASIS_TESTING_TSO_REFERENCE_UUID = 1,

  /**
   * Explicitly request payment.
   */
  ANASTASIS_TESTING_TSO_REQUEST_PAYMENT = 2,

  /**
   * Reference payment order ID from linked previous upload.
   */
  ANASTASIS_TESTING_TSO_REFERENCE_ORDER_ID = 4

};


/**
 * Make the "truth store" command.
 *
 * @param label command label
 * @param anastasis_url base URL of the anastasis serving
 *        the truth store request.
 * @param prev_upload reference to a previous upload to get a payment ID from
 * @param method what authentication method is being used
 * @param mime_type MIME type of @a truth_data
 * @param truth_data_size number of bytes in @a truth_data
 * @param truth_data recovery data to post /truth (in plaintext)
 * @param tso flags
 * @param http_status expected HTTP status.
 * @return the command
 */
struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_truth_store (const char *label,
                                   const char *anastasis_url,
                                   const char *prev_upload,
                                   const char *method,
                                   const char *mime_type,
                                   size_t truth_data_size,
                                   const void *truth_data,
                                   enum ANASTASIS_TESTING_TruthStoreOption tso,
                                   unsigned int http_status);


/**
 * Make the "truth store" command for a secure question.
 *
 * @param label command label
 * @param anastasis_url base URL of the anastasis serving
 *        the truth store request.
 * @param prev_upload reference to a previous upload to get a payment ID from
 * @param answer the answer to the question
 * @param tso flags
 * @param http_status expected HTTP status.
 * @return the command
 */
struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_truth_question (
  const char *label,
  const char *anastasis_url,
  const char *prev_upload,
  const char *answer,
  enum ANASTASIS_TESTING_TruthStoreOption tso,
  unsigned int http_status);


/**
 * Make the "keyshare lookup" command.
 *
 * @param label command label
 * @param anastasis_url base URL of the ANASTASIS serving
 *        the keyshare lookup request.
 * @param answer (response to challenge)
 * @param payment_ref reference to the payment request
 * @param upload_ref reference to upload command
 * @param lookup_mode 0 for security question, 1 for
 *          code-based
 * @param ksdd expected status
 * @return the command
 */
struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_keyshare_lookup (
  const char *label,
  const char *anastasis_url,
  const char *answer,
  const char *payment_ref,
  const char *upload_ref,
  int lookup_mode,
  enum ANASTASIS_KeyShareDownloadStatus ksdd);


/**
 * Obtain a salt from @a cmd.
 *
 * @param cmd command to extract the salt from.
 * @param index the salt's index number.
 * @param[out] s set to the salt coming from @a cmd.
 * @return #GNUNET_OK on success.
 */
int
ANASTASIS_TESTING_get_trait_salt (
  const struct TALER_TESTING_Command *cmd,
  unsigned int index,
  const struct ANASTASIS_CRYPTO_ProviderSaltP **s);


/**
 * Offer an salt.
 *
 * @param index the salt's index number.
 * @param s the salt to offer.
 * @return trait on success
 */
struct TALER_TESTING_Trait
ANASTASIS_TESTING_make_trait_salt (
  unsigned int index,
  const struct ANASTASIS_CRYPTO_ProviderSaltP *s);


/**
 * Make the "/config" command.
 *
 * @param label command label
 * @param anastasis_url base URL of the ANASTASIS serving
 *        the /config request.
 * @param http_status expected HTTP status.
 * @return the command
 */
struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_config (const char *label,
                              const char *anastasis_url,
                              unsigned int http_status);

/* ********************* test truth upload ********************* */

/**
 * Obtain a truth from @a cmd.
 *
 * @param cmd command to extract the truth from.
 * @param index the index of the truth
 * @param[out] t set to the truth coming from @a cmd.
 * @return #GNUNET_OK on success.
 */
int
ANASTASIS_TESTING_get_trait_truth (const struct TALER_TESTING_Command *cmd,
                                   unsigned int index,
                                   const struct ANASTASIS_Truth **t);


/**
 * Offer a truth.
 *
 * @param index the truth's index number.
 * @param t the truth to offer.
 * @return trait on success
 */
struct TALER_TESTING_Trait
ANASTASIS_TESTING_make_trait_truth (unsigned int index,
                                    const struct ANASTASIS_Truth *t);

/**
 * Creates a sample of id_data.
 *
 * @param id_data some sample data (e.g. AHV, name, surname, ...)
 * @return truth in json format
 */
json_t *
ANASTASIS_TESTING_make_id_data_example (const char *id_data);


/**
 * Make the "truth upload" command.
 *
 * @param label command label
 * @param anastasis_url base URL of the anastasis serving our requests.
 * @param id_data ID data to generate user identifier
 * @param method specifies escrow method
 * @param instructions specifies what the client/user has to do
 * @param mime_type mime type of truth_data
 * @param truth_data some truth data (e.g. hash of answer to a secret question)
 * @param truth_data_size size of truth_data
 * @param http_status expected HTTP status
 * @param tso truth upload options
 * @param upload_ref reference to the previous upload
 * @return the command
 */
struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_truth_upload (
  const char *label,
  const char *anastasis_url,
  const json_t *id_data,
  const char *method,
  const char *instructions,
  const char *mime_type,
  const void *truth_data,
  size_t truth_data_size,
  unsigned int http_status,
  enum ANASTASIS_TESTING_TruthStoreOption tso,
  const char *upload_ref);


/**
 * Make the "truth upload" command for a security question.
 *
 * @param label command label
 * @param anastasis_url base URL of the anastasis serving our requests.
 * @param id_data ID data to generate user identifier
 * @param instructions specifies what the client/user has to do
 * @param mime_type mime type of truth_data
 * @param answer the answer to the security question
 * @param http_status expected HTTP status
 * @param tso truth upload options
 * @param salt_ref reference to command downloading provider salt
 * @return the command
 */
struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_truth_upload_question (
  const char *label,
  const char *anastasis_url,
  const json_t *id_data,
  const char *instructions,
  const char *mime_type,
  const void *answer,
  unsigned int http_status,
  enum ANASTASIS_TESTING_TruthStoreOption tso,
  const char *salt_ref);

/* ********************* test policy create ********************* */

/**
 * Obtain a policy from @a cmd.
 *
 * @param cmd command to extract the policy from.
 * @param index the index of the policy
 * @param[out] p set to the policy coming from @a cmd.
 * @return #GNUNET_OK on success.
 */
int
ANASTASIS_TESTING_get_trait_policy (const struct TALER_TESTING_Command *cmd,
                                    unsigned int index,
                                    const struct ANASTASIS_Policy **p);


/**
 * Offer a policy.
 *
 * @param index the policy's index number.
 * @param p the policy to offer.
 * @return trait on success
 */
struct TALER_TESTING_Trait
ANASTASIS_TESTING_make_trait_policy (unsigned int index,
                                     const struct ANASTASIS_Policy *p);


/**
 * Make the "policy create" command.
 *
 * @param label command label
 * @param ... NULL-terminated list of truth upload commands
 * @return the command
 */
struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_policy_create (const char *label,
                                     ...);


/* ********************* test secret share ********************* */

/**
 * Obtain the core secret from @a cmd.
 *
 * @param cmd command to extract the core secret from.
 * @param index the index of the core secret (usually 0)
 * @param[out] s set to the core secret coming from @a cmd.
 * @return #GNUNET_OK on success.
 */
int
ANASTASIS_TESTING_get_trait_core_secret (const struct
                                         TALER_TESTING_Command *cmd,
                                         unsigned int index,
                                         const void **s);


/**
 * Offer the core secret.
 *
 * @param index the core secret's index number (usually 0).
 * @param s the core secret to offer.
 * @return trait on success
 */
struct TALER_TESTING_Trait
ANASTASIS_TESTING_make_trait_core_secret (unsigned int index,
                                          const void *s);

/**
 * Types of options for performing the secret sharing. Used as a bitmask.
 */
enum ANASTASIS_TESTING_SecretShareOption
{
  /**
   * Do everything by the book.
   */
  ANASTASIS_TESTING_SSO_NONE = 0,

  /**
   * Request payment.
   */
  ANASTASIS_TESTING_SSO_REQUEST_PAYMENT = 2,

  /**
   * Reference payment order ID from linked previous upload.
   */
  ANASTASIS_TESTING_SSO_REFERENCE_ORDER_ID = 4

};

/**
 * Make the "secret share" command.
 *
 * @param label command label
 * @param anastasis_url base URL of the anastasis serving our requests.
 * @param config_ref reference to /config operation for @a anastasis_url
 * @param prev_secret_share reference to a previous secret share command
 * @param id_data ID data to generate user identifier
 * @param core_secret core secret to backup/recover
 * @param core_secret_size size of @a core_secret
 * @param http_status expected HTTP status.
 * @param sso secret share options
 * @param ... NULL-terminated list of policy create commands
 * @return the command
 */
struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_secret_share (
  const char *label,
  const char *anastasis_url,
  const char *config_ref,
  const char *prev_secret_share,
  const json_t *id_data,
  const void *core_secret,
  size_t core_secret_size,
  unsigned int http_status,
  enum ANASTASIS_TESTING_SecretShareOption sso,
  ...);


/* ********************* test recover secret ********************* */

/**
 * Types of options for performing the secret recovery. Used as a bitmask.
 */
enum ANASTASIS_TESTING_RecoverSecretOption
{
  /**
   * Do everything by the book.
   */
  ANASTASIS_TESTING_RSO_NONE = 0,

  /**
   * Request payment.
   */
  ANASTASIS_TESTING_RSO_REQUEST_PAYMENT = 2,

  /**
   * Reference payment order ID from linked previous download.
   */
  ANASTASIS_TESTING_RSO_REFERENCE_ORDER_ID = 4

};


/**
 * Make the "recover secret" command.
 *
 * @param label command label
 * @param anastasis_url base URL of the anastasis serving our requests.
 * @param id_data identfication data from the user
 * @param version of the recovery document to download
 * @param rso recover secret options
 * @param download_ref salt download reference
 * @param core_secret_ref reference to core secret
 *         we expect to recover
 * @return the command
 */
struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_recover_secret (
  const char *label,
  const char *anastasis_url,
  const json_t *id_data,
  unsigned int version,
  enum ANASTASIS_TESTING_RecoverSecretOption rso,
  const char *download_ref,
  const char *core_secret_ref);


/**
 * Make "recover secret finish" command.
 *
 * @param label command label
 * @param recover_label label of a "recover secret" command to wait for
 * @param timeout how long to wait at most
 * @return the command
 */
struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_recover_secret_finish (
  const char *label,
  const char *recover_label,
  struct GNUNET_TIME_Relative timeout);


/* ********************* test challenge answer ********************* */
/**
 * Obtain a challenge from @a cmd.
 *
 * @param cmd command to extract the challenge from.
 * @param index the index of the challenge
 * @param[out] c set to the challenge coming from @a cmd.
 * @return #GNUNET_OK on success.
 */
int
ANASTASIS_TESTING_get_trait_challenge (const struct TALER_TESTING_Command *cmd,
                                       unsigned int index,
                                       const struct ANASTASIS_Challenge **c);

/**
 * Offer a challenge.
 *
 * @param index the challenge index number.
 * @param r the challenge to offer.
 * @return trait on success
 */
struct TALER_TESTING_Trait
ANASTASIS_TESTING_make_trait_challenge (unsigned int index,
                                        const struct ANASTASIS_Challenge *r);


/**
 * Create a "challenge start" command. Suitable for the "file"
 * authorization plugin.
 *
 * @param label command label
 * @param payment_ref reference to payment made for this challenge
 * @param challenge_ref reference to the recovery process
 * @param challenge_index defines the index of the trait to solve
 * @param expected_cs expected reply type
 * @return the command
 */
struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_challenge_start (
  const char *label,
  const char *payment_ref,
  const char *challenge_ref,
  unsigned int challenge_index,
  enum ANASTASIS_ChallengeStatus expected_cs);


/**
 * Make the "challenge answer" command.
 *
 * @param label command label
 * @param payment_ref reference to payment made for this challenge
 * @param challenge_ref reference to the recovery process
 * @param challenge_index defines the index of the trait to solve
 * @param answer to the challenge
 * @param mode 0 for no plugin needed (security question)
 *             1 for plugin needed to authenticate
 * @param expected_cs expected reply type
 * @return the command
 */
struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_challenge_answer (
  const char *label,
  const char *payment_ref,
  const char *challenge_ref,
  unsigned int challenge_index,
  const char *answer,
  unsigned int mode,
  enum ANASTASIS_ChallengeStatus expected_cs);


#endif
