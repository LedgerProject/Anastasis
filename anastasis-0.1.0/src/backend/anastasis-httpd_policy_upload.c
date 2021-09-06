/*
  This file is part of Anastasis
  Copyright (C) 2021 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU Affero General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with
  Anastasis; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
*/
/**
 * @file anastasis-httpd_policy.c
 * @brief functions to handle incoming requests on /policy/
 * @author Dennis Neufeld
 * @author Dominik Meister
 * @author Christian Grothoff
 */
#include "platform.h"
#include "anastasis-httpd.h"
#include "anastasis-httpd_policy.h"
#include "anastasis_service.h"
#include <gnunet/gnunet_util_lib.h>
#include <gnunet/gnunet_rest_lib.h>
#include <taler/taler_json_lib.h>
#include <taler/taler_merchant_service.h>
#include <taler/taler_signatures.h>

/**
 * How long do we hold an HTTP client connection if
 * we are awaiting payment before giving up?
 */
#define CHECK_PAYMENT_GENERIC_TIMEOUT GNUNET_TIME_relative_multiply ( \
    GNUNET_TIME_UNIT_MINUTES, 30)


/**
 * Context for an upload operation.
 */
struct PolicyUploadContext
{

  /**
   * Signature of the account holder.
   */
  struct ANASTASIS_AccountSignatureP account_sig;

  /**
   * Public key of the account holder.
   */
  struct ANASTASIS_CRYPTO_AccountPublicKeyP account;

  /**
   * Hash of the upload we are receiving right now (as promised
   * by the client, to be verified!).
   */
  struct GNUNET_HashCode new_policy_upload_hash;

  /**
   * Hash context for the upload.
   */
  struct GNUNET_HashContext *hash_ctx;

  /**
   * Kept in DLL for shutdown handling while suspended.
   */
  struct PolicyUploadContext *next;

  /**
   * Kept in DLL for shutdown handling while suspended.
   */
  struct PolicyUploadContext *prev;

  /**
   * Used while suspended for resumption.
   */
  struct MHD_Connection *con;

  /**
   * Upload, with as many bytes as we have received so far.
   */
  char *upload;

  /**
   * Used while we are awaiting proposal creation.
   */
  struct TALER_MERCHANT_PostOrdersHandle *po;

  /**
   * Used while we are waiting payment.
   */
  struct TALER_MERCHANT_OrderMerchantGetHandle *cpo;

  /**
   * HTTP response code to use on resume, if non-NULL.
   */
  struct MHD_Response *resp;

  /**
   * Order under which the client promised payment, or NULL.
   */
  const char *order_id;

  /**
   * Payment Identifier
   */
  struct ANASTASIS_PaymentSecretP payment_identifier;

  /**
   * Timestamp of the order in @e payment_identifier. Used to
   * select the most recent unpaid offer.
   */
  struct GNUNET_TIME_Absolute existing_pi_timestamp;

  /**
   * When does the operation timeout?
   */
  struct GNUNET_TIME_Absolute timeout;

  /**
   * How long must the account be valid?  Determines whether we should
   * trigger payment, and if so how much.
   */
  struct GNUNET_TIME_Absolute end_date;

  /**
   * How long is the account already valid?
   * Determines how much the user needs to pay.
   */
  struct GNUNET_TIME_Absolute paid_until;

  /**
   * Expected total upload size.
   */
  size_t upload_size;

  /**
   * Current offset for the upload.
   */
  size_t upload_off;

  /**
   * HTTP response code to use on resume, if resp is set.
   */
  unsigned int response_code;

  /**
   * For how many years does the client still have
   * to pay?
   */
  unsigned int years_to_pay;

  /**
   * true if client provided a payment secret / order ID?
   */
  bool payment_identifier_provided;

};


/**
 * Kept in DLL for shutdown handling while suspended.
 */
static struct PolicyUploadContext *puc_head;

/**
 * Kept in DLL for shutdown handling while suspended.
 */
static struct PolicyUploadContext *puc_tail;


/**
 * Service is shutting down, resume all MHD connections NOW.
 */
void
AH_resume_all_bc ()
{
  struct PolicyUploadContext *puc;

  while (NULL != (puc = puc_head))
  {
    GNUNET_CONTAINER_DLL_remove (puc_head,
                                 puc_tail,
                                 puc);
    if (NULL != puc->po)
    {
      TALER_MERCHANT_orders_post_cancel (puc->po);
      puc->po = NULL;
    }
    if (NULL != puc->cpo)
    {
      TALER_MERCHANT_merchant_order_get_cancel (puc->cpo);
      puc->cpo = NULL;
    }
    MHD_resume_connection (puc->con);
  }
}


/**
 * Function called to clean up a backup context.
 *
 * @param hc a `struct PolicyUploadContext`
 */
static void
cleanup_ctx (struct TM_HandlerContext *hc)
{
  struct PolicyUploadContext *puc = hc->ctx;

  if (NULL != puc->po)
    TALER_MERCHANT_orders_post_cancel (puc->po);
  if (NULL != puc->cpo)
    TALER_MERCHANT_merchant_order_get_cancel (puc->cpo);
  if (NULL != puc->hash_ctx)
    GNUNET_CRYPTO_hash_context_abort (puc->hash_ctx);
  if (NULL != puc->resp)
    MHD_destroy_response (puc->resp);
  GNUNET_free (puc->upload);
  GNUNET_free (puc);
}


/**
 * Transmit a payment request for @a order_id on @a connection
 *
 * @param[in,out] puc details about the operation
 * @return #GNUNET_OK on success
 */
static int
make_payment_request (struct PolicyUploadContext *puc)
{
  struct MHD_Response *resp;

  /* request payment via Taler */
  resp = MHD_create_response_from_buffer (0,
                                          NULL,
                                          MHD_RESPMEM_PERSISTENT);
  if (NULL == resp)
  {
    GNUNET_break (0);
    return GNUNET_SYSERR;
  }
  TALER_MHD_add_global_headers (resp);
  {
    char *hdr;
    char *pfx;
    char *hn;

    if (0 == strncasecmp ("https://",
                          AH_backend_url,
                          strlen ("https://")))
    {
      pfx = "taler://";
      hn = &AH_backend_url[strlen ("https://")];
    }
    else if (0 == strncasecmp ("http://",
                               AH_backend_url,
                               strlen ("http://")))
    {
      pfx = "taler+http://";
      hn = &AH_backend_url[strlen ("http://")];
    }
    else
    {
      GNUNET_break (0);
      MHD_destroy_response (resp);
      return GNUNET_SYSERR;
    }
    if (0 == strlen (hn))
    {
      GNUNET_break (0);
      MHD_destroy_response (resp);
      return GNUNET_SYSERR;
    }
    {
      char *order_id;

      order_id = GNUNET_STRINGS_data_to_string_alloc (
        &puc->payment_identifier,
        sizeof (puc->payment_identifier));
      GNUNET_asprintf (&hdr,
                       "%spay/%s%s/",
                       pfx,
                       hn,
                       order_id);
      GNUNET_free (order_id);
    }
    GNUNET_break (MHD_YES ==
                  MHD_add_response_header (resp,
                                           ANASTASIS_HTTP_HEADER_TALER,
                                           hdr));
    GNUNET_free (hdr);
  }
  puc->resp = resp;
  puc->response_code = MHD_HTTP_PAYMENT_REQUIRED;
  return GNUNET_OK;
}


/**
 * Callbacks of this type are used to serve the result of submitting a
 * POST /private/orders request to a merchant.
 *
 * @param cls our `struct PolicyUploadContext`
 * @param por response details
 */
static void
proposal_cb (void *cls,
             const struct TALER_MERCHANT_PostOrdersReply *por)
{
  struct PolicyUploadContext *puc = cls;
  enum GNUNET_DB_QueryStatus qs;

  puc->po = NULL;
  GNUNET_CONTAINER_DLL_remove (puc_head,
                               puc_tail,
                               puc);
  MHD_resume_connection (puc->con);
  AH_trigger_daemon (NULL);
  if (MHD_HTTP_OK != por->hr.http_status)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                "Backend returned status %u/%d\n",
                por->hr.http_status,
                (int) por->hr.ec);
    GNUNET_break (0);
    puc->resp = TALER_MHD_MAKE_JSON_PACK (
      GNUNET_JSON_pack_uint64 ("code",
                               TALER_EC_SYNC_PAYMENT_CREATE_BACKEND_ERROR),
      GNUNET_JSON_pack_string ("hint",
                               "Failed to setup order with merchant backend"),
      GNUNET_JSON_pack_uint64 ("backend-ec",
                               por->hr.ec),
      GNUNET_JSON_pack_uint64 ("backend-http-status",
                               por->hr.http_status),
      GNUNET_JSON_pack_allow_null (
        GNUNET_JSON_pack_object_incref ("backend-reply",
                                        (json_t *) por->hr.reply)));
    puc->response_code = MHD_HTTP_INTERNAL_SERVER_ERROR;
    return;
  }
  GNUNET_log (GNUNET_ERROR_TYPE_INFO,
              "Storing payment request for order `%s'\n",
              por->details.ok.order_id);

  qs = db->record_recdoc_payment (db->cls,
                                  &puc->account,
                                  (uint32_t) AH_post_counter,
                                  &puc->payment_identifier,
                                  &AH_annual_fee);
  if (0 >= qs)
  {
    GNUNET_break (0);
    puc->resp = TALER_MHD_make_error (
      TALER_EC_GENERIC_DB_STORE_FAILED,
      "record recdoc payment");
    puc->response_code = MHD_HTTP_INTERNAL_SERVER_ERROR;
    return;
  }
  if (GNUNET_OK !=
      make_payment_request (puc))
  {
    GNUNET_break (0);
    puc->resp = TALER_MHD_make_error (
      TALER_EC_GENERIC_DB_STORE_FAILED,
      "failed to initiate payment");
    puc->response_code = MHD_HTTP_INTERNAL_SERVER_ERROR;
  }
}


/**
 * Callback to process a GET /check-payment request
 *
 * @param cls our `struct PolicyUploadContext`
 * @param hr HTTP response details
 * @param osr order status
 */
static void
check_payment_cb (void *cls,
                  const struct TALER_MERCHANT_HttpResponse *hr,
                  const struct TALER_MERCHANT_OrderStatusResponse *osr)
{
  struct PolicyUploadContext *puc = cls;

  /* refunds are not supported, verify */
  puc->cpo = NULL;
  GNUNET_CONTAINER_DLL_remove (puc_head,
                               puc_tail,
                               puc);
  MHD_resume_connection (puc->con);
  AH_trigger_daemon (NULL);
  switch (hr->http_status)
  {
  case MHD_HTTP_OK:
    GNUNET_assert (NULL != osr);
    break; /* processed below */
  case MHD_HTTP_UNAUTHORIZED:
    puc->resp = TALER_MHD_make_error (
      TALER_EC_ANASTASIS_GENERIC_PAYMENT_CHECK_UNAUTHORIZED,
      NULL);
    puc->response_code = MHD_HTTP_INTERNAL_SERVER_ERROR;
    return;
  default:
    puc->resp = TALER_MHD_make_error (
      TALER_EC_ANASTASIS_GENERIC_BACKEND_ERROR,
      "failed to initiate payment");
    puc->response_code = MHD_HTTP_BAD_GATEWAY;
    return;
  }
  GNUNET_log (GNUNET_ERROR_TYPE_INFO,
              "Payment status checked: %s\n",
              osr->status ? "paid" : "unpaid");
  switch (osr->status)
  {
  case TALER_MERCHANT_OSC_PAID:
    {
      enum GNUNET_DB_QueryStatus qs;
      unsigned int years;
      struct GNUNET_TIME_Relative paid_until;
      const json_t *contract;
      struct TALER_Amount amount;
      struct GNUNET_JSON_Specification cspec[] = {
        TALER_JSON_spec_amount ("amount",
                                AH_currency,
                                &amount),
        GNUNET_JSON_spec_end ()
      };

      contract = osr->details.paid.contract_terms;
      if (GNUNET_OK !=
          GNUNET_JSON_parse (contract,
                             cspec,
                             NULL, NULL))
      {
        GNUNET_break (0);
        puc->resp = TALER_MHD_make_error (
          TALER_EC_MERCHANT_GENERIC_DB_CONTRACT_CONTENT_INVALID,
          "no amount given");
        puc->response_code = MHD_HTTP_INTERNAL_SERVER_ERROR;
        return; /* continue as planned */
      }
      years = TALER_amount_divide2 (&amount,
                                    &AH_annual_fee);
      paid_until = GNUNET_TIME_relative_multiply (GNUNET_TIME_UNIT_YEARS,
                                                  years);
      /* add 1 week grace period, otherwise if a user
         wants to pay for 1 year, the first seconds
         would have passed between making the payment
         and our subsequent check if +1 year was
         paid... So we actually say 1 year = 52 weeks
         on the server, while the client calculates
         with 365 days. */
      paid_until = GNUNET_TIME_relative_add (paid_until,
                                             GNUNET_TIME_UNIT_WEEKS);

      qs = db->increment_lifetime (db->cls,
                                   &puc->account,
                                   &puc->payment_identifier,
                                   paid_until,
                                   &puc->paid_until);
      if (0 <= qs)
        return; /* continue as planned */
      GNUNET_break (0);
      puc->resp = TALER_MHD_make_error (
        TALER_EC_GENERIC_DB_FETCH_FAILED,
        "increment lifetime");
      puc->response_code = MHD_HTTP_INTERNAL_SERVER_ERROR;
      return; /* continue as planned */
    }
  case TALER_MERCHANT_OSC_UNPAID:
  case TALER_MERCHANT_OSC_CLAIMED:
    break;
  }
  if (0 != puc->existing_pi_timestamp.abs_value_us)
  {
    /* repeat payment request */
    GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                "Repeating payment request\n");
    if (GNUNET_OK !=
        make_payment_request (puc))
    {
      GNUNET_break (0);
      puc->resp = TALER_MHD_make_error (
        TALER_EC_GENERIC_DB_STORE_FAILED,
        "failed to initiate payment");
      puc->response_code = MHD_HTTP_INTERNAL_SERVER_ERROR;
    }
    return;
  }
  GNUNET_log (GNUNET_ERROR_TYPE_INFO,
              "Timeout waiting for payment\n");
  puc->resp = TALER_MHD_make_error (TALER_EC_SYNC_PAYMENT_GENERIC_TIMEOUT,
                                    "Timeout awaiting promised payment");
  GNUNET_assert (NULL != puc->resp);
  puc->response_code = MHD_HTTP_REQUEST_TIMEOUT;
}


/**
 * Helper function used to ask our backend to await
 * a payment for the user's account.
 *
 * @param puc context to begin payment for.
 */
static void
await_payment (struct PolicyUploadContext *puc)
{
  struct GNUNET_TIME_Relative timeout
    = GNUNET_TIME_absolute_get_remaining (puc->timeout);

  GNUNET_CONTAINER_DLL_insert (puc_head,
                               puc_tail,
                               puc);
  MHD_suspend_connection (puc->con);
  {
    char *order_id;

    order_id = GNUNET_STRINGS_data_to_string_alloc (
      &puc->payment_identifier,
      sizeof(struct ANASTASIS_PaymentSecretP));
    puc->cpo = TALER_MERCHANT_merchant_order_get (AH_ctx,
                                                  AH_backend_url,
                                                  order_id,
                                                  NULL /* our payments are NOT session-bound */,
                                                  false,
                                                  timeout,
                                                  &check_payment_cb,
                                                  puc);
    GNUNET_free (order_id);
  }
  AH_trigger_curl ();
}


/**
 * Helper function used to ask our backend to begin processing a
 * payment for the user's account.  May perform asynchronous
 * operations by suspending the connection if required.
 *
 * @param puc context to begin payment for.
 * @return MHD status code
 */
static MHD_RESULT
begin_payment (struct PolicyUploadContext *puc)
{
  json_t *order;

  GNUNET_CONTAINER_DLL_insert (puc_head,
                               puc_tail,
                               puc);
  GNUNET_log (GNUNET_ERROR_TYPE_INFO,
              "Suspending connection while creating order at `%s'\n",
              AH_backend_url);
  {
    char *order_id;
    struct TALER_Amount upload_fee;

    if (0 >
        TALER_amount_multiply (&upload_fee,
                               &AH_annual_fee,
                               puc->years_to_pay))
    {
      GNUNET_break_op (0);
      return TALER_MHD_reply_with_error (puc->con,
                                         MHD_HTTP_BAD_REQUEST,
                                         TALER_EC_GENERIC_PARAMETER_MALFORMED,
                                         "storage_duration_years");
    }

    order_id = GNUNET_STRINGS_data_to_string_alloc (
      &puc->payment_identifier,
      sizeof(struct ANASTASIS_PaymentSecretP));
    order = json_pack ("{s:o, s:s, s:[{s:s,s:I,s:s}], s:s }",
                       "amount", TALER_JSON_from_amount (&upload_fee),
                       "summary", "Anastasis policy storage fee",
                       "products",
                       "description", "policy storage fee",
                       "quantity", (json_int_t) puc->years_to_pay,
                       "unit", "years",
                       "order_id", order_id);
    GNUNET_free (order_id);
  }
  MHD_suspend_connection (puc->con);
  puc->po = TALER_MERCHANT_orders_post2 (AH_ctx,
                                         AH_backend_url,
                                         order,
                                         GNUNET_TIME_UNIT_ZERO,
                                         NULL, /* no payment target */
                                         0,
                                         NULL, /* no inventory products */
                                         0,
                                         NULL, /* no uuids */
                                         false, /* do NOT require claim token */
                                         &proposal_cb,
                                         puc);
  AH_trigger_curl ();
  json_decref (order);
  return MHD_YES;
}


/**
 * Prepare to receive a payment, possibly requesting it, or just waiting
 * for it to be completed by the client.
 *
 * @param puc context to prepare payment for
 * @return MHD status
 */
static MHD_RESULT
prepare_payment (struct PolicyUploadContext *puc)
{
  if (! puc->payment_identifier_provided)
  {
    GNUNET_CRYPTO_random_block (
      GNUNET_CRYPTO_QUALITY_NONCE,
      &puc->payment_identifier,
      sizeof (struct ANASTASIS_PaymentSecretP));
    puc->payment_identifier_provided = true;
    GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                "No payment identifier, initiating payment\n");
    return begin_payment (puc);
  }
  await_payment (puc);
  return MHD_YES;
}


MHD_RESULT
AH_handler_policy_post (
  struct MHD_Connection *connection,
  struct TM_HandlerContext *hc,
  const struct ANASTASIS_CRYPTO_AccountPublicKeyP *account_pub,
  const char *recovery_data,
  size_t *recovery_data_size)
{
  struct PolicyUploadContext *puc = hc->ctx;

  if (NULL == puc)
  {
    /* first call, setup internals */
    puc = GNUNET_new (struct PolicyUploadContext);
    hc->ctx = puc;
    hc->cc = &cleanup_ctx;
    puc->con = connection;

    {
      const char *pay_id;

      pay_id = MHD_lookup_connection_value (connection,
                                            MHD_HEADER_KIND,
                                            ANASTASIS_HTTP_HEADER_PAYMENT_IDENTIFIER);
      if (NULL != pay_id)
      {
        if (GNUNET_OK !=
            GNUNET_STRINGS_string_to_data (
              pay_id,
              strlen (pay_id),
              &puc->payment_identifier,
              sizeof (struct ANASTASIS_PaymentSecretP)))
        {
          GNUNET_break_op (0);
          return TALER_MHD_reply_with_error (connection,
                                             MHD_HTTP_BAD_REQUEST,
                                             TALER_EC_GENERIC_PARAMETER_MALFORMED,
                                             ANASTASIS_HTTP_HEADER_PAYMENT_IDENTIFIER
                                             " header must be a base32-encoded Payment-Secret");
        }
        puc->payment_identifier_provided = true;
        GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                    "Policy upload started with payment identifier `%s'\n",
                    pay_id);
      }
    }
    puc->account = *account_pub;
    /* now setup 'puc' */
    {
      const char *lens;
      unsigned long len;
      char dummy;

      lens = MHD_lookup_connection_value (connection,
                                          MHD_HEADER_KIND,
                                          MHD_HTTP_HEADER_CONTENT_LENGTH);
      if ( (NULL == lens) ||
           (1 != sscanf (lens,
                         "%lu%c",
                         &len,
                         &dummy)) )
      {
        GNUNET_break_op (0);
        return TALER_MHD_reply_with_error (
          connection,
          MHD_HTTP_BAD_REQUEST,
          (NULL == lens)
          ? TALER_EC_ANASTASIS_GENERIC_MISSING_CONTENT_LENGTH
          : TALER_EC_ANASTASIS_GENERIC_MALFORMED_CONTENT_LENGTH,
          NULL);
      }
      if (len / 1024 / 1024 >= AH_upload_limit_mb)
      {
        GNUNET_break_op (0);
        return TALER_MHD_reply_with_error (connection,
                                           MHD_HTTP_PAYLOAD_TOO_LARGE,
                                           TALER_EC_SYNC_MALFORMED_CONTENT_LENGTH,
                                           "Content-length value not acceptable");
      }
      puc->upload = GNUNET_malloc_large (len);
      if (NULL == puc->upload)
      {
        GNUNET_log_strerror (GNUNET_ERROR_TYPE_ERROR,
                             "malloc");
        return TALER_MHD_reply_with_error (connection,
                                           MHD_HTTP_PAYLOAD_TOO_LARGE,
                                           TALER_EC_ANASTASIS_POLICY_OUT_OF_MEMORY_ON_CONTENT_LENGTH,
                                           NULL);
      }
      puc->upload_size = (size_t) len;
    }
    {
      /* Check if header contains Anastasis-Policy-Signature */
      const char *sig_s;

      sig_s = MHD_lookup_connection_value (connection,
                                           MHD_HEADER_KIND,
                                           ANASTASIS_HTTP_HEADER_POLICY_SIGNATURE);
      if ( (NULL == sig_s) ||
           (GNUNET_OK !=
            GNUNET_STRINGS_string_to_data (sig_s,
                                           strlen (sig_s),
                                           &puc->account_sig,
                                           sizeof (puc->account_sig))) )
      {
        GNUNET_break_op (0);
        return TALER_MHD_reply_with_error (connection,
                                           MHD_HTTP_BAD_REQUEST,
                                           TALER_EC_ANASTASIS_POLICY_BAD_SIGNATURE,
                                           ANASTASIS_HTTP_HEADER_POLICY_SIGNATURE
                                           " header must include a base32-encoded EdDSA signature");
      }
    }
    {
      /* Check if header contains an ETAG */
      const char *etag;

      etag = MHD_lookup_connection_value (connection,
                                          MHD_HEADER_KIND,
                                          MHD_HTTP_HEADER_IF_NONE_MATCH);
      if ( (NULL == etag) ||
           (GNUNET_OK !=
            GNUNET_STRINGS_string_to_data (etag,
                                           strlen (etag),
                                           &puc->new_policy_upload_hash,
                                           sizeof (puc->new_policy_upload_hash))) )
      {
        GNUNET_break_op (0);
        return TALER_MHD_reply_with_error (connection,
                                           MHD_HTTP_BAD_REQUEST,
                                           TALER_EC_ANASTASIS_POLICY_BAD_IF_MATCH,
                                           MHD_HTTP_HEADER_IF_NONE_MATCH
                                           " header must include a base32-encoded SHA-512 hash");
      }
    }
    /* validate signature */
    {
      struct ANASTASIS_UploadSignaturePS usp = {
        .purpose.size = htonl (sizeof (usp)),
        .purpose.purpose = htonl (TALER_SIGNATURE_ANASTASIS_POLICY_UPLOAD),
        .new_recovery_data_hash = puc->new_policy_upload_hash
      };

      if (GNUNET_OK !=
          GNUNET_CRYPTO_eddsa_verify (TALER_SIGNATURE_ANASTASIS_POLICY_UPLOAD,
                                      &usp,
                                      &puc->account_sig.eddsa_sig,
                                      &account_pub->pub))
      {
        GNUNET_break_op (0);
        return TALER_MHD_reply_with_error (connection,
                                           MHD_HTTP_FORBIDDEN,
                                           TALER_EC_ANASTASIS_POLICY_BAD_SIGNATURE,
                                           ANASTASIS_HTTP_HEADER_POLICY_SIGNATURE);
      }
    }

    {
      const char *long_poll_timeout_ms;

      long_poll_timeout_ms = MHD_lookup_connection_value (connection,
                                                          MHD_GET_ARGUMENT_KIND,
                                                          "timeout_ms");
      if (NULL != long_poll_timeout_ms)
      {
        unsigned int timeout;
        char dummy;

        if (1 != sscanf (long_poll_timeout_ms,
                         "%u%c",
                         &timeout,
                         &dummy))
        {
          GNUNET_break_op (0);
          return TALER_MHD_reply_with_error (connection,
                                             MHD_HTTP_BAD_REQUEST,
                                             TALER_EC_GENERIC_PARAMETER_MALFORMED,
                                             "timeout_ms (must be non-negative number)");
        }
        puc->timeout
          = GNUNET_TIME_relative_to_absolute (GNUNET_TIME_relative_multiply (
                                                GNUNET_TIME_UNIT_MILLISECONDS,
                                                timeout));
      }
      else
      {
        puc->timeout = GNUNET_TIME_relative_to_absolute
                         (CHECK_PAYMENT_GENERIC_TIMEOUT);
      }
    }

    /* check if the client insists on paying */
    {
      const char *req;
      unsigned int years;

      req = MHD_lookup_connection_value (connection,
                                         MHD_GET_ARGUMENT_KIND,
                                         "storage_duration");
      if (NULL != req)
      {
        char dummy;

        if (1 != sscanf (req,
                         "%u%c",
                         &years,
                         &dummy))
        {
          GNUNET_break_op (0);
          return TALER_MHD_reply_with_error (connection,
                                             MHD_HTTP_BAD_REQUEST,
                                             TALER_EC_GENERIC_PARAMETER_MALFORMED,
                                             "storage_duration (must be non-negative number)");
        }
      }
      else
      {
        years = 0;
      }
      puc->end_date = GNUNET_TIME_relative_to_absolute (
        GNUNET_TIME_relative_multiply (GNUNET_TIME_UNIT_YEARS,
                                       years));
    }

    /* get ready to hash (done here as we may go async for payments next) */
    puc->hash_ctx = GNUNET_CRYPTO_hash_context_start ();

    /* Check database to see if the transaction is permissible */
    {
      struct GNUNET_TIME_Relative rem;

      rem = GNUNET_TIME_absolute_get_remaining (puc->end_date);
      puc->years_to_pay = rem.rel_value_us
                          / GNUNET_TIME_UNIT_YEARS.rel_value_us;
      if (0 != (rem.rel_value_us % GNUNET_TIME_UNIT_YEARS.rel_value_us))
        puc->years_to_pay++;

      if (puc->payment_identifier_provided)
      {
        /* check if payment identifier is valid (existing and paid) */
        bool paid;
        bool valid_counter;
        enum GNUNET_DB_QueryStatus qs;

        qs = db->check_payment_identifier (db->cls,
                                           &puc->payment_identifier,
                                           &paid,
                                           &valid_counter);
        if (qs < 0)
          return TALER_MHD_reply_with_error (puc->con,
                                             MHD_HTTP_INTERNAL_SERVER_ERROR,
                                             TALER_EC_GENERIC_DB_FETCH_FAILED,
                                             NULL);

        if ( (! paid) ||
             (! valid_counter) )
        {
          if (! valid_counter)
          {
            puc->payment_identifier_provided = false;
            if (0 == puc->years_to_pay)
              puc->years_to_pay = 1;
            GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                        "Too many uploads with this payment identifier, initiating fresh payment\n");
          }
          else
          {
            GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                        "Given payment identifier not known to be paid, initiating payment\n");
          }
          return prepare_payment (puc);
        }
      }

      if (! puc->payment_identifier_provided)
      {
        struct TALER_Amount zero_amount;
        enum GNUNET_DB_QueryStatus qs;
        struct GNUNET_TIME_Relative rel;

        TALER_amount_set_zero (AH_currency,
                               &zero_amount);
        /* generate fresh payment identifier */
        GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_STRONG,
                                    &puc->payment_identifier,
                                    sizeof (struct ANASTASIS_PaymentSecretP));
        if (0 != TALER_amount_cmp (&AH_annual_fee,
                                   &zero_amount))
        {
          GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                      "No payment identifier, requesting payment\n");
          return begin_payment (puc);
        }
        /* Cost is zero, fake "zero" payment having happened */
        GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                    "Policy upload is free, allowing upload without payment\n");
        qs = db->record_recdoc_payment (db->cls,
                                        account_pub,
                                        AH_post_counter,
                                        &puc->payment_identifier,
                                        &AH_annual_fee);
        if (qs <= 0)
          return TALER_MHD_reply_with_error (puc->con,
                                             MHD_HTTP_INTERNAL_SERVER_ERROR,
                                             TALER_EC_GENERIC_DB_FETCH_FAILED,
                                             NULL);
        rel = GNUNET_TIME_relative_multiply (
          GNUNET_TIME_UNIT_YEARS,
          ANASTASIS_MAX_YEARS_STORAGE);
        GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                    "Policy lifetime is %s (%u years)\n",
                    GNUNET_STRINGS_relative_time_to_string (rel,
                                                            GNUNET_YES),
                    ANASTASIS_MAX_YEARS_STORAGE);
        puc->paid_until = GNUNET_TIME_relative_to_absolute (rel);
        qs = db->update_lifetime (db->cls,
                                  account_pub,
                                  &puc->payment_identifier,
                                  puc->paid_until);
        if (qs <= 0)
        {
          GNUNET_break (0);
          return TALER_MHD_reply_with_error (puc->con,
                                             MHD_HTTP_INTERNAL_SERVER_ERROR,
                                             TALER_EC_GENERIC_DB_FETCH_FAILED,
                                             NULL);
        }
      }
    }

    /* Check if existing policy matches upload (and if, skip it) */
    {
      struct GNUNET_HashCode hc;
      enum ANASTASIS_DB_AccountStatus as;
      uint32_t version;
      struct GNUNET_TIME_Absolute now;
      struct GNUNET_TIME_Relative rem;

      as = db->lookup_account (db->cls,
                               account_pub,
                               &puc->paid_until,
                               &hc,
                               &version);
      now = GNUNET_TIME_absolute_get ();
      if (puc->paid_until.abs_value_us < now.abs_value_us)
        puc->paid_until = now;
      rem = GNUNET_TIME_absolute_get_difference (puc->paid_until,
                                                 puc->end_date);
      puc->years_to_pay = rem.rel_value_us
                          / GNUNET_TIME_UNIT_YEARS.rel_value_us;
      if (0 != (rem.rel_value_us % GNUNET_TIME_UNIT_YEARS.rel_value_us))
        puc->years_to_pay++;

      if ( (ANASTASIS_DB_ACCOUNT_STATUS_VALID_HASH_RETURNED == as) &&
           (0 != puc->years_to_pay) )
      {
        /* user requested extension, force payment */
        as = ANASTASIS_DB_ACCOUNT_STATUS_PAYMENT_REQUIRED;
      }
      switch (as)
      {
      case ANASTASIS_DB_ACCOUNT_STATUS_PAYMENT_REQUIRED:
        GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                    "Expiration too low, initiating payment\n");
        return prepare_payment (puc);
      case ANASTASIS_DB_ACCOUNT_STATUS_HARD_ERROR:
        return TALER_MHD_reply_with_error (puc->con,
                                           MHD_HTTP_INTERNAL_SERVER_ERROR,
                                           TALER_EC_GENERIC_DB_FETCH_FAILED,
                                           NULL);
      case ANASTASIS_DB_ACCOUNT_STATUS_NO_RESULTS:
        /* continue below */
        break;
      case ANASTASIS_DB_ACCOUNT_STATUS_VALID_HASH_RETURNED:
        if (0 == GNUNET_memcmp (&hc,
                                &puc->new_policy_upload_hash))
        {
          /* Refuse upload: we already have that backup! */
          struct MHD_Response *resp;
          MHD_RESULT ret;
          char version_s[14];

          GNUNET_snprintf (version_s,
                           sizeof (version_s),
                           "%u",
                           (unsigned int) version);
          resp = MHD_create_response_from_buffer (0,
                                                  NULL,
                                                  MHD_RESPMEM_PERSISTENT);
          TALER_MHD_add_global_headers (resp);
          GNUNET_break (MHD_YES ==
                        MHD_add_response_header (resp,
                                                 ANASTASIS_HTTP_HEADER_POLICY_VERSION,
                                                 version_s));
          ret = MHD_queue_response (connection,
                                    MHD_HTTP_NOT_MODIFIED,
                                    resp);
          GNUNET_break (MHD_YES == ret);
          MHD_destroy_response (resp);
          return ret;
        }
        break;
      }
    }
    /* ready to begin! */
    return MHD_YES;
  }

  if (NULL != puc->resp)
  {
    MHD_RESULT ret;

    /* We generated a response asynchronously, queue that */
    GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                "Returning asynchronously generated response with HTTP status %u\n",
                puc->response_code);
    ret = MHD_queue_response (connection,
                              puc->response_code,
                              puc->resp);
    GNUNET_break (MHD_YES == ret);
    MHD_destroy_response (puc->resp);
    puc->resp = NULL;
    return ret;
  }

  /* handle upload */
  if (0 != *recovery_data_size)
  {
    /* check MHD invariant */
    GNUNET_assert (puc->upload_off + *recovery_data_size <= puc->upload_size);
    memcpy (&puc->upload[puc->upload_off],
            recovery_data,
            *recovery_data_size);
    puc->upload_off += *recovery_data_size;
    GNUNET_CRYPTO_hash_context_read (puc->hash_ctx,
                                     recovery_data,
                                     *recovery_data_size);
    *recovery_data_size = 0;
    return MHD_YES;
  }

  if ( (0 == puc->upload_off) &&
       (0 != puc->upload_size) &&
       (NULL == puc->resp) )
  {
    /* wait for upload */
    return MHD_YES;
  }

  /* finished with upload, check hash */
  if (NULL != puc->hash_ctx)
  {
    struct GNUNET_HashCode our_hash;

    GNUNET_CRYPTO_hash_context_finish (puc->hash_ctx,
                                       &our_hash);
    puc->hash_ctx = NULL;
    if (0 != GNUNET_memcmp (&our_hash,
                            &puc->new_policy_upload_hash))
    {
      GNUNET_break_op (0);
      return TALER_MHD_reply_with_error (connection,
                                         MHD_HTTP_BAD_REQUEST,
                                         TALER_EC_ANASTASIS_POLICY_INVALID_UPLOAD,
                                         "Data uploaded does not match Etag promise");
    }
  }

  /* store backup to database */
  {
    enum ANASTASIS_DB_StoreStatus ss;
    uint32_t version = UINT32_MAX;
    char version_s[14];
    char expir_s[32];

    GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                "Uploading recovery document\n");
    ss = db->store_recovery_document (db->cls,
                                      &puc->account,
                                      &puc->account_sig,
                                      &puc->new_policy_upload_hash,
                                      puc->upload,
                                      puc->upload_size,
                                      &puc->payment_identifier,
                                      &version);
    GNUNET_snprintf (version_s,
                     sizeof (version_s),
                     "%u",
                     (unsigned int) version);
    GNUNET_snprintf (expir_s,
                     sizeof (expir_s),
                     "%llu",
                     (unsigned long long)
                     (puc->paid_until.abs_value_us
                      / GNUNET_TIME_UNIT_SECONDS.rel_value_us));
    switch (ss)
    {
    case ANASTASIS_DB_STORE_STATUS_STORE_LIMIT_EXCEEDED:
      GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                  "Storage request limit exceeded, requesting payment\n");
      if (! puc->payment_identifier_provided)
      {
        GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_STRONG,
                                    &puc->payment_identifier,
                                    sizeof (struct ANASTASIS_PaymentSecretP));
        puc->payment_identifier_provided = true;
        GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                    "Also no payment identifier, requesting payment\n");
      }
      return begin_payment (puc);
    case ANASTASIS_DB_STORE_STATUS_PAYMENT_REQUIRED:
      GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                  "Policy store operation requires payment\n");
      if (! puc->payment_identifier_provided)
      {
        GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_STRONG,
                                    &puc->payment_identifier,
                                    sizeof (struct ANASTASIS_PaymentSecretP));
        puc->payment_identifier_provided = true;
      }
      return begin_payment (puc);
    case ANASTASIS_DB_STORE_STATUS_HARD_ERROR:
    case ANASTASIS_DB_STORE_STATUS_SOFT_ERROR:
      return TALER_MHD_reply_with_error (puc->con,
                                         MHD_HTTP_INTERNAL_SERVER_ERROR,
                                         TALER_EC_GENERIC_DB_FETCH_FAILED,
                                         NULL);
    case ANASTASIS_DB_STORE_STATUS_NO_RESULTS:
      {
        /* database says nothing actually changed, 304 (could
           theoretically happen if another equivalent upload succeeded
           since we last checked!) */
        struct MHD_Response *resp;
        MHD_RESULT ret;

        resp = MHD_create_response_from_buffer (0,
                                                NULL,
                                                MHD_RESPMEM_PERSISTENT);
        TALER_MHD_add_global_headers (resp);
        GNUNET_break (MHD_YES ==
                      MHD_add_response_header (resp,
                                               "Anastasis-Version",
                                               version_s));
        ret = MHD_queue_response (connection,
                                  MHD_HTTP_NOT_MODIFIED,
                                  resp);
        GNUNET_break (MHD_YES == ret);
        MHD_destroy_response (resp);
        return ret;
      }
    case ANASTASIS_DB_STORE_STATUS_SUCCESS:
      /* generate main (204) standard success reply */
      {
        struct MHD_Response *resp;
        MHD_RESULT ret;

        resp = MHD_create_response_from_buffer (0,
                                                NULL,
                                                MHD_RESPMEM_PERSISTENT);
        TALER_MHD_add_global_headers (resp);
        GNUNET_break (MHD_YES ==
                      MHD_add_response_header (resp,
                                               ANASTASIS_HTTP_HEADER_POLICY_VERSION,
                                               version_s));
        GNUNET_break (MHD_YES ==
                      MHD_add_response_header (resp,
                                               ANASTASIS_HTTP_HEADER_POLICY_EXPIRATION,
                                               expir_s));
        ret = MHD_queue_response (connection,
                                  MHD_HTTP_NO_CONTENT,
                                  resp);
        GNUNET_break (MHD_YES == ret);
        MHD_destroy_response (resp);
        return ret;
      }
    }
  }
  GNUNET_break (0);
  return MHD_NO;
}
