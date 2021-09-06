/*
  This file is part of Anastasis
  Copyright (C) 2017--2021 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or
  modify it under the terms of the GNU General Public License
  as published by the Free Software Foundation; either version 3,
  or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public
  License along with Anastasis; see the file COPYING.  If not,
  see <http://www.gnu.org/licenses/>
*/
/**
 * @file libanastasiseufin/lae_credit.c
 * @brief Implementation of the /history/incoming
 *        requests of the libeufin's Anastasis facade
 * @author Christian Grothoff
 * @author Marcello Stanisci
 */
#include "platform.h"
#include "lae_common.h"
#include <microhttpd.h> /* just for HTTP status codes */


/**
 * @brief A /history/incoming Handle
 */
struct ANASTASIS_EUFIN_CreditHistoryHandle
{

  /**
   * The url for this request.
   */
  char *request_url;

  /**
   * Handle for the request.
   */
  struct GNUNET_CURL_Job *job;

  /**
   * Function to call with the result.
   */
  ANASTASIS_EUFIN_CreditHistoryCallback hcb;

  /**
   * Closure for @a cb.
   */
  void *hcb_cls;
};


/**
 * Parse history given in JSON format and invoke the callback on each item.
 *
 * @param hh handle to the account history request
 * @param history JSON array with the history
 * @return #GNUNET_OK if history was valid and @a rhistory and @a balance
 *         were set,
 *         #GNUNET_SYSERR if there was a protocol violation in @a history
 */
static int
parse_account_history (struct ANASTASIS_EUFIN_CreditHistoryHandle *hh,
                       const json_t *history)
{
  json_t *history_array;

  if (NULL == (history_array = json_object_get (history,
                                                "incoming_transactions")))
  {
    GNUNET_break_op (0);
    return GNUNET_SYSERR;
  }
  if (! json_is_array (history_array))
  {
    GNUNET_break_op (0);
    return GNUNET_SYSERR;
  }
  for (unsigned int i = 0; i<json_array_size (history_array); i++)
  {
    struct ANASTASIS_EUFIN_CreditDetails td;
    uint64_t row_id;
    struct GNUNET_JSON_Specification hist_spec[] = {
      TALER_JSON_spec_amount_any ("amount",
                                  &td.amount),
      TALER_JSON_spec_absolute_time ("date",
                                     &td.execution_date),
      GNUNET_JSON_spec_uint64 ("row_id",
                               &row_id),
      GNUNET_JSON_spec_string ("subject",
                               &td.wire_subject),
      GNUNET_JSON_spec_string ("debit_account",
                               &td.debit_account_uri),
      GNUNET_JSON_spec_string ("credit_account",
                               &td.credit_account_uri),
      GNUNET_JSON_spec_end ()
    };
    json_t *transaction = json_array_get (history_array,
                                          i);

    if (GNUNET_OK !=
        GNUNET_JSON_parse (transaction,
                           hist_spec,
                           NULL, NULL))
    {
      GNUNET_break_op (0);
      return GNUNET_SYSERR;
    }
    if (GNUNET_OK !=
        hh->hcb (hh->hcb_cls,
                 MHD_HTTP_OK,
                 TALER_EC_NONE,
                 row_id,
                 &td))
    {
      hh->hcb = NULL;
      GNUNET_JSON_parse_free (hist_spec);
      return GNUNET_OK;
    }
    GNUNET_JSON_parse_free (hist_spec);
  }
  return GNUNET_OK;
}


/**
 * Function called when we're done processing the
 * HTTP /history/incoming request.
 *
 * @param cls the `struct ANASTASIS_EUFIN_CreditHistoryHandle`
 * @param response_code HTTP response code, 0 on error
 * @param response parsed JSON result, NULL on error
 */
static void
handle_credit_history_finished (void *cls,
                                long response_code,
                                const void *response)
{
  struct ANASTASIS_EUFIN_CreditHistoryHandle *hh = cls;
  const json_t *j = response;
  enum TALER_ErrorCode ec;

  hh->job = NULL;
  switch (response_code)
  {
  case 0:
    ec = TALER_EC_GENERIC_INVALID_RESPONSE;
    break;
  case MHD_HTTP_OK:
    if (GNUNET_OK !=
        parse_account_history (hh,
                               j))
    {
      GNUNET_break_op (0);
      response_code = 0;
      ec = TALER_EC_GENERIC_INVALID_RESPONSE;
      break;
    }
    response_code = MHD_HTTP_NO_CONTENT; /* signal end of list */
    ec = TALER_EC_NONE;
    break;
  case MHD_HTTP_NO_CONTENT:
    ec = TALER_EC_NONE;
    break;
  case MHD_HTTP_BAD_REQUEST:
    /* This should never happen, either us or the bank is buggy
       (or API version conflict); just pass JSON reply to the application */
    GNUNET_break_op (0);
    ec = TALER_JSON_get_error_code (j);
    break;
  case MHD_HTTP_UNAUTHORIZED:
    /* Nothing really to verify, bank says the HTTP Authentication
       failed. May happen if HTTP authentication is used and the
       user supplied a wrong username/password combination. */
    ec = TALER_JSON_get_error_code (j);
    break;
  case MHD_HTTP_NOT_FOUND:
    /* Nothing really to verify: the bank is either unaware
       of the endpoint (not a bank), or of the account.
       We should pass the JSON (?) reply to the application */
    ec = TALER_JSON_get_error_code (j);
    break;
  case MHD_HTTP_INTERNAL_SERVER_ERROR:
    /* Server had an internal issue; we should retry, but this API
       leaves this to the application */
    ec = TALER_JSON_get_error_code (j);
    break;
  default:
    /* unexpected response code */
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Unexpected response code %u\n",
                (unsigned int) response_code);
    ec = TALER_JSON_get_error_code (j);
    break;
  }
  if (NULL != hh->hcb)
    hh->hcb (hh->hcb_cls,
             response_code,
             ec,
             0LLU,
             NULL);
  ANASTASIS_EUFIN_credit_history_cancel (hh);
}


struct ANASTASIS_EUFIN_CreditHistoryHandle *
ANASTASIS_EUFIN_credit_history (
  struct GNUNET_CURL_Context *ctx,
  const struct ANASTASIS_EUFIN_AuthenticationData *auth,
  uint64_t start_row,
  int64_t num_results,
  struct GNUNET_TIME_Relative timeout,
  ANASTASIS_EUFIN_CreditHistoryCallback hres_cb,
  void *hres_cb_cls)
{
  char url[128];
  struct ANASTASIS_EUFIN_CreditHistoryHandle *hh;
  CURL *eh;
  unsigned long long tms;

  if (0 == num_results)
  {
    GNUNET_break (0);
    return NULL;
  }

  tms = (unsigned long long) (timeout.rel_value_us
                              / GNUNET_TIME_UNIT_MILLISECONDS.rel_value_us);
  if ( ( (UINT64_MAX == start_row) &&
         (0 > num_results) ) ||
       ( (0 == start_row) &&
         (0 < num_results) ) )
  {
    if ( (0 < num_results) &&
         (! GNUNET_TIME_relative_is_zero (timeout)) )
      GNUNET_snprintf (url,
                       sizeof (url),
                       "history/incoming?delta=%lld&long_poll_ms=%llu",
                       (long long) num_results,
                       tms);
    else
      GNUNET_snprintf (url,
                       sizeof (url),
                       "history/incoming?delta=%lld",
                       (long long) num_results);
  }
  else
  {
    if ( (0 < num_results) &&
         (! GNUNET_TIME_relative_is_zero (timeout)) )
      GNUNET_snprintf (url,
                       sizeof (url),
                       "history/incoming?delta=%lld&start=%llu&long_poll_ms=%llu",
                       (long long) num_results,
                       (unsigned long long) start_row,
                       tms);
    else
      GNUNET_snprintf (url,
                       sizeof (url),
                       "history/incoming?delta=%lld&start=%llu",
                       (long long) num_results,
                       (unsigned long long) start_row);
  }
  hh = GNUNET_new (struct ANASTASIS_EUFIN_CreditHistoryHandle);
  hh->hcb = hres_cb;
  hh->hcb_cls = hres_cb_cls;
  hh->request_url = TALER_url_join (auth->wire_gateway_url,
                                    url,
                                    NULL);
  if (NULL == hh->request_url)
  {
    GNUNET_free (hh);
    GNUNET_break (0);
    return NULL;
  }
  GNUNET_log (GNUNET_ERROR_TYPE_INFO,
              "Requesting credit history at `%s'\n",
              hh->request_url);
  eh = curl_easy_init ();
  if ( (NULL == eh) ||
       (GNUNET_OK !=
        ANASTASIS_EUFIN_setup_auth_ (eh,
                                     auth)) ||
       (CURLE_OK !=
        curl_easy_setopt (eh,
                          CURLOPT_URL,
                          hh->request_url)) )
  {
    GNUNET_break (0);
    ANASTASIS_EUFIN_credit_history_cancel (hh);
    if (NULL != eh)
      curl_easy_cleanup (eh);
    return NULL;
  }
  if (0 != tms)
  {
    GNUNET_break (CURLE_OK ==
                  curl_easy_setopt (eh,
                                    CURLOPT_TIMEOUT_MS,
                                    (long) tms));
  }
  hh->job = GNUNET_CURL_job_add2 (ctx,
                                  eh,
                                  NULL,
                                  &handle_credit_history_finished,
                                  hh);
  return hh;
}


void
ANASTASIS_EUFIN_credit_history_cancel (
  struct ANASTASIS_EUFIN_CreditHistoryHandle *hh)
{
  if (NULL != hh->job)
  {
    GNUNET_CURL_job_cancel (hh->job);
    hh->job = NULL;
  }
  GNUNET_free (hh->request_url);
  GNUNET_free (hh);
}


/* end of lae_credit.c */
