/*
  This file is part of ANASTASIS
  Copyright (C) 2014-2019 Anastasis SARL

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
 * @file restclient/anastasis_api_policy_lookup.c
 * @brief Implementation of the /policy GET and POST
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
#include <taler/taler_signatures.h>


/**
 * @brief A Contract Operation Handle
 */
struct ANASTASIS_PolicyLookupOperation
{

  /**
   * The url for this request, including parameters.
   */
  char *url;

  /**
   * Handle for the request.
   */
  struct GNUNET_CURL_Job *job;

  /**
   * Function to call with the result.
   */
  ANASTASIS_PolicyLookupCallback cb;

  /**
   * Closure for @a cb.
   */
  void *cb_cls;

  /**
   * Reference to the execution context.
   */
  struct GNUNET_CURL_Context *ctx;

  /**
   * Public key of the account we are downloading from.
   */
  struct ANASTASIS_CRYPTO_AccountPublicKeyP account_pub;

  /**
   * Signature returned in the #ANASTASIS_HTTP_HEADER_POLICY_SIGNATURE
   * header, or all zeros for none.
   */
  struct ANASTASIS_AccountSignatureP account_sig;

  /**
   * Version of the policy.
   */
  unsigned int version;

};


void
ANASTASIS_policy_lookup_cancel (struct ANASTASIS_PolicyLookupOperation *plo)
{
  if (NULL != plo->job)
  {
    GNUNET_CURL_job_cancel (plo->job);
    plo->job = NULL;
  }
  GNUNET_free (plo->url);
  GNUNET_free (plo);
}


/**
 * Process GET /policy response
 */
static void
handle_policy_lookup_finished (void *cls,
                               long response_code,
                               const void *data,
                               size_t data_size)
{
  struct ANASTASIS_PolicyLookupOperation *plo = cls;

  plo->job = NULL;
  switch (response_code)
  {
  case 0:
    /* Hard error */
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Backend didn't even return from GET /policy\n");
    break;
  case MHD_HTTP_OK:
    {
      struct ANASTASIS_DownloadDetails dd;
      struct ANASTASIS_UploadSignaturePS usp = {
        .purpose.purpose = htonl (TALER_SIGNATURE_ANASTASIS_POLICY_UPLOAD),
        .purpose.size = htonl (sizeof (usp)),
      };

      GNUNET_CRYPTO_hash (data,
                          data_size,
                          &usp.new_recovery_data_hash);
      if (GNUNET_OK !=
          GNUNET_CRYPTO_eddsa_verify (TALER_SIGNATURE_ANASTASIS_POLICY_UPLOAD,
                                      &usp,
                                      &plo->account_sig.eddsa_sig,
                                      &plo->account_pub.pub))
      {
        GNUNET_break_op (0);
        response_code = 0;
        break;
      }
      /* Success, call callback with all details! */
      memset (&dd, 0, sizeof (dd));
      dd.sig = plo->account_sig;
      dd.curr_policy_hash = usp.new_recovery_data_hash;
      dd.policy = data;
      dd.policy_size = data_size;
      dd.version = plo->version;
      plo->cb (plo->cb_cls,
               response_code,
               &dd);
      plo->cb = NULL;
      ANASTASIS_policy_lookup_cancel (plo);
      return;
    }
  case MHD_HTTP_BAD_REQUEST:
    /* This should never happen, either us or the anastasis server is buggy
       (or API version conflict); just pass JSON reply to the application */
    break;
  case MHD_HTTP_NOT_FOUND:
    /* Nothing really to verify */
    break;
  case MHD_HTTP_INTERNAL_SERVER_ERROR:
    /* Server had an internal issue; we should retry, but this API
       leaves this to the application */
    break;
  default:
    /* unexpected response code */
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Unexpected response code %u\n",
                (unsigned int) response_code);
    GNUNET_break (0);
    response_code = 0;
    break;
  }
  plo->cb (plo->cb_cls,
           response_code,
           NULL);
  plo->cb = NULL;
  ANASTASIS_policy_lookup_cancel (plo);
}


/**
 * Handle HTTP header received by curl.
 *
 * @param buffer one line of HTTP header data
 * @param size size of an item
 * @param nitems number of items passed
 * @param userdata our `struct ANASTASIS_PolicyLookupOperation *`
 * @return `size * nitems`
 */
static size_t
handle_header (char *buffer,
               size_t size,
               size_t nitems,
               void *userdata)
{
  struct ANASTASIS_PolicyLookupOperation *plo = userdata;
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
                      "\n\r",
                      &sp);
  if (NULL == hdr_val)
  {
    GNUNET_free (ndup);
    return total;
  }
  if (' ' == *hdr_val)
    hdr_val++;
  if (0 == strcasecmp (hdr_type,
                       ANASTASIS_HTTP_HEADER_POLICY_SIGNATURE))
  {
    if (GNUNET_OK !=
        GNUNET_STRINGS_string_to_data (
          hdr_val,
          strlen (hdr_val),
          &plo->account_sig,
          sizeof (struct ANASTASIS_AccountSignatureP)))
    {
      GNUNET_break_op (0);
      GNUNET_free (ndup);
      return 0;
    }
  }
  if (0 == strcasecmp (hdr_type,
                       ANASTASIS_HTTP_HEADER_POLICY_VERSION))
  {
    char dummy;

    if (1 !=
        sscanf (hdr_val,
                "%u%c",
                &plo->version,
                &dummy))
    {
      GNUNET_break_op (0);
      GNUNET_free (ndup);
      return 0;
    }
  }
  GNUNET_free (ndup);
  return total;
}


struct ANASTASIS_PolicyLookupOperation *
ANASTASIS_policy_lookup (
  struct GNUNET_CURL_Context *ctx,
  const char *backend_url,
  const struct ANASTASIS_CRYPTO_AccountPublicKeyP *anastasis_pub,
  ANASTASIS_PolicyLookupCallback cb,
  void *cb_cls)
{
  struct ANASTASIS_PolicyLookupOperation *plo;
  CURL *eh;
  char *acc_pub_str;
  char *path;

  GNUNET_assert (NULL != cb);
  plo = GNUNET_new (struct ANASTASIS_PolicyLookupOperation);
  plo->account_pub = *anastasis_pub;
  acc_pub_str = GNUNET_STRINGS_data_to_string_alloc (anastasis_pub,
                                                     sizeof (*anastasis_pub));
  GNUNET_asprintf (&path,
                   "policy/%s",
                   acc_pub_str);
  GNUNET_free (acc_pub_str);
  plo->url = TALER_url_join (backend_url,
                             path,
                             NULL);
  GNUNET_free (path);
  eh = ANASTASIS_curl_easy_get_ (plo->url);
  GNUNET_assert (CURLE_OK ==
                 curl_easy_setopt (eh,
                                   CURLOPT_HEADERFUNCTION,
                                   &handle_header));
  GNUNET_assert (CURLE_OK ==
                 curl_easy_setopt (eh,
                                   CURLOPT_HEADERDATA,
                                   plo));
  plo->cb = cb;
  plo->cb_cls = cb_cls;
  plo->job = GNUNET_CURL_job_add_raw (ctx,
                                      eh,
                                      NULL,
                                      &handle_policy_lookup_finished,
                                      plo);
  return plo;
}


struct ANASTASIS_PolicyLookupOperation *
ANASTASIS_policy_lookup_version (
  struct GNUNET_CURL_Context *ctx,
  const char *backend_url,
  const struct ANASTASIS_CRYPTO_AccountPublicKeyP *anastasis_pub,
  ANASTASIS_PolicyLookupCallback cb,
  void *cb_cls,
  unsigned int version)
{
  struct ANASTASIS_PolicyLookupOperation *plo;
  CURL *eh;
  char *acc_pub_str;
  char *path;
  char version_s[14];

  GNUNET_assert (NULL != cb);
  plo = GNUNET_new (struct ANASTASIS_PolicyLookupOperation);
  plo->account_pub = *anastasis_pub;
  acc_pub_str = GNUNET_STRINGS_data_to_string_alloc (anastasis_pub,
                                                     sizeof (*anastasis_pub));
  GNUNET_asprintf (&path,
                   "policy/%s",
                   acc_pub_str);
  GNUNET_free (acc_pub_str);
  GNUNET_snprintf (version_s,
                   sizeof (version_s),
                   "%u",
                   version);
  plo->url = TALER_url_join (backend_url,
                             path,
                             "version",
                             version_s,
                             NULL);
  GNUNET_free (path);
  eh = ANASTASIS_curl_easy_get_ (plo->url);
  GNUNET_assert (CURLE_OK ==
                 curl_easy_setopt (eh,
                                   CURLOPT_HEADERFUNCTION,
                                   &handle_header));
  GNUNET_assert (CURLE_OK ==
                 curl_easy_setopt (eh,
                                   CURLOPT_HEADERDATA,
                                   plo));
  plo->cb = cb;
  plo->cb_cls = cb_cls;
  plo->job = GNUNET_CURL_job_add_raw (ctx,
                                      eh,
                                      NULL,
                                      &handle_policy_lookup_finished,
                                      plo);
  return plo;
}
