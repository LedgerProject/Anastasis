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
 * @file restclient/anastasis_api_keyshare_lookup.c
 * @brief Implementation of the GET /truth client
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


/**
 * @brief A Contract Operation Handle
 */
struct ANASTASIS_KeyShareLookupOperation
{
  /**
   * The url for this request, including parameters.
   */
  char *url;

  /**
   * The url for this request, without response parameter.
   */
  char *display_url;

  /**
   * Handle for the request.
   */
  struct GNUNET_CURL_Job *job;

  /**
   * Function to call with the result.
   */
  ANASTASIS_KeyShareLookupCallback cb;

  /**
   * Closure for @a cb.
   */
  void *cb_cls;

  /**
   * Reference to the execution context.
   */
  struct GNUNET_CURL_Context *ctx;

  /**
   * Identification of the Truth Object
   */
  const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_public_key;

  /**
   * Key to decrypt the truth on the server
   */
  const struct ANASTASIS_CRYPTO_TruthKeyP *truth_key;

  /**
   * Hash of the response (security question)
   */
  const struct GNUNET_HashCode *hashed_answer;

  /**
   * Payment URI we received from the service, or NULL.
   */
  char *pay_uri;

  /**
   * Location URI we received from the service, or NULL.
   */
  char *location;

  /**
   * Content type of the body.
   */
  char *content_type;
};


void
ANASTASIS_keyshare_lookup_cancel (
  struct ANASTASIS_KeyShareLookupOperation *kslo)
{
  if (NULL != kslo->job)
  {
    GNUNET_CURL_job_cancel (kslo->job);
    kslo->job = NULL;
  }
  GNUNET_free (kslo->location);
  GNUNET_free (kslo->pay_uri);
  GNUNET_free (kslo->display_url);
  GNUNET_free (kslo->url);
  GNUNET_free (kslo->content_type);
  GNUNET_free (kslo);
}


/**
 * Process GET /truth response
 *
 * @param cls our `struct ANASTASIS_KeyShareLookupOperation *`
 * @param response_code the HTTP status
 * @param data the body of the response
 * @param data_size number of bytes in @a data
 */
static void
handle_keyshare_lookup_finished (void *cls,
                                 long response_code,
                                 const void *data,
                                 size_t data_size)
{
  struct ANASTASIS_KeyShareLookupOperation *kslo = cls;
  struct ANASTASIS_KeyShareDownloadDetails kdd;

  kslo->job = NULL;
  memset (&kdd,
          0,
          sizeof (kdd));
  kdd.server_url = kslo->display_url;
  switch (response_code)
  {
  case 0:
    /* Hard error */
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Backend didn't even return from GET /truth\n");
    kdd.status = ANASTASIS_KSD_SERVER_ERROR;
    kdd.details.server_failure.ec = TALER_EC_GENERIC_INVALID_RESPONSE;
    break;
  case MHD_HTTP_OK:
    if (sizeof (struct ANASTASIS_CRYPTO_EncryptedKeyShareP) != data_size)
    {
      GNUNET_break_op (0);
      kdd.status = ANASTASIS_KSD_SERVER_ERROR;
      kdd.details.server_failure.http_status = MHD_HTTP_OK;
      kdd.details.server_failure.ec = TALER_EC_GENERIC_INVALID_RESPONSE;
      break;
    }
    /* Success, call callback with all details! */
    memcpy (&kdd.details.eks,
            data,
            data_size);
    break;
  case MHD_HTTP_ACCEPTED:
    kdd.details.external_challenge = json_loadb (data,
                                                 data_size,
                                                 JSON_REJECT_DUPLICATES,
                                                 NULL);
    if (NULL == kdd.details.external_challenge)
    {
      GNUNET_break_op (0);
      kdd.status = ANASTASIS_KSD_SERVER_ERROR;
      kdd.details.server_failure.http_status = MHD_HTTP_ACCEPTED;
      kdd.details.server_failure.ec = TALER_EC_GENERIC_INVALID_RESPONSE;
      break;
    }
    kdd.status = ANASTASIS_KSD_EXTERNAL_CHALLENGE_INSTRUCTIONS;
    break;
  case MHD_HTTP_BAD_REQUEST:
    /* This should never happen, either us or the anastasis server is buggy
       (or API version conflict); just pass JSON reply to the application */
    GNUNET_break (0);
    kdd.status = ANASTASIS_KSD_CLIENT_FAILURE;
    kdd.details.server_failure.http_status = MHD_HTTP_BAD_REQUEST;
    kdd.details.server_failure.ec = TALER_EC_GENERIC_JSON_INVALID;
    break;
  case MHD_HTTP_PAYMENT_REQUIRED:
    {
      struct TALER_MERCHANT_PayUriData pd;

      if ( (NULL == kslo->pay_uri) ||
           (GNUNET_OK !=
            TALER_MERCHANT_parse_pay_uri (kslo->pay_uri,
                                          &pd)) )
      {
        GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                    "Failed to parse `%s'\n",
                    kslo->pay_uri);
        kdd.status = ANASTASIS_KSD_SERVER_ERROR;
        kdd.details.server_failure.http_status = MHD_HTTP_PAYMENT_REQUIRED;
        kdd.details.server_failure.ec = TALER_EC_GENERIC_REPLY_MALFORMED;
        break;
      }
      if (GNUNET_OK !=
          GNUNET_STRINGS_string_to_data (
            pd.order_id,
            strlen (pd.order_id),
            &kdd.details.payment_required.payment_secret,
            sizeof (kdd.details.payment_required.payment_secret)))
      {
        GNUNET_break (0);
        kdd.status = ANASTASIS_KSD_SERVER_ERROR;
        kdd.details.server_failure.http_status = MHD_HTTP_PAYMENT_REQUIRED;
        kdd.details.server_failure.ec = TALER_EC_GENERIC_REPLY_MALFORMED;
        TALER_MERCHANT_parse_pay_uri_free (&pd);
        break;
      }
      kdd.status = ANASTASIS_KSD_PAYMENT_REQUIRED;
      kdd.details.payment_required.taler_pay_uri = kslo->pay_uri;
      kslo->cb (kslo->cb_cls,
                &kdd);
      ANASTASIS_keyshare_lookup_cancel (kslo);
      TALER_MERCHANT_parse_pay_uri_free (&pd);
      return;
    }
    break;
  case MHD_HTTP_SEE_OTHER:
    /* Nothing really to verify, authentication required/failed */
    kdd.status = ANASTASIS_KSD_REDIRECT_FOR_AUTHENTICATION;
    kdd.details.redirect_url = kslo->location;
    break;
  case MHD_HTTP_ALREADY_REPORTED:
  case MHD_HTTP_FORBIDDEN:
    /* Nothing really to verify, authentication required/failed */
    kdd.status = ANASTASIS_KSD_INVALID_ANSWER;
    kdd.details.open_challenge.body = data;
    kdd.details.open_challenge.body_size = data_size;
    kdd.details.open_challenge.content_type = kslo->content_type;
    kdd.details.open_challenge.http_status = response_code;
    break;
  case MHD_HTTP_NOT_FOUND:
    /* Nothing really to verify */
    kdd.status = ANASTASIS_KSD_TRUTH_UNKNOWN;
    break;
  case MHD_HTTP_REQUEST_TIMEOUT:
    /* Nothing really to verify */
    kdd.status = ANASTASIS_KSD_AUTHENTICATION_TIMEOUT;
    break;
  case MHD_HTTP_GONE:
    /* Nothing really to verify */
    kdd.status = ANASTASIS_KSD_TRUTH_UNKNOWN;
    break;
  case MHD_HTTP_EXPECTATION_FAILED:
    /* Nothing really to verify */
    kdd.status = ANASTASIS_KSD_CLIENT_FAILURE;
    kdd.details.server_failure.http_status = MHD_HTTP_EXPECTATION_FAILED;
    kdd.details.server_failure.ec = TALER_JSON_get_error_code2 (data,
                                                                data_size);
    break;
  case MHD_HTTP_TOO_MANY_REQUESTS:
    kdd.status = ANASTASIS_KSD_RATE_LIMIT_EXCEEDED;
    break;
  case MHD_HTTP_INTERNAL_SERVER_ERROR:
    /* Server had an internal issue; we should retry, but this API
       leaves this to the application */
    kdd.status = ANASTASIS_KSD_SERVER_ERROR;
    kdd.details.server_failure.ec = TALER_JSON_get_error_code2 (data,
                                                                data_size);
    kdd.details.server_failure.http_status = response_code;
    break;
  case MHD_HTTP_BAD_GATEWAY:
    kdd.status = ANASTASIS_KSD_SERVER_ERROR;
    kdd.details.server_failure.ec = TALER_JSON_get_error_code2 (data,
                                                                data_size);
    kdd.details.server_failure.http_status = response_code;
    break;
  default:
    /* unexpected response code */
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Unexpected response code %u to GET /truth\n",
                (unsigned int) response_code);
    GNUNET_break (0);
    kdd.status = ANASTASIS_KSD_SERVER_ERROR;
    kdd.details.server_failure.ec = TALER_JSON_get_error_code2 (data,
                                                                data_size);
    kdd.details.server_failure.http_status = response_code;
    break;
  }
  kslo->cb (kslo->cb_cls,
            &kdd);
  ANASTASIS_keyshare_lookup_cancel (kslo);
}


/**
 * Patch value in @a val, replacing new line with '\0'.
 *
 * @param[in,out] val 0-terminated string to replace '\\n' and '\\r' with '\\0' in.
 */
static void
patch_value (char *val)
{
  size_t len;

  /* found location URI we care about! */
  len = strlen (val);
  while ( (len > 0) &&
          ( ('\n' == val[len - 1]) ||
            ('\r' == val[len - 1]) ) )
  {
    len--;
    val[len] = '\0';
  }
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
  struct ANASTASIS_KeyShareLookupOperation *kslo = userdata;
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
    /* found payment URI we care about! */
    GNUNET_free (kslo->pay_uri);
    kslo->pay_uri = GNUNET_strdup (hdr_val);
    patch_value (kslo->pay_uri);
  }
  if (0 == strcasecmp (hdr_type,
                       MHD_HTTP_HEADER_LOCATION))
  {
    /* found location URI we care about! */
    GNUNET_free (kslo->location);
    kslo->location = GNUNET_strdup (hdr_val);
    patch_value (kslo->location);
  }
  if (0 == strcasecmp (hdr_type,
                       MHD_HTTP_HEADER_CONTENT_TYPE))
  {
    /* found location URI we care about! */
    GNUNET_free (kslo->content_type);
    kslo->content_type = GNUNET_strdup (hdr_val);
    patch_value (kslo->content_type);
  }
  GNUNET_free (ndup);
  return total;
}


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
  void *cb_cls)
{
  struct ANASTASIS_KeyShareLookupOperation *kslo;
  CURL *eh;
  struct curl_slist *job_headers;
  char *path;
  char *answer_s;
  unsigned long long tms;

  tms = (unsigned long long) (timeout.rel_value_us
                              / GNUNET_TIME_UNIT_MILLISECONDS.rel_value_us);
  job_headers = NULL;
  {
    struct curl_slist *ext;
    char *val;
    char *hdr;

    /* Set Truth-Decryption-Key header */
    val = GNUNET_STRINGS_data_to_string_alloc (truth_key,
                                               sizeof (*truth_key));
    GNUNET_asprintf (&hdr,
                     "%s: %s",
                     ANASTASIS_HTTP_HEADER_TRUTH_DECRYPTION_KEY,
                     val);
    GNUNET_free (val);
    ext = curl_slist_append (job_headers,
                             hdr);
    GNUNET_free (hdr);
    if (NULL == ext)
    {
      GNUNET_break (0);
      curl_slist_free_all (job_headers);
      return NULL;
    }
    job_headers = ext;

    /* Setup Payment-Identifier header */
    if (NULL != payment_secret)
    {
      char *paid_order_id;

      paid_order_id = GNUNET_STRINGS_data_to_string_alloc (
        payment_secret,
        sizeof (*payment_secret));
      GNUNET_asprintf (&hdr,
                       "%s: %s",
                       ANASTASIS_HTTP_HEADER_PAYMENT_IDENTIFIER,
                       paid_order_id);
      GNUNET_free (paid_order_id);
      ext = curl_slist_append (job_headers,
                               hdr);
      GNUNET_free (hdr);
      if (NULL == ext)
      {
        GNUNET_break (0);
        curl_slist_free_all (job_headers);
        return NULL;
      }
      job_headers = ext;
    }
  }
  kslo = GNUNET_new (struct ANASTASIS_KeyShareLookupOperation);
  kslo->ctx = ctx;
  kslo->truth_key = truth_key;
  {
    char *uuid_str;

    uuid_str = GNUNET_STRINGS_data_to_string_alloc (truth_uuid,
                                                    sizeof (*truth_uuid));
    GNUNET_asprintf (&path,
                     "truth/%s",
                     uuid_str);
    GNUNET_free (uuid_str);
  }
  {
    char timeout_ms[32];

    GNUNET_snprintf (timeout_ms,
                     sizeof (timeout_ms),
                     "%llu",
                     tms);
    if (NULL != hashed_answer)
    {
      answer_s = GNUNET_STRINGS_data_to_string_alloc (hashed_answer,
                                                      sizeof (*hashed_answer));
      GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                  "Querying challenge with existing response code\n");
      kslo->url = TALER_url_join (backend_url,
                                  path,
                                  "response",
                                  answer_s,
                                  "timeout_ms",
                                  (0 != timeout.rel_value_us)
                                ? timeout_ms
                                : NULL,
                                  NULL);
      GNUNET_free (answer_s);
    }
    else
    {
      GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                  "Querying challenge without response code\n");
      kslo->url = TALER_url_join (backend_url,
                                  path,
                                  "timeout_ms",
                                  (0 != timeout.rel_value_us)
                                ? timeout_ms
                                : NULL,
                                  NULL);
    }
  }
  kslo->display_url = TALER_url_join (backend_url,
                                      path,
                                      NULL);
  GNUNET_free (path);
  eh = ANASTASIS_curl_easy_get_ (kslo->url);
  if (0 != tms)
    GNUNET_assert (CURLE_OK ==
                   curl_easy_setopt (eh,
                                     CURLOPT_TIMEOUT_MS,
                                     (long) (tms + 5000)));
  GNUNET_assert (CURLE_OK ==
                 curl_easy_setopt (eh,
                                   CURLOPT_HEADERFUNCTION,
                                   &handle_header));
  GNUNET_assert (CURLE_OK ==
                 curl_easy_setopt (eh,
                                   CURLOPT_HEADERDATA,
                                   kslo));
  kslo->cb = cb;
  kslo->cb_cls = cb_cls;
  kslo->job = GNUNET_CURL_job_add_raw (ctx,
                                       eh,
                                       job_headers,
                                       &handle_keyshare_lookup_finished,
                                       kslo);
  curl_slist_free_all (job_headers);
  return kslo;
}


/* end of anastasis_api_keyshare_lookup.c */
