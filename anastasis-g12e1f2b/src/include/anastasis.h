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
 * @file include/anastasis.h
 * @brief anastasis high-level client api
 * @author Christian Grothoff
 * @author Dominik Meister
 * @author Dennis Neufeld
 */
#ifndef ANASTASIS_H
#define ANASTASIS_H

#include "anastasis_service.h"
#include <taler/taler_json_lib.h>
#include <gnunet/gnunet_util_lib.h>
#include <stdbool.h>


/* ********************* Recovery api *********************** */

/**
 * Defines the instructions for a challenge, what does the user have
 * to do to fulfill the challenge.  Also defines the method and other
 * information for the challenge like a link for the video indent or a
 * information to which address an e-mail was sent.
 */
struct ANASTASIS_Challenge;


/**
 * Defines the instructions for a challenge, what does the user have
 * to do to fulfill the challenge.  Also defines the method and other
 * information for the challenge like a link for the video indent or a
 * information to which address an e-mail was sent.
 */
struct ANASTASIS_ChallengeDetails
{

  /**
   * UUID which identifies this challenge
   */
  struct ANASTASIS_CRYPTO_TruthUUIDP uuid;

  /**
   * Which type is this challenge (E-Mail, Security Question, SMS...)
   */
  const char *type;

  /**
   * Defines the base URL of the Anastasis provider used for the challenge.
   */
  const char *provider_url;

  /**
   * Instructions for solving the challenge (generic, set client-side
   * when challenge was established).
   */
  const char *instructions;

  /**
   * true if challenge was already solved, else false.
   */
  bool solved;

  /**
   * true if challenge is awaiting asynchronous
   * resolution by the user.
   */
  bool async;

};


/**
 * Return public details about a challenge.
 *
 * @param challenge the challenge to inspect
 * @return public details about the challenge
 */
const struct ANASTASIS_ChallengeDetails *
ANASTASIS_challenge_get_details (struct ANASTASIS_Challenge *challenge);


/**
 * Possible outcomes of trying to start a challenge operation.
 */
enum ANASTASIS_ChallengeStatus
{

  /**
   * The challenge has been solved.
   */
  ANASTASIS_CHALLENGE_STATUS_SOLVED,

  /**
   * Instructions for how to solve the challenge are provided.  Also
   * used if the answer we provided was wrong (or if no answer was
   * provided, but one is needed).
   */
  ANASTASIS_CHALLENGE_STATUS_INSTRUCTIONS,

  /**
   * A redirection URL needed to solve the challenge is provided.  Also
   * used if the answer we provided was wrong (or if no answer was
   * provided, but one is needed).
   */
  ANASTASIS_CHALLENGE_STATUS_REDIRECT_FOR_AUTHENTICATION,

  /**
   * Payment is required before the challenge can be answered.
   */
  ANASTASIS_CHALLENGE_STATUS_PAYMENT_REQUIRED,

  /**
   * We encountered an error talking to the Anastasis service.
   */
  ANASTASIS_CHALLENGE_STATUS_SERVER_FAILURE,

  /**
   * The server does not know this truth.
   */
  ANASTASIS_CHALLENGE_STATUS_TRUTH_UNKNOWN,

  /**
   * The rate limit for solving the challenge was exceeded.
   */
  ANASTASIS_CHALLENGE_STATUS_RATE_LIMIT_EXCEEDED,

  /**
   * The user did not satisfy the (external) authentication
   * challenge in time. The request should be repeated
   * later and may then succeed.
   */
  ANASTASIS_CHALLENGE_STATUS_AUTH_TIMEOUT,

  /**
   * Plugin-specific ("external") instructions for how to solve the
   * challenge are provided.
   */
  ANASTASIS_CHALLENGE_STATUS_EXTERNAL_INSTRUCTIONS


};


/**
 * Response from an #ANASTASIS_challenge_start() operation.
 */
struct ANASTASIS_ChallengeStartResponse
{
  /**
   * What is our status on satisfying this challenge. Determines @e details.
   */
  enum ANASTASIS_ChallengeStatus cs;

  /**
   * Which challenge is this about?
   */
  struct ANASTASIS_Challenge *challenge;

  /**
   * Details depending on @e cs
   */
  union
  {

    /**
     * Challenge details provided if
     * @e cs is #ANASTASIS_CHALLENGE_STATUS_INSTRUCTIONS
     */
    struct
    {

      /**
       * Response with server-side instructions for the user.
       */
      const void *body;

      /**
       * Mime type of the data in @e body.
       */
      const char *content_type;

      /**
       * Number of bytes in @e body
       */
      size_t body_size;

      /**
       * HTTP status returned by the server.  #MHD_HTTP_ALREADY_REPORTED
       * if the server did already send the challenge to the user,
       * #MHD_HTTP_FORBIDDEN if the answer was wrong (or missing).
       */
      unsigned int http_status;
    } open_challenge;


    /**
     * Response with details if
     * @e cs is #ANASTASIS_CHALLENGE_STATUS_EXTERNAL_INSTRUCTIONS.
     */
    const json_t *external_challenge;

    /**
     * Response with URL to redirect the user to, if
     * @e cs is #ANASTASIS_CHALLENGE_STATUS_REDIRECT_FOR_AUTHENTICATION.
     */
    const char *redirect_url;

    /**
     * Response with instructions for how to pay, if
     * @e cs is #ANASTASIS_CHALLENGE_STATUS_PAYMENT_REQUIRED.
     */
    struct
    {

      /**
       * "taler://pay" URI with details how to pay for the challenge.
       */
      const char *taler_pay_uri;

      /**
       * Payment secret from @e taler_pay_uri.
       */
      struct ANASTASIS_PaymentSecretP payment_secret;

    } payment_required;


    /**
     * Response with details about a server-side failure, if
     * @e cs is #ANASTASIS_CHALLENGE_STATUS_SERVER_FAILURE.
     */
    struct
    {

      /**
       * HTTP status returned by the server.
       */
      unsigned int http_status;

      /**
       * Taler-specific error code.
       */
      enum TALER_ErrorCode ec;

    } server_failure;

  } details;
};


/**
 * Defines a callback for the response status for a challenge start
 * operation.
 *
 * @param cls closure
 * @param csr response details
 */
typedef void
(*ANASTASIS_AnswerFeedback)(
  void *cls,
  const struct ANASTASIS_ChallengeStartResponse *csr);


/**
 * User starts a challenge which reponds out of bounds (E-Mail, SMS,
 * Postal..)  If the challenge is zero cost, the challenge
 * instructions will be sent to the client. If the challenge needs
 * payment a payment link is sent to the client. After payment the
 * challenge start method has to be called again.
 *
 * @param c reference to the escrow challenge which is started
 * @param psp payment secret, NULL if no payment was yet made
 * @param timeout how long to wait for payment
 * @param hashed_answer answer to the challenge, NULL if we have none yet
 * @param af reference to the answerfeedback which is passed back to the user
 * @param af_cls closure for @a af
 * @return #GNUNET_OK if the challenge was successfully started
 */
enum GNUNET_GenericReturnValue
ANASTASIS_challenge_start (struct ANASTASIS_Challenge *c,
                           const struct ANASTASIS_PaymentSecretP *psp,
                           struct GNUNET_TIME_Relative timeout,
                           const struct GNUNET_HashCode *hashed_answer,
                           ANASTASIS_AnswerFeedback af,
                           void *af_cls);


/**
 * Challenge answer for a security question. Is referenced to
 * a challenge and sends back an AnswerFeedback.  Convenience
 * wrapper around #ANASTASIS_challenge_start that hashes @a answer
 * for security questions.
 *
 * @param c reference to the challenge which is answered
 * @param psp information about payment made for the recovery
 * @param timeout how long to wait for payment
 * @param answer user input instruction defines which input is needed
 * @param af reference to the answerfeedback which is passed back to the user
 * @param af_cls closure for @a af
 * @return #GNUNET_OK on success
 */
enum GNUNET_GenericReturnValue
ANASTASIS_challenge_answer (struct ANASTASIS_Challenge *c,
                            const struct ANASTASIS_PaymentSecretP *psp,
                            struct GNUNET_TIME_Relative timeout,
                            const char *answer,
                            ANASTASIS_AnswerFeedback af,
                            void *af_cls);


/**
 * Challenge answer from the user like input SMS TAN or e-mail wpin. Is
 * referenced to a challenge and sends back an AnswerFeedback.
 * Convenience wrapper around #ANASTASIS_challenge_start that hashes
 * numeric (unsalted) @a answer.  Variant for numeric answers.
 *
 * @param c reference to the challenge which is answered
 * @param psp information about payment made for the recovery
 * @param timeout how long to wait for payment
 * @param answer user input instruction defines which input is needed
 * @param af reference to the answerfeedback which is passed back to the user
 * @param af_cls closure for @a af
 * @return #GNUNET_OK on success
 */
enum GNUNET_GenericReturnValue
ANASTASIS_challenge_answer2 (struct ANASTASIS_Challenge *c,
                             const struct ANASTASIS_PaymentSecretP *psp,
                             struct GNUNET_TIME_Relative timeout,
                             uint64_t answer,
                             ANASTASIS_AnswerFeedback af,
                             void *af_cls);


/**
 * Abort answering challenge.
 *
 * @param c reference to the escrow challenge which was started
 */
void
ANASTASIS_challenge_abort (struct ANASTASIS_Challenge *c);


/**
 * Defines a Decryption Policy with multiple escrow methods
 */
struct ANASTASIS_DecryptionPolicy
{
  /**
   * Array of challenges needed to solve for this decryption policy.
   */
  struct ANASTASIS_Challenge **challenges;

  /**
   * Length of the @a challenges in this policy.
   */
  unsigned int challenges_length;

};


/**
 * Defines the recovery information (possible policies and version of the recovery document)
 */
struct ANASTASIS_RecoveryInformation
{

  /**
   * Array of @e dps_len policies that would allow recovery of the core secret.
   */
  struct ANASTASIS_DecryptionPolicy **dps;

  /**
   * Array of all @e cs_len challenges to be solved (for any of the policies).
   */
  struct ANASTASIS_Challenge **cs;

  /**
   * Name of the secret being recovered, possibly NULL.
   */
  const char *secret_name;

  /**
   * Length of the @e dps array.
   */
  unsigned int dps_len;

  /**
   * Length of the @e cs array.
   */
  unsigned int cs_len;

  /**
   * Actual recovery document version obtained.
   */
  unsigned int version;
};


/**
 * Callback which passes back the recovery document and its possible
 * policies. Also passes back the version of the document for the user
 * to check.
 *
 * @param cls closure for the callback
 * @param ri recovery information struct which contains the policies
 */
typedef void
(*ANASTASIS_PolicyCallback)(void *cls,
                            const struct ANASTASIS_RecoveryInformation *ri);


/**
 * Possible outcomes of a recovery process.
 */
enum ANASTASIS_RecoveryStatus
{

  /**
   * Recovery succeeded.
   */
  ANASTASIS_RS_SUCCESS = 0,

  /**
   * The HTTP download of the policy failed.
   */
  ANASTASIS_RS_POLICY_DOWNLOAD_FAILED,

  /**
   * We did not get a valid policy document.
   */
  ANASTASIS_RS_POLICY_DOWNLOAD_NO_POLICY,

  /**
   * The decompressed policy document was too big for available memory.
   */
  ANASTASIS_RS_POLICY_DOWNLOAD_TOO_BIG,

  /**
   * The decrypted policy document was not compressed.
   */
  ANASTASIS_RS_POLICY_DOWNLOAD_INVALID_COMPRESSION,

  /**
   * The decompressed policy document was not in JSON.
   */
  ANASTASIS_RS_POLICY_DOWNLOAD_NO_JSON,

  /**
   * The decompressed policy document was in malformed JSON.
   */
  ANASTASIS_RS_POLICY_MALFORMED_JSON,

  /**
   * The Anastasis server reported a transient error.
   */
  ANASTASIS_RS_POLICY_SERVER_ERROR,

  /**
   * The Anastasis server no longer has a policy (likely expired).
   */
  ANASTASIS_RS_POLICY_GONE,

  /**
   * The Anastasis server reported that the account is unknown.
   */
  ANASTASIS_RS_POLICY_UNKNOWN
};


/**
 * This function is called whenever the recovery process ends.
 * On success, the secret is returned in @a secret.
 *
 * @param cls closure
 * @param ec error code
 * @param secret contains the core secret which is passed to the user
 * @param secret_size defines the size of the core secret
 */
typedef void
(*ANASTASIS_CoreSecretCallback)(void *cls,
                                enum ANASTASIS_RecoveryStatus rc,
                                const void *secret,
                                size_t secret_size);


/**
 * stores provider URIs, identity key material, decrypted recovery document (internally!)
 */
struct ANASTASIS_Recovery;


/**
 * Starts the recovery process by opening callbacks for the coresecret and a policy callback. A list of
 * providers is checked for policies and passed back to the client.
 *
 * @param ctx context for making HTTP requests
 * @param id_data contains the users identity, (user account on providers)
 * @param version defines the version which will be downloaded NULL for latest version
 * @param anastasis_provider_url NULL terminated list of possible provider urls
 * @param provider_salt the server salt
 * @param pc opens the policy call back which holds the downloaded version and the policies
 * @param pc_cls closure for callback
 * @param csc core secret callback is opened, with this the core secert is passed to the client after the authentication
 * @param csc_cls handle for the callback
 * @return recovery operation handle
 */
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
  void *csc_cls);


/**
 * Serialize recovery operation state and returning it.
 * The recovery MAY still continue, applications should call
 * #ANASTASIS_recovery_abort() to truly end the recovery.
 *
 * @param r recovery operation to suspend.
 * @return JSON serialized state of @a r
 */
json_t *
ANASTASIS_recovery_serialize (const struct ANASTASIS_Recovery *r);


/**
 * Deserialize recovery operation.
 *
 * @param ctx context for making HTTP requests
 * @param input result from #ANASTASIS_recovery_serialize()
 * @param pc opens the policy call back which holds the downloaded version and the policies
 * @param pc_cls closure for callback
 * @param csc core secret callback is opened, with this the core secert is passed to the client after the authentication
 * @param csc_cls handle for the callback
 * @return recovery operation handle
 */
struct ANASTASIS_Recovery *
ANASTASIS_recovery_deserialize (struct GNUNET_CURL_Context *ctx,
                                const json_t *input,
                                ANASTASIS_PolicyCallback pc,
                                void *pc_cls,
                                ANASTASIS_CoreSecretCallback csc,
                                void *csc_cls);


/**
 * Cancels the recovery process
 *
 * @param r handle to the recovery struct
 */
void
ANASTASIS_recovery_abort (struct ANASTASIS_Recovery *r);


/* ************************* Backup API ***************************** */


/**
 * Represents a truth object, which is a key share and the respective
 * challenge to be solved with an Anastasis provider to recover the
 * key share.
 */
struct ANASTASIS_Truth;


/**
 * Extracts truth data from JSON.
 *
 * @param json JSON encoding to decode; truth returned ONLY valid as long
 *             as the JSON remains valid (do not decref until the truth
 *             is truly finished)
 * @return decoded truth object, NULL on error
 */
struct ANASTASIS_Truth *
ANASTASIS_truth_from_json (const json_t *json);


/**
 * Returns JSON-encoded truth data.
 * Creates a policy with a set of truth's.  Creates the policy key
 * with the different key shares from the @a truths. The policy key
 * will then be used to encrypt/decrypt the escrow master key.
 *
 * @param t object to return JSON encoding for
 * @return JSON encoding of @a t
 */
json_t *
ANASTASIS_truth_to_json (const struct ANASTASIS_Truth *t);


/**
 * Handle for the operation to establish a truth object by sharing
 * an encrypted key share with an Anastasis provider.
 */
struct ANASTASIS_TruthUpload;


/**
 * Upload result information.  The resulting truth object can be used
 * to create policies.  If payment is required, the @a taler_pay_url
 * is returned and the operation must be retried after payment.
 * Callee MUST free @a t using ANASTASIS_truth_free().
 *
 * @param cls closure for callback
 * @param t truth object to create policies, NULL on failure
 * @param ud upload details, useful to continue in case of errors, NULL on success
 */
typedef void
(*ANASTASIS_TruthCallback)(void *cls,
                           struct ANASTASIS_Truth *t,
                           const struct ANASTASIS_UploadDetails *ud);


/**
 * Uploads truth data to an escrow provider. The resulting truth object
 * is returned via the @a tc function. If payment is required, it is
 * requested via the @a tcp callback.
 *
 * @param ctx the CURL context used to connect to the backend
 * @param user_id user identifier derived from user data and backend salt
 * @param provider_url base URL of the provider to upload to
 * @param type defines the type of the challenge (secure question, sms, email)
 * @param instructions depending on @a type! usually only for security question/answer!
 * @param mime_type format of the challenge
 * @param provider_salt the providers salt
 * @param truth_data contains the truth for this challenge i.e. phone number, email address
 * @param truth_data_size size of the @a truth_data
 * @param payment_years_requested for how many years would the client like the service to store the truth?
 * @param pay_timeout how long to wait for payment
 * @param tc opens the truth callback which contains the status of the upload
 * @param tc_cls closure for the @a tc callback
 */
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
  void *tc_cls);


/**
 * Retries upload of truth data to an escrow provider. The resulting
 * truth object is returned via the @a tc function. If payment is
 * required, it is requested via the @a tcp callback.
 *
 * @param ctx the CURL context used to connect to the backend
 * @param user_id user identifier derived from user data and backend salt
 * @param provider_url base URL of the provider to upload to
 * @param type defines the type of the challenge (secure question, sms, email)
 * @param instructions depending on @a type! usually only for security question/answer!
 * @param mime_type format of the challenge
 * @param provider_salt the providers salt
 * @param truth_data contains the truth for this challenge i.e. phone number, email address
 * @param truth_data_size size of the @a truth_data
 * @param payment_years_requested for how many years would the client like the service to store the truth?
 * @param pay_timeout how long to wait for payment
 * @param nonce nonce to use for symmetric encryption
 * @param uuid truth UUID to use
 * @param salt salt to use to hash security questions
 * @param truth_key symmetric encryption key to use to encrypt @a truth_data
 * @param key_share share of the overall key to store in this truth object
 * @param tc opens the truth callback which contains the status of the upload
 * @param tc_cls closure for the @a tc callback
 */
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
  void *tc_cls);


/**
 * Retries upload of truth data to an escrow provider using an
 * existing truth object. If payment is required, it is requested via
 * the @a tc callback.
 *
 * @param ctx the CURL context used to connect to the backend
 * @param user_id user identifier derived from user data and backend salt
 * @param[in] t truth details, reference is consumed
 * @param truth_data contains the truth for this challenge i.e. phone number, email address
 * @param truth_data_size size of the @a truth_data
 * @param payment_years_requested for how many years would the client like the service to store the truth?
 * @param pay_timeout how long to wait for payment
 * @param tc opens the truth callback which contains the status of the upload
 * @param tc_cls closure for the @a tc callback
 */
struct ANASTASIS_TruthUpload *
ANASTASIS_truth_upload3 (struct GNUNET_CURL_Context *ctx,
                         const struct ANASTASIS_CRYPTO_UserIdentifierP *user_id,
                         struct ANASTASIS_Truth *t,
                         const void *truth_data,
                         size_t truth_data_size,
                         uint32_t payment_years_requested,
                         struct GNUNET_TIME_Relative pay_timeout,
                         ANASTASIS_TruthCallback tc,
                         void *tc_cls);


/**
 * Cancels a truth upload process.
 *
 * @param tu handle for the upload
 */
void
ANASTASIS_truth_upload_cancel (struct ANASTASIS_TruthUpload *tu);


/**
 * Free's the truth object which was returned to a #ANASTASIS_TruthCallback.
 *
 * @param t object to clean up
 */
void
ANASTASIS_truth_free (struct ANASTASIS_Truth *t);


/**
 * Policy object, representing a set of truths (and thus challenges
 * to satisfy) to recover a secret.
 */
struct ANASTASIS_Policy;


/**
 * Creates a policy with a set of truth's.  Creates the policy key
 * with the different key shares from the @a truths. The policy key
 * will then be used to encrypt/decrypt the escrow master key.
 *
 * @param truths array of truths which are stored on different providers
 * @param truths_len length of the @a truths array
 */
struct ANASTASIS_Policy *
ANASTASIS_policy_create (const struct ANASTASIS_Truth *truths[],
                         unsigned int truths_len);


/**
 * Destroys a policy object.
 *
 * @param p handle for the policy to destroy
 */
void
ANASTASIS_policy_destroy (struct ANASTASIS_Policy *p);


/**
 * Information about a provider requesting payment for storing a policy.
 */
struct ANASTASIS_SharePaymentRequest
{
  /**
   * Payment request URL.
   */
  const char *payment_request_url;

  /**
   * Base URL of the provider requesting payment.
   */
  const char *provider_url;

  /**
   * The payment secret (aka order ID) extracted from the @e payment_request_url.
   */
  struct ANASTASIS_PaymentSecretP payment_secret;
};


/**
 * Result of uploading share data.
 */
enum ANASTASIS_ShareStatus
{
  /**
   * Upload successful.
   */
  ANASTASIS_SHARE_STATUS_SUCCESS = 0,

  /**
   * Upload requires payment.
   */
  ANASTASIS_SHARE_STATUS_PAYMENT_REQUIRED,

  /**
   * Failure to upload secret share at the provider.
   */
  ANASTASIS_SHARE_STATUS_PROVIDER_FAILED
};


/**
 * Per-provider status upon successful backup.
 */
struct ANASTASIS_ProviderSuccessStatus
{
  /**
   * Base URL of the provider.
   */
  const char *provider_url;

  /**
   * When will the policy expire?
   */
  struct GNUNET_TIME_Absolute policy_expiration;

  /**
   * Version number of the policy at the provider.
   */
  unsigned long long policy_version;

};


/**
 * Complete result of a secret sharing operation.
 */
struct ANASTASIS_ShareResult
{
  /**
   * Status of the share secret operation.
   */
  enum ANASTASIS_ShareStatus ss;

  /**
   * Details about the result, depending on @e ss.
   */
  union
  {

    struct
    {

      /**
       * Array of status details for each provider.
       */
      const struct ANASTASIS_ProviderSuccessStatus *pss;

      /**
       * Length of the @e policy_version and @e provider_urls arrays.
       */
      unsigned int num_providers;

    } success;

    struct
    {
      /**
       * Array of URLs with requested payments.
       */
      struct ANASTASIS_SharePaymentRequest *payment_requests;

      /**
       * Length of the payment_requests array.
       */
      unsigned int payment_requests_length;
    } payment_required;

    struct
    {
      /**
       * Base URL of the failed provider.
       */
      const char *provider_url;

      /**
       * HTTP status returned by the provider.
       */
      unsigned int http_status;

      /**
       * Upload status of the provider.
       */
      enum ANASTASIS_UploadStatus ec;


    } provider_failure;

  } details;

};


/**
 * Function called with the results of a #ANASTASIS_secret_share().
 *
 * @param cls closure
 * @param sr share result
 */
typedef void
(*ANASTASIS_ShareResultCallback)(void *cls,
                                 const struct ANASTASIS_ShareResult *sr);


/**
 * Defines a recovery document upload process (recovery document
 * consists of multiple policies)
 */
struct ANASTASIS_SecretShare;


/**
 * Details of a past payment
 */
struct ANASTASIS_ProviderDetails
{
  /**
   * URL of the provider backend.
   */
  const char *provider_url;

  /**
   * Payment order ID / secret of a past payment.
   */
  struct ANASTASIS_PaymentSecretP payment_secret;

  /**
   * Server salt. Points into a truth object from which we got the
   * salt.
   */
  struct ANASTASIS_CRYPTO_ProviderSaltP provider_salt;
};


/**
 * Creates a recovery document with the created policies and uploads it to
 * all servers.
 *
 * @param ctx the CURL context used to connect to the backend
 * @param id_data used to create a account identifier on the escrow provider
 * @param providers array of providers with URLs to upload the policies to
 * @param pss_length length of the @a providers array
 * @param policies list of policies which are included in this recovery document
 * @param policies_len length of the @a policies array
 * @param payment_years_requested for how many years would the client like the service to store the truth?
 * @param pay_timeout how long to wait for payment
 * @param src callback for the upload process
 * @param src_cls closure for the @a src upload callback
 * @param secret_name name of the core secret
 * @param core_secret input of the user which is secured by anastasis e.g. (wallet private key)
 * @param core_secret_size size of the @a core_secret
 * @return NULL on error
 */
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
                        size_t core_secret_size);


/**
 * Cancels a secret share request.
 *
 * @param ss handle to the request
 */
void
ANASTASIS_secret_share_cancel (struct ANASTASIS_SecretShare *ss);


#endif
