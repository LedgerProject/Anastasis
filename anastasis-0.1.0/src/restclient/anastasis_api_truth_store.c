/*
  This file is part of Anastasis
  Copyright (C) 2020, 2021 Anastasis SARL

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
 * @file restclient/anastasis_api_truth_store.c
 * @brief Implementation of the /truth GET and POST
 * @author Christian Grothoff
 * @author Dennis Neufeld
 * @author Dominik Meister
 */
#include "platform.h"
#include <curl/curl.h>
#include <jansson.h>
#include <microhttpd.h> /* just for HTTP status codes */
#include "anastasis_service.h"
#include "anastasis_api_curl_defaults.h"
#include <taler/taler_json_lib.h>
#include <taler/taler_merchant_service.h>


struct ANASTASIS_TruthStoreOperation
{
  /**
   * Complete URL where the backend offers /truth
   */
  char *url;

  /**
   * Handle for the request.
   */
  struct GNUNET_CURL_Job *job;

  /**
   * The CURL context to connect to the backend
   */
  struct GNUNET_CURL_Context *ctx;

  /**
   * The callback to pass the backend response to
   */
  ANASTASIS_TruthStoreCallback cb;

  /**
   * Closure for @e cb.
   */
  void *cb_cls;

  /**
   * Reference to data (for cleanup).
   */
  char *data;

  /**
   * Payment URI we received from the service, or NULL.
   */
  char *pay_uri;
};


void
ANASTASIS_truth_store_cancel (
  struct ANASTASIS_TruthStoreOperation *tso)
{
  if (NULL != tso->job)
  {
    GNUNET_CURL_job_cancel (tso->job);
    tso->job = NULL;
  }
  GNUNET_free (tso->pay_uri);
  GNUNET_free (tso->url);
  GNUNET_free (tso->data);
  GNUNET_free (tso);
}


/**
 * Callback to process POST /truth response
 *
 * @param cls the `struct ANASTASIS_TruthStoreOperation`
 * @param response_code HTTP response code, 0 on error
 * @param data
 * @param data_size
 */
static void
handle_truth_store_finished (void *cls,
                             long response_code,
                             const void *data,
                             size_t data_size)
{
  struct ANASTASIS_TruthStoreOperation *tso = cls;
  struct ANASTASIS_UploadDetails ud;

  tso->job = NULL;
  memset (&ud, 0, sizeof (ud));
  ud.http_status = response_code;
  ud.ec = TALER_EC_NONE;
  switch (response_code)
  {
  case 0:
    break;
  case MHD_HTTP_NO_CONTENT:
    ud.us = ANASTASIS_US_SUCCESS;
    break;
  case MHD_HTTP_NOT_MODIFIED:
    ud.us = ANASTASIS_US_SUCCESS;
    break;
  case MHD_HTTP_BAD_REQUEST:
    GNUNET_break (0);
    ud.ec = TALER_JSON_get_error_code2 (data,
                                        data_size);
    break;
  case MHD_HTTP_PAYMENT_REQUIRED:
    {
      struct TALER_MERCHANT_PayUriData pd;

      if ( (NULL == tso->pay_uri) ||
           (GNUNET_OK !=
            TALER_MERCHANT_parse_pay_uri (tso->pay_uri,
                                          &pd)) )
      {
        GNUNET_break_op (0);
        ud.ec = TALER_EC_ANASTASIS_GENERIC_INVALID_PAYMENT_REQUEST;
        break;
      }
      if (GNUNET_OK !=
          GNUNET_STRINGS_string_to_data (
            pd.order_id,
            strlen (pd.order_id),
            &ud.details.payment.ps,
            sizeof (ud.details.payment.ps)))
      {
        GNUNET_break (0);
        ud.ec = TALER_EC_ANASTASIS_GENERIC_INVALID_PAYMENT_REQUEST;
        TALER_MERCHANT_parse_pay_uri_free (&pd);
        break;
      }
      TALER_MERCHANT_parse_pay_uri_free (&pd);
    }
    ud.us = ANASTASIS_US_PAYMENT_REQUIRED;
    ud.details.payment.payment_request = tso->pay_uri;
    break;
  case MHD_HTTP_CONFLICT:
    ud.us = ANASTASIS_US_CONFLICTING_TRUTH;
    break;
  case MHD_HTTP_LENGTH_REQUIRED:
    GNUNET_break (0);
    break;
  case MHD_HTTP_REQUEST_ENTITY_TOO_LARGE:
    ud.ec = TALER_JSON_get_error_code2 (data,
                                        data_size);
    break;
  case MHD_HTTP_TOO_MANY_REQUESTS:
    ud.ec = TALER_JSON_get_error_code2 (data,
                                        data_size);
    break;
  case MHD_HTTP_INTERNAL_SERVER_ERROR:
    ud.ec = TALER_JSON_get_error_code2 (data,
                                        data_size);
    break;
  default:
    GNUNET_break (0);
    ud.ec = TALER_JSON_get_error_code2 (data,
                                        data_size);
    break;
  }
  tso->cb (tso->cb_cls,
           &ud);
  tso->cb = NULL;
  ANASTASIS_truth_store_cancel (tso);
}


/**
 * Handle HTTP header received by curl.
 *
 * @param buffer one line of HTTP header data
 * @param size size of an item
 * @param nitems number of items passed
 * @param userdata our `struct ANASTASIS_StorePolicyOperation *`
 * @return `size * nitems`
 */
static size_t
handle_header (char *buffer,
               size_t size,
               size_t nitems,
               void *userdata)
{
  struct ANASTASIS_TruthStoreOperation *tso = userdata;
  size_t total = size * nitems;
  char *ndup;
  const char *hdr_type;
  char *hdr_val;
  char *sp;

  ndup = GNUNET_strndup (buffer,
                         total);
  hdr_type = strtok_r (ndup,
                       ":",
                       &sp);
  if (NULL == hdr_type)
  {
    GNUNET_free (ndup);
    return total;
  }
  hdr_val = strtok_r (NULL,
                      "",
                      &sp);
  if (NULL == hdr_val)
  {
    GNUNET_free (ndup);
    return total;
  }
  if (' ' == *hdr_val)
    hdr_val++;
  if (0 == strcasecmp (hdr_type,
                       ANASTASIS_HTTP_HEADER_TALER))
  {
    size_t len;

    /* found payment URI we care about! */
    tso->pay_uri = GNUNET_strdup (hdr_val);
    len = strlen (tso->pay_uri);
    while ( (len > 0) &&
            ( ('\n' == tso->pay_uri[len - 1]) ||
              ('\r' == tso->pay_uri[len - 1]) ) )
    {
      len--;
      tso->pay_uri[len] = '\0';
    }
  }
  GNUNET_free (ndup);
  return total;
}


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
  void *cb_cls)
{
  struct ANASTASIS_TruthStoreOperation *tso;
  CURL *eh;
  char *json_str;
  unsigned long long tms;

  tms = (unsigned long long) (payment_timeout.rel_value_us
                              / GNUNET_TIME_UNIT_MILLISECONDS.rel_value_us);
  tso = GNUNET_new (struct ANASTASIS_TruthStoreOperation);
  {
    char *uuid_str;
    char *path;
    char timeout_ms[32];

    GNUNET_snprintf (timeout_ms,
                     sizeof (timeout_ms),
                     "%llu",
                     tms);
    uuid_str = GNUNET_STRINGS_data_to_string_alloc (uuid,
                                                    sizeof (*uuid));
    GNUNET_asprintf (&path,
                     "truth/%s",
                     uuid_str);
    tso->url = TALER_url_join (backend_url,
                               path,
                               "timeout_ms",
                               (0 != payment_timeout.rel_value_us)
                               ? timeout_ms
                               : NULL,
                               NULL);
    GNUNET_free (path);
    GNUNET_free (uuid_str);
  }
  {
    json_t *truth_data;

    truth_data = GNUNET_JSON_PACK (
      GNUNET_JSON_pack_data_auto ("keyshare_data",
                                  encrypted_keyshare),
      GNUNET_JSON_pack_string ("type",
                               type),
      GNUNET_JSON_pack_data_varsize ("encrypted_truth",
                                     encrypted_truth,
                                     encrypted_truth_size),
      GNUNET_JSON_pack_allow_null (
        GNUNET_JSON_pack_string ("truth_mime",
                                 truth_mime)),
      GNUNET_JSON_pack_uint64 ("storage_duration_years",
                               payment_years_requested));
    json_str = json_dumps (truth_data,
                           JSON_COMPACT);
    GNUNET_assert (NULL != json_str);
    json_decref (truth_data);
  }
  tso->ctx = ctx;
  tso->data = json_str;
  tso->cb = cb;
  tso->cb_cls = cb_cls;
  eh = ANASTASIS_curl_easy_get_ (tso->url);
  if (0 != tms)
    GNUNET_assert (CURLE_OK ==
                   curl_easy_setopt (eh,
                                     CURLOPT_TIMEOUT_MS,
                                     (long) (tms + 5000)));
  GNUNET_assert (CURLE_OK ==
                 curl_easy_setopt (eh,
                                   CURLOPT_POSTFIELDS,
                                   json_str));
  GNUNET_assert (CURLE_OK ==
                 curl_easy_setopt (eh,
                                   CURLOPT_POSTFIELDSIZE,
                                   strlen (json_str)));
  GNUNET_assert (CURLE_OK ==
                 curl_easy_setopt (eh,
                                   CURLOPT_HEADERFUNCTION,
                                   &handle_header));
  GNUNET_assert (CURLE_OK ==
                 curl_easy_setopt (eh,
                                   CURLOPT_HEADERDATA,
                                   tso));
  tso->job = GNUNET_CURL_job_add_raw (ctx,
                                      eh,
                                      NULL,
                                      &handle_truth_store_finished,
                                      tso);
  return tso;
}
