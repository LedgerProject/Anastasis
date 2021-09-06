/*
  This file is part of Anastasis
  Copyright (C) 2019-2021 Anastasis SARL

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
 * @file include/anastasis_database_plugin.h
 * @brief database access for Anastasis
 * @author Christian Grothoff
 */
#ifndef ANASTASIS_DATABASE_PLUGIN_H
#define ANASTASIS_DATABASE_PLUGIN_H

#include "anastasis_service.h"
#include <gnunet/gnunet_db_lib.h>

/**
 * How long is an offer for a challenge payment valid for payment?
 */
#define ANASTASIS_CHALLENGE_OFFER_LIFETIME GNUNET_TIME_UNIT_HOURS

/**
 * Return values for checking code validity.
 */
enum ANASTASIS_DB_CodeStatus
{
  /**
   * Provided authentication code does not match database content.
   */
  ANASTASIS_DB_CODE_STATUS_CHALLENGE_CODE_MISMATCH = -3,

  /**
   * Encountered hard error talking to DB.
   */
  ANASTASIS_DB_CODE_STATUS_HARD_ERROR = -2,

  /**
   * Encountered serialization error talking to DB.
   */
  ANASTASIS_DB_CODE_STATUS_SOFT_ERROR = -1,

  /**
   * We have no challenge in the database.
   */
  ANASTASIS_DB_CODE_STATUS_NO_RESULTS = 0,

  /**
   * The provided challenge matches what we have in the database.
   */
  ANASTASIS_DB_CODE_STATUS_VALID_CODE_STORED = 1,
};


/**
 * Return values for checking account validity.
 */
enum ANASTASIS_DB_AccountStatus
{
  /**
   * Account is unknown, user should pay to establish it.
   */
  ANASTASIS_DB_ACCOUNT_STATUS_PAYMENT_REQUIRED = -3,

  /**
   * Encountered hard error talking to DB.
   */
  ANASTASIS_DB_ACCOUNT_STATUS_HARD_ERROR = -2,

  /**
   * Account is valid, but we have no policy stored yet.
   */
  ANASTASIS_DB_ACCOUNT_STATUS_NO_RESULTS = 0,

  /**
   * Account is valid, and we have a policy stored.
   */
  ANASTASIS_DB_ACCOUNT_STATUS_VALID_HASH_RETURNED = 1,
};


/**
 * Return values for storing data in database with payment.
 */
enum ANASTASIS_DB_StoreStatus
{
  /**
   * The client has stored too many policies, should pay to store more.
   */
  ANASTASIS_DB_STORE_STATUS_STORE_LIMIT_EXCEEDED = -4,

  /**
   * The client needs to pay to store policies.
   */
  ANASTASIS_DB_STORE_STATUS_PAYMENT_REQUIRED = -3,

  /**
   * Encountered hard error talking to DB.
   */
  ANASTASIS_DB_STORE_STATUS_HARD_ERROR = -2,

  /**
   * Despite retrying, we encountered serialization errors.
   */
  ANASTASIS_DB_STORE_STATUS_SOFT_ERROR = -1,

  /**
   * Database did not need an update (document exists).
   */
  ANASTASIS_DB_STORE_STATUS_NO_RESULTS = 0,

  /**
   * We successfully stored the document.
   */
  ANASTASIS_DB_STORE_STATUS_SUCCESS = 1,
};


/**
 * Function called on all pending payments for an account or challenge.
 *
 * @param cls closure
 * @param timestamp for how long have we been waiting
 * @param payment_secret payment secret / order id in the backend
 * @param amount how much is the order for
 */
typedef void
(*ANASTASIS_DB_PaymentPendingIterator)(
  void *cls,
  struct GNUNET_TIME_Absolute timestamp,
  const struct ANASTASIS_PaymentSecretP *payment_secret,
  const struct TALER_Amount *amount);


/**
 * Function called to test if a given wire transfer
 * satisfied the authentication requirement of the
 * IBAN plugin.
 *
 * @param cls closure
 * @param credit amount that was transferred
 * @param wire_subject subject provided in the wire transfer
 * @return true if this wire transfer satisfied the authentication check
 */
typedef bool
(*ANASTASIS_DB_AuthIbanTransfercheck)(
  void *cls,
  const struct TALER_Amount *credit,
  const char *wire_subject);


/**
 * Handle to interact with the database.
 *
 * Functions ending with "_TR" run their OWN transaction scope
 * and MUST NOT be called from within a transaction setup by the
 * caller.  Functions ending with "_NT" require the caller to
 * setup a transaction scope.  Functions without a suffix are
 * simple, single SQL queries that MAY be used either way.
 */
struct ANASTASIS_DatabasePlugin
{

  /**
   * Closure for all callbacks.
   */
  void *cls;

  /**
   * Name of the library which generated this plugin.  Set by the
   * plugin loader.
   */
  char *library_name;

  /**
   * Drop anastasis tables. Used for testcases.
   *
   * @param cls closure
   * @return #GNUNET_OK upon success; #GNUNET_SYSERR upon failure
   */
  enum GNUNET_GenericReturnValue
  (*drop_tables)(void *cls);

  /**
   * Connect to the database.
   *
   * @param cls closure
   * @return #GNUNET_OK upon success; #GNUNET_SYSERR upon failure
   */
  enum GNUNET_GenericReturnValue
  (*connect)(void *cls);

  /**
   * Initialize merchant tables
   *
   * @param cls closure
   * @return #GNUNET_OK upon success; #GNUNET_SYSERR upon failure
   */
  enum GNUNET_GenericReturnValue
  (*create_tables)(void *cls);

  /**
   * Function called to perform "garbage collection" on the
   * database, expiring records we no longer require.  Deletes
   * all user records that are not paid up (and by cascade deletes
   * the associated recovery documents). Also deletes expired
   * truth and financial records older than @a fin_expire.
   *
   * @param cls closure
   * @param expire_backups backups older than the given time stamp should be garbage collected
   * @param expire_pending_payments payments still pending from since before
   *            this value should be garbage collected
   * @return transaction status
   */
  enum GNUNET_DB_QueryStatus
  (*gc)(void *cls,
        struct GNUNET_TIME_Absolute expire,
        struct GNUNET_TIME_Absolute expire_pending_payments);

  /**
  * Do a pre-flight check that we are not in an uncommitted transaction.
  * If we are, try to commit the previous transaction and output a warning.
  * Does not return anything, as we will continue regardless of the outcome.
  *
  * @param cls the `struct PostgresClosure` with the plugin-specific state
  */
  void
  (*preflight) (void *cls);

  /**
  * Check that the database connection is still up.
  *
  * @param pg connection to check
  */
  void
  (*check_connection) (void *cls);

  /**
  * Roll back the current transaction of a database connection.
  *
  * @param cls the `struct PostgresClosure` with the plugin-specific state
  * @return #GNUNET_OK on success
  */
  void
  (*rollback) (void *cls);

  /**
   * Start a transaction.
   *
   * @param cls the `struct PostgresClosure` with the plugin-specific state
   * @param name unique name identifying the transaction (for debugging),
   *             must point to a constant
   * @return #GNUNET_OK on success
   */
  int
  (*start) (void *cls,
            const char *name);

  /**
   * Commit the current transaction of a database connection.
   *
   * @param cls the `struct PostgresClosure` with the plugin-specific state
   * @return transaction status code
   */
  enum GNUNET_DB_QueryStatus
  (*commit)(void *cls);


  /**
   * Register callback to be invoked on events of type @a es.
   *
   * @param cls database context to use
   * @param es specification of the event to listen for
   * @param timeout how long to wait for the event
   * @param cb function to call when the event happens, possibly
   *         multiple times (until cancel is invoked)
   * @param cb_cls closure for @a cb
   * @return handle useful to cancel the listener
   */
  struct GNUNET_DB_EventHandler *
  (*event_listen)(void *cls,
                  const struct GNUNET_DB_EventHeaderP *es,
                  struct GNUNET_TIME_Relative timeout,
                  GNUNET_DB_EventCallback cb,
                  void *cb_cls);

  /**
   * Stop notifications.
   *
   * @param eh handle to unregister.
   */
  void
  (*event_listen_cancel)(struct GNUNET_DB_EventHandler *eh);


  /**
   * Notify all that listen on @a es of an event.
   *
   * @param cls database context to use
   * @param es specification of the event to generate
   * @param extra additional event data provided
   * @param extra_size number of bytes in @a extra
   */
  void
  (*event_notify)(void *cls,
                  const struct GNUNET_DB_EventHeaderP *es,
                  const void *extra,
                  size_t extra_size);


  /**
   * Store encrypted recovery document.
   *
   * @param cls closure
   * @param account_pub public key of the user's account
   * @param account_sig signature affirming storage request
   * @param recovery_data_hash hash of @a data
   * @param recovery_data contains encrypted recovery document
   * @param recovery_data_size size of @a recovery_data blob
   * @param payment_secret identifier for the payment, used to later charge on uploads
   * @param[out] version set to the version assigned to the document by the database
   * @return transaction status, 0 if upload could not be finished because @a payment_secret
   *         did not have enough upload left; HARD error if @a payment_secret is unknown, ...
   */
  enum ANASTASIS_DB_StoreStatus
  (*store_recovery_document)(
    void *cls,
    const struct ANASTASIS_CRYPTO_AccountPublicKeyP *account_pub,
    const struct ANASTASIS_AccountSignatureP *account_sig,
    const struct GNUNET_HashCode *recovery_data_hash,
    const void *recovery_data,
    size_t recovery_data_size,
    const struct ANASTASIS_PaymentSecretP *payment_secret,
    uint32_t *version);


  /**
   * Fetch recovery document for user according given version.
   *
   * @param cls closure
   * @param account_pub public key of the user's account
   * @param version the version number of the policy the user requests
   * @param[out] account_sig signature
   * @param[out] recovery_data_hash hash of the current recovery data
   * @param[out] data_size size of data blob
   * @param[out] data blob which contains the recovery document
   * @return transaction status
   */
  enum GNUNET_DB_QueryStatus
  (*get_recovery_document)(
    void *cls,
    const struct ANASTASIS_CRYPTO_AccountPublicKeyP *account_pub,
    uint32_t version,
    struct ANASTASIS_AccountSignatureP *account_sig,
    struct GNUNET_HashCode *recovery_data_hash,
    size_t *data_size,
    void **data);


  /**
   * Fetch latest recovery document for user.
   *
   * @param cls closure
   * @param account_pub public key of the user's account
   * @param account_sig signature
   * @param recovery_data_hash hash of the current recovery data
   * @param[out] data_size set to size of @a data blob
   * @param[out] data set to blob which contains the recovery document
   * @param[out] version set to the version number of the policy being returned
   * @return transaction status
   */
  enum GNUNET_DB_QueryStatus
  (*get_latest_recovery_document)(
    void *cls,
    const struct ANASTASIS_CRYPTO_AccountPublicKeyP *account_pub,
    struct ANASTASIS_AccountSignatureP *account_sig,
    struct GNUNET_HashCode *recovery_data_hash,
    size_t *data_size,
    void **data,
    uint32_t *version);


  /**
   * Upload Truth, which contains the Truth and the KeyShare.
   *
   * @param cls closure
   * @param truth_uuid the identifier for the Truth
   * @param key_share_data contains information of an EncryptedKeyShare
   * @param mime_type presumed mime type of data in @a encrypted_truth
   * @param encrypted_truth contains the encrypted Truth which includes the ground truth i.e. H(challenge answer), phonenumber, SMS
   * @param encrypted_truth_size the size of the Truth
   * @param method name of method
   * @param truth_expiration time till the according data will be stored
   * @return transaction status
   */
  enum GNUNET_DB_QueryStatus
  (*store_truth)(
    void *cls,
    const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
    const struct ANASTASIS_CRYPTO_EncryptedKeyShareP *key_share_data,
    const char *mime_type,
    const void *encrypted_truth,
    size_t encrypted_truth_size,
    const char *method,
    struct GNUNET_TIME_Relative truth_expiration);


  /**
   * Get the encrypted truth to validate the challenge response
   *
   * @param cls closure
   * @param truth_uuid the identifier for the Truth
   * @param[out] truth contains the encrypted truth
   * @param[out] truth_size size of the encrypted truth
   * @param[out] truth_mime mime type of truth
   * @param[out] method type of the challenge
   * @return transaction status
   */
  enum GNUNET_DB_QueryStatus
  (*get_escrow_challenge)(
    void *cls,
    const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
    void **truth,
    size_t *truth_size,
    char **truth_mime,
    char **method);


  /**
   * Lookup (encrypted) key share by @a truth_uuid.
   *
   * @param cls closure
   * @param truth_uuid the identifier for the Truth
   * @param[out] key_share set to the encrypted Keyshare
   * @return transaction status
   */
  enum GNUNET_DB_QueryStatus
  (*get_key_share)(
    void *cls,
    const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
    struct ANASTASIS_CRYPTO_EncryptedKeyShareP *key_share);


  /**
   * Check if an account exists, and if so, return the
   * current @a recovery_document_hash.
   *
   * @param cls closure
   * @param account_pub account identifier
   * @param[out] paid_until until when is the account paid up?
   * @param[out] recovery_data_hash set to hash of @a recovery document
   * @param[out] version set to the recovery policy version
   * @return transaction status
   */
  enum ANASTASIS_DB_AccountStatus
  (*lookup_account)(
    void *cls,
    const struct ANASTASIS_CRYPTO_AccountPublicKeyP *account_pub,
    struct GNUNET_TIME_Absolute *paid_until,
    struct GNUNET_HashCode *recovery_data_hash,
    uint32_t *version);


  /**
   * Check payment identifier. Used to check if a payment identifier given by
   * the user is valid (existing and paid).
   *
   * @param cls closure
   * @param payment_secret payment secret which the user must provide with every upload
   * @param[out] paid bool value to show if payment is paid
   * @param[out] valid_counter bool value to show if post_counter is > 0
   * @return transaction status
   */
  enum GNUNET_DB_QueryStatus
  (*check_payment_identifier)(
    void *cls,
    const struct ANASTASIS_PaymentSecretP *payment_secret,
    bool *paid,
    bool *valid_counter);


  /**
   * Check payment identifier. Used to check if a payment identifier given by
   * the user is valid (existing and paid).
   *
   * @param cls closure
   * @param payment_secret payment secret which the user must provide with every upload
   * @param truth_uuid unique identifier of the truth the user must satisfy the challenge
   * @param[out] paid bool value to show if payment is paid
   * @return transaction status
   */
  enum GNUNET_DB_QueryStatus
  (*check_challenge_payment)(
    void *cls,
    const struct ANASTASIS_PaymentSecretP *payment_secret,
    const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
    bool *paid);


  /**
   * Increment account lifetime by @a lifetime.
   *
   * @param cls closure
   * @param account_pub which account received a payment
   * @param payment_identifier proof of payment, must be unique and match pending payment
   * @param lifetime for how long is the account now paid (increment)
   * @param[out] paid_until set to the end of the lifetime after the operation
   * @return transaction status
   */
  enum GNUNET_DB_QueryStatus
  (*increment_lifetime)(
    void *cls,
    const struct ANASTASIS_CRYPTO_AccountPublicKeyP *account_pub,
    const struct ANASTASIS_PaymentSecretP *payment_identifier,
    struct GNUNET_TIME_Relative lifetime,
    struct GNUNET_TIME_Absolute *paid_until);


  /**
   * Update account lifetime to the maximum of the current
   * value and @a eol.
   *
   * @param cls closure
   * @param account_pub which account received a payment
   * @param payment_identifier proof of payment, must be unique and match pending payment
   * @param eol for how long is the account now paid (absolute)
   * @return transaction status
   */
  enum GNUNET_DB_QueryStatus
  (*update_lifetime)(
    void *cls,
    const struct ANASTASIS_CRYPTO_AccountPublicKeyP *account_pub,
    const struct ANASTASIS_PaymentSecretP *payment_identifier,
    struct GNUNET_TIME_Absolute eol);


  /**
   * Store payment. Used to begin a payment, not indicative
   * that the payment actually was made. (That is done
   * when we increment the account's lifetime.)
   *
   * @param cls closure
   * @param account_pub anastasis's public key
   * @param post_counter how many uploads does @a amount pay for
   * @param payment_secret payment secret which the user must provide with every upload
   * @param amount how much we asked for
   * @return transaction status
   */
  enum GNUNET_DB_QueryStatus
  (*record_recdoc_payment)(
    void *cls,
    const struct ANASTASIS_CRYPTO_AccountPublicKeyP *account_pub,
    uint32_t post_counter,
    const struct ANASTASIS_PaymentSecretP *payment_secret,
    const struct TALER_Amount *amount);


  /**
   * Record truth upload payment was made.
   *
   * @param cls closure
   * @param uuid the truth's UUID
   * @param amount the amount that was paid
   * @param duration how long is the truth paid for
   * @return transaction status
   */
  enum GNUNET_DB_QueryStatus
  (*record_truth_upload_payment)(
    void *cls,
    const struct ANASTASIS_CRYPTO_TruthUUIDP *uuid,
    const struct TALER_Amount *amount,
    struct GNUNET_TIME_Relative duration);


  /**
   * Inquire whether truth upload payment was made.
   *
   * @param cls closure
   * @param uuid the truth's UUID
   * @param[out] paid_until set for how long this truth is paid for
   * @return transaction status
   */
  enum GNUNET_DB_QueryStatus
  (*check_truth_upload_paid)(
    void *cls,
    const struct ANASTASIS_CRYPTO_TruthUUIDP *uuid,
    struct GNUNET_TIME_Absolute *paid_until);


  /**
   * Verify the provided code with the code on the server.
   * If the code matches the function will return with success, if the code
   * does not match, the retry counter will be decreased by one.
   *
   * @param cls closure
   * @param truth_uuid identification of the challenge which the code corresponds to
   * @param hashed_code code which the user provided and wants to verify
   * @param[out] code set to the original numeric code
   * @param[out] satisfied set to true if the challenge is set to satisfied
   * @return transaction status
   */
  enum ANASTASIS_DB_CodeStatus
  (*verify_challenge_code)(
    void *cls,
    const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
    const struct GNUNET_HashCode *hashed_code,
    uint64_t *code,
    bool *satisfied);


  /**
   * Set the 'satisfied' bit for the given challenge and code to
   * 'true'.
   *
   * @param cls closure
   * @param truth_uuid identification of the challenge which the code corresponds to
   * @param code code which is now satisfied
   * @return transaction status
   */
  enum GNUNET_DB_QueryStatus
  (*mark_challenge_code_satisfied)(
    void *cls,
    const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
    const uint64_t code);


  /**
   * Check if the 'satisfied' bit for the given challenge and code is
   * 'true' and the challenge code is not yet expired.
   *
   * @param cls closure
   * @param truth_uuid identification of the challenge which the code corresponds to
   * @param code code which is now satisfied
   * @param after after what time must the challenge have been created
   * @return transaction status,
   *        #GNUNET_DB_STATUS_SUCCESS_NO_RESULTS if the challenge code is not satisfied or expired
   *        #GNUNET_DB_STATUS_SUCCESS_ONE_RESULT if the challenge code has been marked as satisfied
   */
  enum GNUNET_DB_QueryStatus
  (*test_challenge_code_satisfied)(
    void *cls,
    const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
    const uint64_t code,
    struct GNUNET_TIME_Absolute after);


  /**
   * Insert a new challenge code for a given challenge identified by the challenge
   * public key. The function will first check if there is already a valid code
   * for this challenge present and won't insert a new one in this case.
   *
   * @param cls closure
   * @param truth_uuid the identifier for the challenge
   * @param rotation_period for how long is the code available
   * @param validity_period for how long is the code available
   * @param retry_counter amount of retries allowed
   * @param[out] retransmission_date when to next retransmit
   * @param[out] code set to the code which will be checked for later
   * @return transaction status,
   *        #GNUNET_DB_STATUS_SUCCESS_NO_RESULTS if we are out of valid tries,
   *        #GNUNET_DB_STATUS_SUCCESS_ONE_RESULT if @a code is now in the DB
   */
  enum GNUNET_DB_QueryStatus
  (*create_challenge_code)(
    void *cls,
    const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
    struct GNUNET_TIME_Relative rotation_period,
    struct GNUNET_TIME_Relative validity_period,
    uint32_t retry_counter,
    struct GNUNET_TIME_Absolute *retransmission_date,
    uint64_t *code);


  /**
   * Remember in the database that we successfully sent a challenge.
   *
   * @param cls closure
   * @param truth_uuid the identifier for the challenge
   * @param code the challenge that was sent
   */
  enum GNUNET_DB_QueryStatus
  (*mark_challenge_sent)(
    void *cls,
    const struct ANASTASIS_PaymentSecretP *payment_secret,
    const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
    uint64_t code);


  /**
   * Store payment for challenge.
   *
   * @param cls closure
   * @param truth_key identifier of the challenge to pay
   * @param payment_secret payment secret which the user must provide with every upload
   * @param amount how much we asked for
   * @return transaction status
   */
  enum GNUNET_DB_QueryStatus
  (*record_challenge_payment)(
    void *cls,
    const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
    const struct ANASTASIS_PaymentSecretP *payment_secret,
    const struct TALER_Amount *amount);


  /**
   * Record refund for challenge.
   *
   * @param cls closure
   * @param truth_uuid identifier of the challenge to refund
   * @param payment_secret payment secret which the user must provide with every upload
   * @return transaction status
   */
  enum GNUNET_DB_QueryStatus
  (*record_challenge_refund)(
    void *cls,
    const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
    const struct ANASTASIS_PaymentSecretP *payment_secret);


  /**
   * Lookup for a pending payment for a certain challenge
   *
   * @param cls closure
   * @param truth_uuid identification of the challenge
   * @param[out] payment_secret set to the challenge payment secret
   * @return transaction status
   */
  enum GNUNET_DB_QueryStatus
  (*lookup_challenge_payment)(
    void *cls,
    const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
    struct ANASTASIS_PaymentSecretP *payment_secret);


  /**
   * Update payment status of challenge
   *
   * @param cls closure
   * @param truth_uuid which challenge received a payment
   * @param payment_identifier proof of payment, must be unique and match pending payment
   * @return transaction status
   */
  enum GNUNET_DB_QueryStatus
  (*update_challenge_payment)(
    void *cls,
    const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
    const struct ANASTASIS_PaymentSecretP *payment_identifier);


  /**
   * Store inbound IBAN payment made for authentication.
   *
   * @param cls closure
   * @param wire_reference unique identifier inside LibEuFin/Nexus
   * @param wire_subject subject of the wire transfer
   * @param amount how much was transferred
   * @param debit_account account that was debited
   * @param credit_account Anastasis operator account credited
   * @param execution_date when was the transfer made
   * @return transaction status
   */
  enum GNUNET_DB_QueryStatus
  (*record_auth_iban_payment)(
    void *cls,
    uint64_t wire_reference,
    const char *wire_subject,
    const struct TALER_Amount *amount,
    const char *debit_account,
    const char *credit_account,
    struct GNUNET_TIME_Absolute execution_date);


  /**
   * Function to check if we are aware of a wire transfer
   * that satisfies the IBAN plugin's authentication check.
   *
   * @param cls closure
   * @param debit_account which debit account to check
   * @param earliest_date earliest date to check
   * @param cb function to call on all entries found
   * @param cb_cls closure for @a cb
   * @return transaction status,
   *    #GNUNET_DB_STATUS_SUCCESS_ONE_RESULT if @a cb
   *      returned 'true' once
   *    #GNUNET_DB_STATUS_SUCCESS_NO_RESULTS if no
   *      wire transfers existed for which @a cb returned true
   */
  enum GNUNET_DB_QueryStatus
  (*test_auth_iban_payment)(
    void *cls,
    const char *debit_account,
    struct GNUNET_TIME_Absolute earliest_date,
    ANASTASIS_DB_AuthIbanTransfercheck cb,
    void *cb_cls);


  /**
   * Function to check the last known IBAN payment.
   *
   * @param cls closure
   * @param credit_account which credit account to check
   * @param[out] last_row set to the last known row
   * @return transaction status,
   *    #GNUNET_DB_STATUS_SUCCESS_ONE_RESULT if @a cb
   *      returned 'true' once
   *    #GNUNET_DB_STATUS_SUCCESS_NO_RESULTS if no
   *      wire transfers existed for which @a cb returned true
   */
  enum GNUNET_DB_QueryStatus
  (*get_last_auth_iban_payment_row)(
    void *cls,
    const char *credit_account,
    uint64_t *last_row);


  /**
   * Function called to remove all expired codes from the database.
   *
   * @return transaction status
   */
  enum GNUNET_DB_QueryStatus
  (*challenge_gc)(void *cls);


};
#endif
