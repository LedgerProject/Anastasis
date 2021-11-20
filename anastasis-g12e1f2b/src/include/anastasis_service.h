/*
  This file is part of Anastasis
  Copyright (C) 2019-2021 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

  You should have received a copy of the GNU General Public License along with
  Anastasis; see the file COPYING.LIB.  If not, see <http://www.gnu.org/licenses/>
*/
/**
 * @file include/anastasis_service.h
 * @brief C interface of libanastasisrest, a C library to use merchant's HTTP API
 * @author Christian Grothoff
 * @author Dennis Neufeld
 * @author Dominik Meister
 */
#ifndef ANASTASIS_SERVICE_H
#define ANASTASIS_SERVICE_H

#include "anastasis_crypto_lib.h"
#include "anastasis_util_lib.h"
#include <gnunet/gnunet_curl_lib.h>
#include <jansson.h>


/**
 * Anastasis authorization method configuration
 */
struct ANASTASIS_AuthorizationMethodConfig
{
  /**
   * Type of the method, i.e. "question".
   */
  const char *type;

  /**
   * Fee charged for accessing key share using this method.
   */
  struct TALER_Amount usage_fee;
};


/**
 * @brief Anastasis configuration data.
 */
struct ANASTASIS_Config
{
  /**
   * Protocol version supported by the server.
   */
  const char *version;

  /**
   * Business name of the anastasis provider.
   */
  const char *business_name;

  /**
   * Currency used for payments by the server.
   */
  const char *currency;

  /**
   * Array of authorization methods supported by the server.
   */
  const struct ANASTASIS_AuthorizationMethodConfig *methods;

  /**
   * Length of the @e methods array.
   */
  unsigned int methods_length;

  /**
   * Maximum size of an upload in megabytes.
   */
  uint32_t storage_limit_in_megabytes;

  /**
   * Annual fee for an account / policy upload.
   */
  struct TALER_Amount annual_fee;

  /**
   * Fee for a truth upload.
   */
  struct TALER_Amount truth_upload_fee;

  /**
   * Maximum legal liability for data loss covered by the
   * provider.
   */
  struct TALER_Amount liability_limit;

  /**
   * Server salt.
   */
  struct ANASTASIS_CRYPTO_ProviderSaltP salt;

};


/**
 * Function called with the result of a /config request.
 * Note that an HTTP status of #MHD_HTTP_OK is no guarantee
 * that @a acfg is non-NULL. @a acfg is non-NULL only if
 * the server provided an acceptable response.
 *
 * @param cls closure
 * @param http_status the HTTP status
 * @param acfg configuration obtained, NULL if we could not parse it
 */
typedef void
(*ANASTASIS_ConfigCallback)(void *cls,
                            unsigned int http_status,
                            const struct ANASTASIS_Config *acfg);


/**
 * @brief A Config Operation Handle
 */
struct ANASTASIS_ConfigOperation;


/**
 * Run a GET /config request against the Anastasis backend.
 *
 * @param ctx CURL context to use
 * @param base_url base URL fo the Anastasis backend
 * @param cb function to call with the results
 * @param cb_cls closure for @a cb
 * @return handle to cancel the operation
 */
struct ANASTASIS_ConfigOperation *
ANASTASIS_get_config (struct GNUNET_CURL_Context *ctx,
                      const char *base_url,
                      ANASTASIS_ConfigCallback cb,
                      void *cb_cls);


/**
 * Cancel ongoing #ANASTASIS_get_config() request.
 *
 * @param co configuration request to cancel.
 */
void
ANASTASIS_config_cancel (struct ANASTASIS_ConfigOperation *co);


/****** POLICY API ******/


/**
 * Detailed results from the successful download.
 */
struct ANASTASIS_DownloadDetails
{
  /**
   * Signature (already verified).
   */
  struct ANASTASIS_AccountSignatureP sig;

  /**
   * Hash over @e policy and @e policy_size.
   */
  struct GNUNET_HashCode curr_policy_hash;

  /**
   * The backup we downloaded.
   */
  const void *policy;

  /**
   * Number of bytes in @e backup.
   */
  size_t policy_size;

  /**
   * Policy version returned by the service.
   */
  uint32_t version;
};


/**
 * Handle for a GET /policy operation.
 */
struct ANASTASIS_PolicyLookupOperation;


/**
 * Callback to process a GET /policy request
 *
 * @param cls closure
 * @param http_status HTTP status code for this request
 * @param ec anastasis-specific error code
 * @param obj the response body
 */
typedef void
(*ANASTASIS_PolicyLookupCallback) (void *cls,
                                   unsigned int http_status,
                                   const struct ANASTASIS_DownloadDetails *dd);


/**
 * Does a GET /policy.
 *
 * @param ctx execution context
 * @param backend_url base URL of the merchant backend
 * @param anastasis_pub public key of the user's account
 * @param cb callback which will work the response gotten from the backend
 * @param cb_cls closure to pass to the callback
 * @return handle for this operation, NULL upon errors
 */
struct ANASTASIS_PolicyLookupOperation *
ANASTASIS_policy_lookup (
  struct GNUNET_CURL_Context *ctx,
  const char *backend_url,
  const struct ANASTASIS_CRYPTO_AccountPublicKeyP *anastasis_pub,
  ANASTASIS_PolicyLookupCallback cb,
  void *cb_cls);


/**
 * Does a GET /policy for a specific version.
 *
 * @param ctx execution context
 * @param backend_url base URL of the merchant backend
 * @param anastasis_pub public key of the user's account
 * @param cb callback which will work the response gotten from the backend
 * @param cb_cls closure to pass to the callback
 * @param version version of the policy to be requested
 * @return handle for this operation, NULL upon errors
 */
struct ANASTASIS_PolicyLookupOperation *
ANASTASIS_policy_lookup_version (
  struct GNUNET_CURL_Context *ctx,
  const char *backend_url,
  const struct ANASTASIS_CRYPTO_AccountPublicKeyP *anastasis_pub,
  ANASTASIS_PolicyLookupCallback cb,
  void *cb_cls,
  unsigned int version);


/**
 * Cancel a GET /policy request.
 *
 * @param plo cancel the policy lookup operation
 */
void
ANASTASIS_policy_lookup_cancel (
  struct ANASTASIS_PolicyLookupOperation *plo);


/**
 * Handle for a POST /policy operation.
 */
struct ANASTASIS_PolicyStoreOperation;


/**
 * High-level ways how an upload may conclude.
 */
enum ANASTASIS_UploadStatus
{
  /**
   * Backup was successfully made.
   */
  ANASTASIS_US_SUCCESS = 0,

  /**
   * Account expired or payment was explicitly requested
   * by the client.
   */
  ANASTASIS_US_PAYMENT_REQUIRED,

  /**
   * HTTP interaction failed, see HTTP status.
   */
  ANASTASIS_US_HTTP_ERROR,

  /**
   * We had an internal error (not sure this can happen,
   * but reserved for HTTP 400 status codes).
   */
  ANASTASIS_US_CLIENT_ERROR,

  /**
   * Server had an internal error.
   */
  ANASTASIS_US_SERVER_ERROR,

  /**
   * Truth already exists. Not applicable for policy uploads.
   */
  ANASTASIS_US_CONFLICTING_TRUTH
};


/**
 * Result of an upload.
 */
struct ANASTASIS_UploadDetails
{
  /**
   * High level status of the upload operation. Determines @e details.
   */
  enum ANASTASIS_UploadStatus us;

  /**
   * HTTP status code.
   */
  unsigned int http_status;

  /**
   * Taler error code.
   */
  enum TALER_ErrorCode ec;

  union
  {

    struct
    {
      /**
       * Hash of the stored recovery data, returned if
       * @e us is #ANASTASIS_US_SUCCESS.
       */
      const struct GNUNET_HashCode *curr_backup_hash;

      /**
       * At what time is the provider set to forget this
       * policy (because the account expires)?
       */
      struct GNUNET_TIME_Absolute policy_expiration;

      /**
       * Version number of the resulting policy.
       */
      unsigned long long policy_version;

    } success;

    /**
     * Details about required payment.
     */
    struct
    {
      /**
       * A taler://pay/-URI with a request to pay the annual fee for
       * the service.  Returned if @e us is #ANASTASIS_US_PAYMENT_REQUIRED.
       */
      const char *payment_request;

      /**
       * The payment secret (aka order ID) extracted from the @e payment_request.
       */
      struct ANASTASIS_PaymentSecretP ps;
    } payment;

  } details;
};


/**
 * Callback to process a POST /policy request
 *
 * @param cls closure
 * @param http_status HTTP status code for this request
 * @param obj the decoded response body
 */
typedef void
(*ANASTASIS_PolicyStoreCallback) (void *cls,
                                  const struct ANASTASIS_UploadDetails *up);


/**
 * Store policies, does a POST /policy/$ACCOUNT_PUB
 *
 * @param ctx the CURL context used to connect to the backend
 * @param backend_url backend's base URL, including final "/"
 * @param anastasis_priv private key of the user's account
 * @param recovery_data policy data to be stored
 * @param recovery_data_size number of bytes in @a recovery_data
 * @param payment_years_requested for how many years would the client like the service to store the truth?
 * @param payment_secret payment identifier of last payment
 * @param payment_timeout how long to wait for the payment, use
 *           #GNUNET_TIME_UNIT_ZERO to let the server pick
 * @param cb callback processing the response from /policy
 * @param cb_cls closure for @a cb
 * @return handle for the operation
 */
struct ANASTASIS_PolicyStoreOperation *
ANASTASIS_policy_store (
  struct GNUNET_CURL_Context *ctx,
  const char *backend_url,
  const struct ANASTASIS_CRYPTO_AccountPrivateKeyP *anastasis_priv,
  const void *recovery_data,
  size_t recovery_data_size,
  uint32_t payment_years_requested,
  const struct ANASTASIS_PaymentSecretP *payment_secret,
  struct GNUNET_TIME_Relative payment_timeout,
  ANASTASIS_PolicyStoreCallback cb,
  void *cb_cls);


/**
 * Cancel a POST /policy request.
 *
 * @param pso the policy store operation to cancel
 */
void
ANASTASIS_policy_store_cancel (
  struct ANASTASIS_PolicyStoreOperation *pso);


/****** TRUTH API ******/


/**
 * Operational status.
 */
enum ANASTASIS_KeyShareDownloadStatus
{
  /**
   * We got the encrypted key share.
   */
  ANASTASIS_KSD_SUCCESS = 0,

  /**
   * Payment is needed to proceed with the recovery.
   */
  ANASTASIS_KSD_PAYMENT_REQUIRED,

  /**
   * The provided answer was wrong or missing. Instructions for
   * getting a good answer may be provided.
   */
  ANASTASIS_KSD_INVALID_ANSWER,

  /**
   * To answer the challenge, the client should be redirected to
   * the given URL.
   */
  ANASTASIS_KSD_REDIRECT_FOR_AUTHENTICATION,

  /**
   * The provider had an error.
   */
  ANASTASIS_KSD_SERVER_ERROR,

  /**
   * The provider claims we made an error.
   */
  ANASTASIS_KSD_CLIENT_FAILURE,

  /**
   * The provider does not know this truth.
   */
  ANASTASIS_KSD_TRUTH_UNKNOWN,

  /**
   * Too many attempts to solve the challenge were made in a short
   * time. Try again later.
   */
  ANASTASIS_KSD_RATE_LIMIT_EXCEEDED,

  /**
   * The user did not satisfy the (external)
   * authentication check until the request timeout
   * was reached. The client should try again later.
   */
  ANASTASIS_KSD_AUTHENTICATION_TIMEOUT,

  /**
   * The plugin provided external challenge instructions
   * that should be followed. They are method-specific.
   */
  ANASTASIS_KSD_EXTERNAL_CHALLENGE_INSTRUCTIONS

};


/**
 * Detailed results from the successful download.
 */
struct ANASTASIS_KeyShareDownloadDetails
{

  /**
   * Operational status.
   */
  enum ANASTASIS_KeyShareDownloadStatus status;

  /**
   * Anastasis URL that returned the @e status.
   */
  const char *server_url;

  /**
   * Details depending on @e status.
   */
  union
  {

    /**
     * The encrypted key share (if @e status is #ANASTASIS_KSD_SUCCESS).
     */
    struct ANASTASIS_CRYPTO_EncryptedKeyShareP eks;

    /**
     * Response if the challenge still needs to be answered, and the
     * instructions are provided inline (no redirection).
     */
    struct
    {

      /**
       * HTTP status returned by the server.  #MHD_HTTP_ALREADY_REPORTED
       * if the server did already send the challenge to the user,
       * #MHD_HTTP_FORBIDDEN if the answer was wrong (or missing).
       */
      unsigned int http_status;

      /**
       * Response with server-side reply containing instructions for the user
       */
      const char *body;

      /**
       * Content-type: mime type of @e body, NULL if server did not provide any.
       */
      const char *content_type;

      /**
       * Number of bytes in @e body.
       */
      size_t body_size;

    } open_challenge;

    /**
     * URL with instructions for the user to satisfy the challenge, if
     * @e status is #ANASTASIS_KSD_REDIRECT_FOR_AUTHENTICATION.
     */
    const char *redirect_url;

    /**
     * Response with instructions for how to pay, if
     * @e status is #ANASTASIS_KSD_PAYMENT_REQUIRED.
     */
    struct
    {

      /**
       * "taler://pay" URL with details how to pay for the challenge.
       */
      const char *taler_pay_uri;

      /**
       * The order ID from @e taler_pay_uri.
       */
      struct ANASTASIS_PaymentSecretP payment_secret;

    } payment_required;


    /**
     * Response with details about a server-side failure, if
     * @e status is #ANASTASIS_KSD_SERVER_ERROR,
     * #ANASTASIS_KSD_CLIENT_FAILURE or #ANASTASIS_KSD_TRUTH_UNKNOWN.
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

    /**
     * External challenge instructions, if @e status is
     * #ANASTASIS_KSD_EXTERNAL_CHALLENGE_INSTRUCTIONS.
     */
    const json_t *external_challenge;

  } details;
};


/**
 * Handle for a GET /truth operation.
 */
struct ANASTASIS_KeyShareLookupOperation;


/**
 * Callback to process a GET /truth request
 *
 * @param cls closure
 * @param http_status HTTP status code for this request
 * @param kdd details about the key share
 */
typedef void
(*ANASTASIS_KeyShareLookupCallback) (
  void *cls,
  const struct ANASTASIS_KeyShareDownloadDetails *kdd);


/**
 * Does a GET /truth.
 *
 * @param ctx execution context
 * @param backend_url base URL of the merchant backend
 * @param truth_uuid identification of the Truth
 * @param truth_key Key used to Decrypt the Truth on the Server
 * @param payment_secret secret from the previously done payment NULL to trigger payment
 * @param timeout how long to wait for the payment, use
 *           #GNUNET_TIME_UNIT_ZERO to let the server pick
 * @param hashed_answer hashed answer to the challenge
 * @param cb callback which will work the response gotten from the backend
 * @param cb_cls closure to pass to the callback
 * @return handle for this operation, NULL upon errors
 */
struct ANASTASIS_KeyShareLookupOperation *
ANASTASIS_keyshare_lookup (
  struct GNUNET_CURL_Context *ctx,
  const char *backend_url,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
  const struct ANASTASIS_CRYPTO_TruthKeyP *truth_key,
  const struct ANASTASIS_PaymentSecretP *payment_secret,
  struct GNUNET_TIME_Relative timeout,
  const struct GNUNET_HashCode *hashed_answer,
  ANASTASIS_KeyShareLookupCallback cb,
  void *cb_cls);


/**
 * Cancel a GET /truth request.
 *
 * @param kslo cancel the key share lookup operation
 */
void
ANASTASIS_keyshare_lookup_cancel (
  struct ANASTASIS_KeyShareLookupOperation *kslo);


/**
 * Handle for a POST /truth operation.
 */
struct ANASTASIS_TruthStoreOperation;


/**
 * Callback to process a POST /truth request
 *
 * @param cls closure
 * @param obj the response body
 */
typedef void
(*ANASTASIS_TruthStoreCallback) (void *cls,
                                 const struct ANASTASIS_UploadDetails *up);


/**
 * Store Truth, does a POST /truth/$UUID
 *
 * @param ctx the CURL context used to connect to the backend
 * @param backend_url backend's base URL, including final "/"
 * @param uuid unique identfication of the Truth Upload
 * @param type type of the authorization method
 * @param encrypted_keyshare key material to return to the client upon authorization
 * @param truth_mime mime type of @e encrypted_truth (after decryption)
 * @param encrypted_truth_size number of bytes in @e encrypted_truth
 * @param encrypted_truth contains the @a type-specific authorization data
 * @param payment_years_requested for how many years would the client like the service to store the truth?
 * @param payment_timeout how long to wait for the payment, use
 *           #GNUNET_TIME_UNIT_ZERO to let the server pick
 * @param cb callback processing the response from /truth
 * @param cb_cls closure for cb
 * @return handle for the operation
 */
struct ANASTASIS_TruthStoreOperation *
ANASTASIS_truth_store (
  struct GNUNET_CURL_Context *ctx,
  const char *backend_url,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *uuid,
  const char *type,
  const struct ANASTASIS_CRYPTO_EncryptedKeyShareP *encrypted_keyshare,
  const char *truth_mime,
  size_t encrypted_truth_size,
  const void *encrypted_truth,
  uint32_t payment_years_requested,
  struct GNUNET_TIME_Relative payment_timeout,
  ANASTASIS_TruthStoreCallback cb,
  void *cb_cls);


/**
 * Cancel a POST /truth request.
 *
 * @param tso the truth store operation
 */
void
ANASTASIS_truth_store_cancel (
  struct ANASTASIS_TruthStoreOperation *tso);


#endif  /* _ANASTASIS_SERVICE_H */
