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
 * Create headers for a trait with name @a name for
 * statically allocated data of type @a type.
 */
#define ANASTASIS_TESTING_MAKE_DECL_SIMPLE_TRAIT(name,type)   \
  enum GNUNET_GenericReturnValue                          \
    ANASTASIS_TESTING_get_trait_ ## name (                    \
    const struct TALER_TESTING_Command *cmd,              \
    type **ret);                                          \
  struct TALER_TESTING_Trait                              \
    ANASTASIS_TESTING_make_trait_ ## name (                   \
    type * value);


/**
 * Create C implementation for a trait with name @a name for statically
 * allocated data of type @a type.
 */
#define ANASTASIS_TESTING_MAKE_IMPL_SIMPLE_TRAIT(name,type)  \
  enum GNUNET_GenericReturnValue                         \
    ANASTASIS_TESTING_get_trait_ ## name (                   \
    const struct TALER_TESTING_Command *cmd,             \
    type **ret)                                          \
  {                                                      \
    if (NULL == cmd->traits) return GNUNET_SYSERR;       \
    return cmd->traits (cmd->cls,                        \
                        (const void **) ret,             \
                        TALER_S (name),                  \
                        0);                              \
  }                                                      \
  struct TALER_TESTING_Trait                             \
    ANASTASIS_TESTING_make_trait_ ## name (                  \
    type * value)                                        \
  {                                                      \
    struct TALER_TESTING_Trait ret = {                   \
      .trait_name = TALER_S (name),                      \
      .ptr = (const void *) value                        \
    };                                                   \
    return ret;                                          \
  }


/**
 * Create headers for a trait with name @a name for
 * statically allocated data of type @a type.
 */
#define ANASTASIS_TESTING_MAKE_DECL_INDEXED_TRAIT(name,type)  \
  enum GNUNET_GenericReturnValue                          \
    ANASTASIS_TESTING_get_trait_ ## name (                    \
    const struct TALER_TESTING_Command *cmd,              \
    unsigned int index,                                   \
    type **ret);                                          \
  struct TALER_TESTING_Trait                              \
    ANASTASIS_TESTING_make_trait_ ## name (                   \
    unsigned int index,                                   \
    type * value);


/**
 * Create C implementation for a trait with name @a name for statically
 * allocated data of type @a type.
 */
#define ANASTASIS_TESTING_MAKE_IMPL_INDEXED_TRAIT(name,type) \
  enum GNUNET_GenericReturnValue                         \
    ANASTASIS_TESTING_get_trait_ ## name (                   \
    const struct TALER_TESTING_Command *cmd,             \
    unsigned int index,                                  \
    type **ret)                                          \
  {                                                      \
    if (NULL == cmd->traits) return GNUNET_SYSERR;       \
    return cmd->traits (cmd->cls,                        \
                        (const void **) ret,             \
                        TALER_S (name),                  \
                        index);                          \
  }                                                      \
  struct TALER_TESTING_Trait                             \
    ANASTASIS_TESTING_make_trait_ ## name (                  \
    unsigned int index,                                  \
    type * value)                                        \
  {                                                      \
    struct TALER_TESTING_Trait ret = {                   \
      .index = index,                                    \
      .trait_name = TALER_S (name),                      \
      .ptr = (const void *) value                        \
    };                                                   \
    return ret;                                          \
  }


/**
 * Call #op on all simple traits.
 */
#define ANASTASIS_TESTING_SIMPLE_TRAITS(op) \
  op (hash, const struct GNUNET_HashCode)  \
  op (truth, const struct ANASTASIS_Truth *)  \
  op (policy, const struct ANASTASIS_Policy *)  \
  op (salt, const struct ANASTASIS_CRYPTO_ProviderSaltP)  \
  op (core_secret, const void *)  \
  op (truth_key, const struct ANASTASIS_CRYPTO_TruthKeyP)  \
  op (account_pub, const struct ANASTASIS_CRYPTO_AccountPublicKeyP)  \
  op (account_priv, const struct ANASTASIS_CRYPTO_AccountPrivateKeyP)  \
  op (payment_secret, const struct ANASTASIS_PaymentSecretP)  \
  op (truth_uuid, const struct ANASTASIS_CRYPTO_TruthUUIDP)  \
  op (eks, const struct ANASTASIS_CRYPTO_EncryptedKeyShareP)  \
  op (code, const char *) \
  op (filename, const char *)


/**
 * Call #op on all indexed traits.
 */
#define ANASTASIS_TESTING_INDEXED_TRAITS(op)                         \
  op (challenges, const struct ANASTASIS_Challenge *)


ANASTASIS_TESTING_SIMPLE_TRAITS (ANASTASIS_TESTING_MAKE_DECL_SIMPLE_TRAIT)

ANASTASIS_TESTING_INDEXED_TRAITS (ANASTASIS_TESTING_MAKE_DECL_INDEXED_TRAIT)


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
