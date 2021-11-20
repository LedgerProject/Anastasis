/*
  This file is part of ANASTASIS
  Copyright (C) 2021 Anastasis Systems SA

  ANASTASIS is free software; you can redistribute it and/or modify it under the
  terms of the GNU Affero General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  ANASTASIS is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with
  ANASTASIS; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
*/
/**
 * @file include/anastasis_eufin_lib.h
 * @brief C interface to access the Anastasis facade of LibEuFin
 *        See https://docs.taler.net/TBD
 * @author Christian Grothoff
 */
#ifndef ANASTASIS_EUFIN_LIB_H
#define ANASTASIS_EUFIN_LIB_H

#define GNU_TALER_ERROR_CODES_H 1
#include "anastasis_error_codes.h"
#include <jansson.h>
#include <gnunet/gnunet_curl_lib.h>
#include <taler/taler_util.h>


/**
 * Authentication method types.
 */
enum ANASTASIS_EUFIN_AuthenticationMethod
{

  /**
   * No authentication.
   */
  ANASTASIS_EUFIN_AUTH_NONE,

  /**
   * Basic authentication with cleartext username and password.
   */
  ANASTASIS_EUFIN_AUTH_BASIC,
};


/**
 * Information used to authenticate to the bank.
 */
struct ANASTASIS_EUFIN_AuthenticationData
{

  /**
   * Base URL we use to talk to the wire gateway,
   * which talks to the bank for us.
   */
  char *wire_gateway_url;

  /**
   * Which authentication method should we use?
   */
  enum ANASTASIS_EUFIN_AuthenticationMethod method;

  /**
   * Further details as per @e method.
   */
  union
  {

    /**
     * Details for #ANASTASIS_EUFIN_AUTH_BASIC.
     */
    struct
    {
      /**
       * Username to use.
       */
      char *username;

      /**
       * Password to use.
       */
      char *password;
    } basic;

  } details;

};


/* ********************* /history/incoming *********************** */

/**
 * Handle for querying the bank for transactions
 * made to the exchange.
 */
struct ANASTASIS_EUFIN_CreditHistoryHandle;

/**
 * Details about a wire transfer to the exchange.
 */
struct ANASTASIS_EUFIN_CreditDetails
{
  /**
   * Amount that was transferred
   */
  struct TALER_Amount amount;

  /**
   * Time of the the transfer
   */
  struct GNUNET_TIME_Absolute execution_date;

  /**
   * The wire transfer subject.
   */
  const char *wire_subject;

  /**
   * payto://-URL of the source account that
   * send the funds.
   */
  const char *debit_account_uri;

  /**
   * payto://-URL of the target account that
   * received the funds.
   */
  const char *credit_account_uri;
};


/**
 * Callbacks of this type are used to serve the result of asking
 * the bank for the credit transaction history.
 *
 * @param cls closure
 * @param http_status HTTP response code, #MHD_HTTP_OK (200) for successful status request
 *                    0 if the bank's reply is bogus (fails to follow the protocol),
 *                    #MHD_HTTP_NO_CONTENT if there are no more results; on success the
 *                    last callback is always of this status (even if `abs(num_results)` were
 *                    already returned).
 * @param ec detailed error code
 * @param serial_id monotonically increasing counter corresponding to the transaction
 * @param details details about the wire transfer
 * @return #GNUNET_OK to continue, #GNUNET_SYSERR to abort iteration
 */
typedef enum GNUNET_GenericReturnValue
(*ANASTASIS_EUFIN_CreditHistoryCallback)(
  void *cls,
  unsigned int http_status,
  enum TALER_ErrorCode ec,
  uint64_t serial_id,
  const struct ANASTASIS_EUFIN_CreditDetails *details);


/**
 * Request the wire credit history of an exchange's bank account.
 *
 * @param ctx curl context for the event loop
 * @param auth authentication data to use
 * @param start_row from which row on do we want to get results, use UINT64_MAX for the latest; exclusive
 * @param num_results how many results do we want; negative numbers to go into the past,
 *                    positive numbers to go into the future starting at @a start_row;
 *                    must not be zero.
 * @param timeout how long the client is willing to wait for more results
 *                (only useful if @a num_results is positive)
 * @param hres_cb the callback to call with the transaction history
 * @param hres_cb_cls closure for the above callback
 * @return NULL
 *         if the inputs are invalid (i.e. zero value for @e num_results).
 *         In this case, the callback is not called.
 */
struct ANASTASIS_EUFIN_CreditHistoryHandle *
ANASTASIS_EUFIN_credit_history (
  struct GNUNET_CURL_Context *ctx,
  const struct ANASTASIS_EUFIN_AuthenticationData *auth,
  uint64_t start_row,
  int64_t num_results,
  struct GNUNET_TIME_Relative timeout,
  ANASTASIS_EUFIN_CreditHistoryCallback hres_cb,
  void *hres_cb_cls);


/**
 * Cancel an history request.  This function cannot be used on a request
 * handle if the last response (anything with a status code other than
 * 200) is already served for it.
 *
 * @param hh the history request handle
 */
void
ANASTASIS_EUFIN_credit_history_cancel (
  struct ANASTASIS_EUFIN_CreditHistoryHandle *hh);


/* ******************** Convenience functions **************** */


/**
 * Convenience method for parsing configuration section with bank
 * authentication data.
 *
 * @param cfg configuration to parse
 * @param section the section with the configuration data
 * @param[out] auth set to the configuration data found
 * @return #GNUNET_OK on success
 */
int
ANASTASIS_EUFIN_auth_parse_cfg (const struct GNUNET_CONFIGURATION_Handle *cfg,
                                const char *section,
                                struct ANASTASIS_EUFIN_AuthenticationData *auth);


/**
 * Free memory inside of @a auth (but not @a auth itself).
 * Dual to #ANASTASIS_EUFIN_auth_parse_cfg().
 *
 * @param auth authentication data to free
 */
void
ANASTASIS_EUFIN_auth_free (struct ANASTASIS_EUFIN_AuthenticationData *auth);


#endif  /* _ANASTASIS_EUFIN_SERVICE_H */
