/*
  This file is part of ANASTASIS
  Copyright (C) 2014-2021 Anastasis SARL

  ANASTASIS is free software; you can redistribute it and/or modify
  it under the terms of the GNU General Public License as
  published by the Free Software Foundation; either version 2.1,
  or (at your option) any later version.

  ANASTASIS is distributed in the hope that it will be useful, but
  WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public
  License along with ANASTASIS; see the file COPYING.LGPL.  If not,
  see <http://www.gnu.org/licenses/>
*/

/**
 * @file restclient/anastasis_api_policy_store.c
 * @brief Implementation of the /policy GET and POST
 * @author Christian Grothoff
 * @author Dennis Neufeld
 * @author Dominik Meister
 */
#include "platform.h"
#include <curl/curl.h>
#include <microhttpd.h> /* just for HTTP status codes */
#include "anastasis_service.h"
#include "anastasis_api_curl_defaults.h"
#include <taler/taler_signatures.h>
#include <taler/taler_merchant_service.h>
#include <taler/taler_json_lib.h>


struct ANASTASIS_PolicyStoreOperation
{
  /**
   * Complete URL where the backend offers /policy
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
  ANASTASIS_PolicyStoreCallback cb;

  /**
   * Closure for @e cb.
   */
  void *cb_cls;

  /**
   * Payment URI we received from the service, or NULL.
   */
  char *pay_uri;

  /**
   * Policy version we received from the service, or NULL.
   */
  char *policy_version;

  /**
   * Policy expiration we received from the service, or NULL.
   */
  char *policy_expiration;

  /**
   * Copy of the uploaded data. Needed by curl.
   */
  void *postcopy;

  /**
   * Hash of the data we are uploading.
   */
  struct GNUNET_HashCode new_upload_hash;
};


void
ANASTASIS_policy_store_cancel (
  struct ANASTASIS_PolicyStoreOperation *pso)
{
  if (NULL != pso->job)
  {
    GNUNET_CURL_job_cancel (pso->job);
    pso->job = NULL;
  }
  GNUNET_free (pso->policy_version);
  GNUNET_free (pso->policy_expiration);
  GNUNET_free (pso->pay_uri);
  GNUNET_free (pso->url);
  GNUNET_free (pso->postcopy);
  GNUNET_free (pso);
}


/**
 * Callback to process POST /policy response
 *
 * @param cls the `struct ANASTASIS_PolicyStoreOperation`
 * @param response_code HTTP response code, 0 on error
 * @param data response body
 * @param data_size number of bytes in @a data
 */
static void
handle_policy_store_finished (void *cls,
                              long response_code,
                              const void *data,
                              size_t data_size)
{
  struct ANASTASIS_PolicyStoreOperation *pso = cls;
  struct ANASTASIS_UploadDetails ud;

  pso->job = NULL;
  memset (&ud, 0, sizeof (ud));
  ud.http_status = response_code;
  ud.ec = TALER_EC_NONE;

  GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
              "Policy store finished with HTTP status %u\n",
              (unsigned int) response_code);
  switch (response_code)
  {
  case 0:
    ud.us = ANASTASIS_US_SERVER_ERROR;
    ud.ec = TALER_EC_GENERIC_INVALID_RESPONSE;
    break;
  case MHD_HTTP_NO_CONTENT:
  case MHD_HTTP_NOT_MODIFIED:
    {
      unsigned long long version;
      unsigned long long expiration;
      char dummy;

      if (1 != sscanf (pso->policy_version,
                       "%llu%c",
                       &version,
                       &dummy))
      {
        ud.ec = TALER_EC_GENERIC_REPLY_MALFORMED;
        ud.us = ANASTASIS_US_SERVER_ERROR;
        break;
      }
      if (1 != sscanf (pso->policy_expiration,
                       "%llu%c",
                       &expiration,
                       &dummy))
      {
        ud.ec = TALER_EC_GENERIC_REPLY_MALFORMED;
        ud.us = ANASTASIS_US_SERVER_ERROR;
        break;
      }
      ud.us = ANASTASIS_US_SUCCESS;
      ud.details.success.curr_backup_hash = &pso->new_upload_hash;
      ud.details.success.policy_expiration
        = GNUNET_TIME_absolute_add (
            GNUNET_TIME_UNIT_ZERO_ABS,
            GNUNET_TIME_relative_multiply (
              GNUNET_TIME_UNIT_SECONDS,
              expiration));
      ud.details.success.policy_version = version;
    }
    break;
  case MHD_HTTP_BAD_REQUEST:
    GNUNET_break (0);
    ud.us = ANASTASIS_US_CLIENT_ERROR;
    ud.ec = TALER_JSON_get_error_code2 (data,
                                        data_size);
    break;
  case MHD_HTTP_PAYMENT_REQUIRED:
    {
      struct TALER_MERCHANT_PayUriData pd;

      if ( (NULL == pso->pay_uri) ||
           (GNUNET_OK !=
            TALER_MERCHANT_parse_pay_uri (pso->pay_uri,
                                          &pd)) )
      {
        GNUNET_break_op (0);
        ud.ec = TALER_EC_ANASTASIS_GENERIC_INVALID_PAYMENT_REQUEST;
        break;
      }
      GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                  "Policy store operation requires payment `%s'\n",
                  pso->pay_uri);
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
    ud.details.payment.payment_request = pso->pay_uri;
    break;
  case MHD_HTTP_PAYLOAD_TOO_LARGE:
    ud.us = ANASTASIS_US_CLIENT_ERROR;
    ud.ec = TALER_EC_GENERIC_UPLOAD_EXCEEDS_LIMIT;
    break;
  case MHD_HTTP_LENGTH_REQUIRED:
    GNUNET_break (0);
    ud.ec = TALER_JSON_get_error_code2 (data,
                                        data_size);
    ud.us = ANASTASIS_US_SERVER_ERROR;
    break;
  case MHD_HTTP_INTERNAL_SERVER_ERROR:
    ud.ec = TALER_JSON_get_error_code2 (data,
                                        data_size);
    ud.us = ANASTASIS_US_SERVER_ERROR;
    break;
  case MHD_HTTP_BAD_GATEWAY:
    ud.ec = TALER_JSON_get_error_code2 (data,
                                        data_size);
    ud.us = ANASTASIS_US_SERVER_ERROR;
    break;
  default:
    ud.ec = TALER_JSON_get_error_code2 (data,
                                        data_size);
    ud.us = ANASTASIS_US_SERVER_ERROR;
    break;
  }
  pso->cb (pso->cb_cls,
           &ud);
  pso->cb = NULL;
  ANASTASIS_policy_store_cancel (pso);
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
  struct ANASTASIS_PolicyStoreOperation *pso = userdata;
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
                       "Taler"))
  {
    size_t len;

    /* found payment URI we care about! */
    GNUNET_free (pso->pay_uri); /* In case of duplicate header */
    pso->pay_uri = GNUNET_strdup (hdr_val);
    len = strlen (pso->pay_uri);
    while ( (len > 0) &&
            ( ('\n' == pso->pay_uri[len - 1]) ||
              ('\r' == pso->pay_uri[len - 1]) ) )
    {
      len--;
      pso->pay_uri[len] = '\0';
    }
  }

  if (0 == strcasecmp (hdr_type,
                       ANASTASIS_HTTP_HEADER_POLICY_VERSION))
  {
    size_t len;

    /* found policy version we care about! */
    GNUNET_free (pso->policy_version); /* In case of duplicate header */
    pso->policy_version = GNUNET_strdup (hdr_val);
    len = strlen (pso->policy_version);
    while ( (len > 0) &&
            ( ('\n' == pso->policy_version[len - 1]) ||
              ('\r' == pso->policy_version[len - 1]) ) )
    {
      len--;
      pso->policy_version[len] = '\0';
    }
  }

  if (0 == strcasecmp (hdr_type,
                       ANASTASIS_HTTP_HEADER_POLICY_EXPIRATION))
  {
    size_t len;

    /* found policy expiration we care about! */
    GNUNET_free (pso->policy_expiration); /* In case of duplicate header */
    pso->policy_expiration = GNUNET_strdup (hdr_val);
    len = strlen (pso->policy_expiration);
    while ( (len > 0) &&
            ( ('\n' == pso->policy_expiration[len - 1]) ||
              ('\r' == pso->policy_expiration[len - 1]) ) )
    {
      len--;
      pso->policy_expiration[len] = '\0';
    }
  }

  GNUNET_free (ndup);
  return total;
}


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
  void *cb_cls)
{
  struct ANASTASIS_PolicyStoreOperation *pso;
  struct ANASTASIS_AccountSignatureP account_sig;
  unsigned long long tms;
  CURL *eh;
  struct curl_slist *job_headers;
  struct ANASTASIS_UploadSignaturePS usp = {
    .purpose.purpose = htonl (TALER_SIGNATURE_ANASTASIS_POLICY_UPLOAD),
    .purpose.size = htonl (sizeof (usp))
  };

  tms = (unsigned long long) (payment_timeout.rel_value_us
                              / GNUNET_TIME_UNIT_MILLISECONDS.rel_value_us);
  GNUNET_CRYPTO_hash (recovery_data,
                      recovery_data_size,
                      &usp.new_recovery_data_hash);
  GNUNET_CRYPTO_eddsa_sign (&anastasis_priv->priv,
                            &usp,
                            &account_sig.eddsa_sig);
  /* setup our HTTP headers */
  job_headers = NULL;
  {
    struct curl_slist *ext;
    char *val;
    char *hdr;

    /* Set Anastasis-Policy-Signature header */
    val = GNUNET_STRINGS_data_to_string_alloc (&account_sig,
                                               sizeof (account_sig));
    GNUNET_asprintf (&hdr,
                     "%s: %s",
                     ANASTASIS_HTTP_HEADER_POLICY_SIGNATURE,
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

    /* set Etag header */
    val = GNUNET_STRINGS_data_to_string_alloc (&usp.new_recovery_data_hash,
                                               sizeof (struct GNUNET_HashCode));
    GNUNET_asprintf (&hdr,
                     "%s: %s",
                     MHD_HTTP_HEADER_IF_NONE_MATCH,
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
      GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                  "Beginning policy store operation with payment secret `%s'\n",
                  paid_order_id);
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
    else
    {
      GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                  "Beginning policy store operation without payment secret\n");
    }
  }
  /* Finished setting up headers */
  pso = GNUNET_new (struct ANASTASIS_PolicyStoreOperation);
  pso->postcopy = GNUNET_memdup (recovery_data,
                                 recovery_data_size);
  pso->new_upload_hash = usp.new_recovery_data_hash;
  {
    char *acc_pub_str;
    char *path;
    struct ANASTASIS_CRYPTO_AccountPublicKeyP pub;
    char timeout_ms[32];
    char pyrs[32];

    GNUNET_snprintf (timeout_ms,
                     sizeof (timeout_ms),
                     "%llu",
                     tms);
    GNUNET_snprintf (pyrs,
                     sizeof (pyrs),
                     "%u",
                     (unsigned int) payment_years_requested);
    GNUNET_CRYPTO_eddsa_key_get_public (&anastasis_priv->priv,
                                        &pub.pub);
    acc_pub_str
      = GNUNET_STRINGS_data_to_string_alloc (&pub,
                                             sizeof (pub));
    GNUNET_asprintf (&path,
                     "policy/%s",
                     acc_pub_str);
    GNUNET_free (acc_pub_str);
    pso->url = TALER_url_join (backend_url,
                               path,
                               "storage_duration",
                               (0 != payment_years_requested)
                               ? pyrs
                               : NULL,
                               "timeout_ms",
                               (0 != payment_timeout.rel_value_us)
                               ? timeout_ms
                               : NULL,
                               NULL);
    GNUNET_free (path);
  }
  pso->ctx = ctx;
  pso->cb = cb;
  pso->cb_cls = cb_cls;
  eh = ANASTASIS_curl_easy_get_ (pso->url);
  if (0 != tms)
    GNUNET_assert (CURLE_OK ==
                   curl_easy_setopt (eh,
                                     CURLOPT_TIMEOUT_MS,
                                     (long) (tms + 5000)));
  GNUNET_assert (CURLE_OK ==
                 curl_easy_setopt (eh,
                                   CURLOPT_POSTFIELDS,
                                   pso->postcopy));
  GNUNET_assert (CURLE_OK ==
                 curl_easy_setopt (eh,
                                   CURLOPT_POSTFIELDSIZE,
                                   (long) recovery_data_size));
  GNUNET_assert (CURLE_OK ==
                 curl_easy_setopt (eh,
                                   CURLOPT_HEADERFUNCTION,
                                   &handle_header));
  GNUNET_assert (CURLE_OK ==
                 curl_easy_setopt (eh,
                                   CURLOPT_HEADERDATA,
                                   pso));
  pso->job = GNUNET_CURL_job_add_raw (ctx,
                                      eh,
                                      job_headers,
                                      &handle_policy_store_finished,
                                      pso);
  curl_slist_free_all (job_headers);
  return pso;
}
