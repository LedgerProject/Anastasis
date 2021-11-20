/*
  This file is part of Anastasis
  Copyright (C) 2019, 2021 Anastasis SARL

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
 * @file anastasis-httpd_truth_upload.c
 * @brief functions to handle incoming POST request on /truth
 * @author Dennis Neufeld
 * @author Dominik Meister
 * @author Christian Grothoff
 */
#include "platform.h"
#include "anastasis-httpd.h"
#include "anastasis_service.h"
#include "anastasis-httpd_truth.h"
#include <gnunet/gnunet_util_lib.h>
#include <gnunet/gnunet_rest_lib.h>
#include <taler/taler_json_lib.h>
#include <taler/taler_merchant_service.h>
#include <taler/taler_signatures.h>
#include "anastasis_authorization_lib.h"


/**
 * Information we track per truth upload.
 */
struct TruthUploadContext
{

  /**
   * UUID of the truth object we are processing.
   */
  struct ANASTASIS_CRYPTO_TruthUUIDP truth_uuid;

  /**
   * Kept in DLL for shutdown handling while suspended.
   */
  struct TruthUploadContext *next;

  /**
   * Kept in DLL for shutdown handling while suspended.
   */
  struct TruthUploadContext *prev;

  /**
   * Used while we are awaiting proposal creation.
   */
  struct TALER_MERCHANT_PostOrdersHandle *po;

  /**
   * Used while we are waiting payment.
   */
  struct TALER_MERCHANT_OrderMerchantGetHandle *cpo;

  /**
   * Post parser context.
   */
  void *post_ctx;

  /**
   * Handle to the client request.
   */
  struct MHD_Connection *connection;

  /**
   * Incoming JSON, NULL if not yet available.
   */
  json_t *json;

  /**
   * HTTP response code to use on resume, if non-NULL.
   */
  struct MHD_Response *resp;

  /**
   * When should this request time out?
   */
  struct GNUNET_TIME_Absolute timeout;

  /**
   * Fee that is to be paid for this upload.
   */
  struct TALER_Amount upload_fee;

  /**
   * HTTP response code to use on resume, if resp is set.
   */
  unsigned int response_code;

  /**
   * For how many years must the customer still pay?
   */
  unsigned int years_to_pay;

};


/**
 * Head of linked list over all truth upload processes
 */
static struct TruthUploadContext *tuc_head;

/**
 * Tail of linked list over all truth upload processes
 */
static struct TruthUploadContext *tuc_tail;


void
AH_truth_upload_shutdown (void)
{
  struct TruthUploadContext *tuc;

  while (NULL != (tuc = tuc_head))
  {
    GNUNET_CONTAINER_DLL_remove (tuc_head,
                                 tuc_tail,
                                 tuc);
    if (NULL != tuc->cpo)
    {
      TALER_MERCHANT_merchant_order_get_cancel (tuc->cpo);
      tuc->cpo = NULL;
    }
    if (NULL != tuc->po)
    {
      TALER_MERCHANT_orders_post_cancel (tuc->po);
      tuc->po = NULL;
    }
    MHD_resume_connection (tuc->connection);
  }
}


/**
 * Function called to clean up a `struct TruthUploadContext`.
 *
 * @param hc general handler context
 */
static void
cleanup_truth_post (struct TM_HandlerContext *hc)
{
  struct TruthUploadContext *tuc = hc->ctx;

  TALER_MHD_parse_post_cleanup_callback (tuc->post_ctx);
  if (NULL != tuc->po)
    TALER_MERCHANT_orders_post_cancel (tuc->po);
  if (NULL != tuc->cpo)
    TALER_MERCHANT_merchant_order_get_cancel (tuc->cpo);
  if (NULL != tuc->resp)
    MHD_destroy_response (tuc->resp);
  if (NULL != tuc->json)
    json_decref (tuc->json);
  GNUNET_free (tuc);
}


/**
 * Transmit a payment request for @a tuc.
 *
 * @param tuc upload context to generate payment request for
 */
static void
make_payment_request (struct TruthUploadContext *tuc)
{
  struct MHD_Response *resp;

  /* request payment via Taler */
  resp = MHD_create_response_from_buffer (0,
                                          NULL,
                                          MHD_RESPMEM_PERSISTENT);
  GNUNET_assert (NULL != resp);
  TALER_MHD_add_global_headers (resp);
  {
    char *hdr;
    const char *pfx;
    const char *hn;

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
      /* This invariant holds as per check in anastasis-httpd.c */
      GNUNET_assert (0);
    }
    /* This invariant holds as per check in anastasis-httpd.c */
    GNUNET_assert (0 != strlen (hn));
    {
      char *order_id;

      order_id = GNUNET_STRINGS_data_to_string_alloc (
        &tuc->truth_uuid,
        sizeof (tuc->truth_uuid));
      GNUNET_asprintf (&hdr,
                       "%spay/%s%s/",
                       pfx,
                       hn,
                       order_id);
      GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
                  "Returning %u %s\n",
                  MHD_HTTP_PAYMENT_REQUIRED,
                  order_id);
      GNUNET_free (order_id);
    }
    GNUNET_break (MHD_YES ==
                  MHD_add_response_header (resp,
                                           ANASTASIS_HTTP_HEADER_TALER,
                                           hdr));
    GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
                "TRUTH payment request made: %s\n",
                hdr);
    GNUNET_free (hdr);
  }
  tuc->resp = resp;
  tuc->response_code = MHD_HTTP_PAYMENT_REQUIRED;
}


/**
 * Callbacks of this type are used to serve the result of submitting a
 * POST /private/orders request to a merchant.
 *
 * @param cls our `struct TruthUploadContext`
 * @param por response details
 */
static void
proposal_cb (void *cls,
             const struct TALER_MERCHANT_PostOrdersReply *por)
{
  struct TruthUploadContext *tuc = cls;

  tuc->po = NULL;
  GNUNET_CONTAINER_DLL_remove (tuc_head,
                               tuc_tail,
                               tuc);
  MHD_resume_connection (tuc->connection);
  AH_trigger_daemon (NULL);
  if (MHD_HTTP_OK != por->hr.http_status)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                "Backend returned status %u/%d\n",
                por->hr.http_status,
                (int) por->hr.ec);
    GNUNET_break (0);
    tuc->resp = TALER_MHD_MAKE_JSON_PACK (
      GNUNET_JSON_pack_uint64 ("code",
                               TALER_EC_ANASTASIS_GENERIC_ORDER_CREATE_BACKEND_ERROR),
      GNUNET_JSON_pack_string ("hint",
                               "Failed to setup order with merchant backend"),
      GNUNET_JSON_pack_uint64 ("backend-ec",
                               por->hr.ec),
      GNUNET_JSON_pack_uint64 ("backend-http-status",
                               por->hr.http_status),
      GNUNET_JSON_pack_allow_null (
        GNUNET_JSON_pack_object_incref ("backend-reply",
                                        (json_t *) por->hr.reply)));
    tuc->response_code = MHD_HTTP_BAD_GATEWAY;
    return;
  }
  make_payment_request (tuc);
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
  struct TruthUploadContext *tuc = cls;

  tuc->cpo = NULL;
  GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
              "Checking backend order status returned %u\n",
              hr->http_status);
  switch (hr->http_status)
  {
  case 0:
    /* Likely timeout, complain! */
    tuc->response_code = MHD_HTTP_GATEWAY_TIMEOUT;
    tuc->resp = TALER_MHD_make_error (
      TALER_EC_ANASTASIS_GENERIC_BACKEND_TIMEOUT,
      NULL);
    break;
  case MHD_HTTP_OK:
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
          tuc->response_code = MHD_HTTP_INTERNAL_SERVER_ERROR;
          tuc->resp = TALER_MHD_make_error (
            TALER_EC_MERCHANT_GENERIC_DB_CONTRACT_CONTENT_INVALID,
            "contract terms in database are malformed");
          break;
        }
        years = TALER_amount_divide2 (&amount,
                                      &AH_truth_upload_fee);
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
        qs = db->record_truth_upload_payment (
          db->cls,
          &tuc->truth_uuid,
          &osr->details.paid.deposit_total,
          paid_until);
        if (qs <= 0)
        {
          GNUNET_break (0);
          tuc->response_code = MHD_HTTP_INTERNAL_SERVER_ERROR;
          tuc->resp = TALER_MHD_make_error (
            TALER_EC_GENERIC_DB_STORE_FAILED,
            "record_truth_upload_payment");
          break;
        }
      }
      GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
                  "Payment confirmed, resuming upload\n");
      break;
    case TALER_MERCHANT_OSC_UNPAID:
    case TALER_MERCHANT_OSC_CLAIMED:
      make_payment_request (tuc);
      break;
    }
    break;
  case MHD_HTTP_UNAUTHORIZED:
    /* Configuration issue, complain! */
    tuc->response_code = MHD_HTTP_INTERNAL_SERVER_ERROR;
    tuc->resp = TALER_MHD_MAKE_JSON_PACK (
      GNUNET_JSON_pack_uint64 ("code",
                               TALER_EC_ANASTASIS_GENERIC_PAYMENT_CHECK_UNAUTHORIZED),
      GNUNET_JSON_pack_string ("hint",
                               TALER_ErrorCode_get_hint (
                                 TALER_EC_ANASTASIS_GENERIC_PAYMENT_CHECK_UNAUTHORIZED)),
      GNUNET_JSON_pack_uint64 ("backend-ec",
                               hr->ec),
      GNUNET_JSON_pack_uint64 ("backend-http-status",
                               hr->http_status),
      GNUNET_JSON_pack_allow_null (
        GNUNET_JSON_pack_object_incref ("backend-reply",
                                        (json_t *) hr->reply)));
    GNUNET_assert (NULL != tuc->resp);
    break;
  case MHD_HTTP_NOT_FOUND:
    /* Setup fresh order */
    {
      char *order_id;
      json_t *order;

      order_id = GNUNET_STRINGS_data_to_string_alloc (
        &tuc->truth_uuid,
        sizeof(tuc->truth_uuid));
      GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
                  "%u, setting up fresh order %s\n",
                  MHD_HTTP_NOT_FOUND,
                  order_id);
      order = json_pack ("{s:o, s:s, s:[{s:s,s:I,s:s}], s:s}",
                         "amount",
                         TALER_JSON_from_amount (&tuc->upload_fee),
                         "summary",
                         "Anastasis challenge storage fee",
                         "products",
                         "description", "challenge storage fee",
                         "quantity", (json_int_t) tuc->years_to_pay,
                         "unit", "years",

                         "order_id",
                         order_id);
      GNUNET_free (order_id);
      tuc->po = TALER_MERCHANT_orders_post2 (AH_ctx,
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
                                             tuc);
      AH_trigger_curl ();
      json_decref (order);
      return;
    }
  default:
    /* Unexpected backend response */
    tuc->response_code = MHD_HTTP_BAD_GATEWAY;
    tuc->resp = TALER_MHD_MAKE_JSON_PACK (
      GNUNET_JSON_pack_uint64 ("code",
                               TALER_EC_ANASTASIS_GENERIC_BACKEND_ERROR),
      GNUNET_JSON_pack_string ("hint",
                               TALER_ErrorCode_get_hint (
                                 TALER_EC_ANASTASIS_GENERIC_BACKEND_ERROR)),
      GNUNET_JSON_pack_uint64 ("backend-ec",
                               (json_int_t) hr->ec),
      GNUNET_JSON_pack_uint64 ("backend-http-status",
                               (json_int_t) hr->http_status),
      GNUNET_JSON_pack_allow_null (
        GNUNET_JSON_pack_object_incref ("backend-reply",
                                        (json_t *) hr->reply)));
    break;
  }
  GNUNET_CONTAINER_DLL_remove (tuc_head,
                               tuc_tail,
                               tuc);
  MHD_resume_connection (tuc->connection);
  AH_trigger_daemon (NULL);
}


/**
 * Helper function used to ask our backend to begin processing a
 * payment for the truth upload.  May perform asynchronous operations
 * by suspending the connection if required.
 *
 * @param tuc context to begin payment for.
 * @return MHD status code
 */
static MHD_RESULT
begin_payment (struct TruthUploadContext *tuc)
{
  char *order_id;
  struct GNUNET_TIME_Relative timeout;

  GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
              "Checking backend order status...\n");
  timeout = GNUNET_TIME_absolute_get_remaining (tuc->timeout);
  order_id = GNUNET_STRINGS_data_to_string_alloc (
    &tuc->truth_uuid,
    sizeof (tuc->truth_uuid));
  tuc->cpo = TALER_MERCHANT_merchant_order_get (AH_ctx,
                                                AH_backend_url,
                                                order_id,
                                                NULL /* our payments are NOT session-bound */,
                                                false,
                                                timeout,
                                                &check_payment_cb,
                                                tuc);
  GNUNET_free (order_id);
  if (NULL == tuc->cpo)
  {
    GNUNET_break (0);
    return TALER_MHD_reply_with_error (tuc->connection,
                                       MHD_HTTP_INTERNAL_SERVER_ERROR,
                                       TALER_EC_ANASTASIS_GENERIC_PAYMENT_CHECK_START_FAILED,
                                       "Could not check order status");
  }
  GNUNET_CONTAINER_DLL_insert (tuc_head,
                               tuc_tail,
                               tuc);
  MHD_suspend_connection (tuc->connection);
  return MHD_YES;
}


MHD_RESULT
AH_handler_truth_post (
  struct MHD_Connection *connection,
  struct TM_HandlerContext *hc,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
  const char *truth_data,
  size_t *truth_data_size)
{
  struct TruthUploadContext *tuc = hc->ctx;
  MHD_RESULT ret;
  int res;
  struct ANASTASIS_CRYPTO_EncryptedKeyShareP key_share_data;
  void *encrypted_truth;
  size_t encrypted_truth_size;
  const char *truth_mime = NULL;
  const char *type;
  enum GNUNET_DB_QueryStatus qs;
  uint32_t storage_years;
  struct GNUNET_TIME_Absolute paid_until;
  struct GNUNET_JSON_Specification spec[] = {
    GNUNET_JSON_spec_fixed_auto ("key_share_data",
                                 &key_share_data),
    GNUNET_JSON_spec_string ("type",
                             &type),
    GNUNET_JSON_spec_varsize ("encrypted_truth",
                              &encrypted_truth,
                              &encrypted_truth_size),
    GNUNET_JSON_spec_mark_optional (
      GNUNET_JSON_spec_string ("truth_mime",
                               &truth_mime)),
    GNUNET_JSON_spec_uint32 ("storage_duration_years",
                             &storage_years),
    GNUNET_JSON_spec_end ()
  };

  if (NULL == tuc)
  {
    tuc = GNUNET_new (struct TruthUploadContext);
    tuc->connection = connection;
    tuc->truth_uuid = *truth_uuid;
    hc->ctx = tuc;
    hc->cc = &cleanup_truth_post;

    /* check for excessive upload */
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
        tuc->timeout
          = GNUNET_TIME_relative_to_absolute (GNUNET_TIME_relative_multiply (
                                                GNUNET_TIME_UNIT_MILLISECONDS,
                                                timeout));
        GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
                    "Long polling for %u ms enabled\n",
                    timeout);
      }
      else
      {
        tuc->timeout = GNUNET_TIME_relative_to_absolute (
          GNUNET_TIME_UNIT_SECONDS);
      }
    }

  } /* end 'if (NULL == tuc)' */

  if (NULL != tuc->resp)
  {
    /* We generated a response asynchronously, queue that */
    GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
                "Returning asynchronously generated response with HTTP status %u\n",
                tuc->response_code);
    ret = MHD_queue_response (connection,
                              tuc->response_code,
                              tuc->resp);
    GNUNET_break (MHD_YES == ret);
    MHD_destroy_response (tuc->resp);
    tuc->resp = NULL;
    return ret;
  }

  if (NULL == tuc->json)
  {
    res = TALER_MHD_parse_post_json (connection,
                                     &tuc->post_ctx,
                                     truth_data,
                                     truth_data_size,
                                     &tuc->json);
    if (GNUNET_SYSERR == res)
    {
      GNUNET_break (0);
      return MHD_NO;
    }
    if ( (GNUNET_NO == res) ||
         (NULL == tuc->json) )
      return MHD_YES;
  }
  res = TALER_MHD_parse_json_data (connection,
                                   tuc->json,
                                   spec);
  if (GNUNET_SYSERR == res)
  {
    GNUNET_break (0);
    return MHD_NO;   /* hard failure */
  }
  if (GNUNET_NO == res)
  {
    GNUNET_break_op (0);
    return MHD_YES;   /* failure */
  }

  /* check method is supported */
  if ( (0 != strcmp ("question",
                     type)) &&
       (NULL ==
        ANASTASIS_authorization_plugin_load (type,
                                             db,
                                             AH_cfg)) )
  {
    GNUNET_JSON_parse_free (spec);
    return TALER_MHD_reply_with_error (connection,
                                       MHD_HTTP_BAD_REQUEST,
                                       TALER_EC_ANASTASIS_TRUTH_UPLOAD_METHOD_NOT_SUPPORTED,
                                       type);
  }

  if (storage_years > ANASTASIS_MAX_YEARS_STORAGE)
  {
    GNUNET_break_op (0);
    return TALER_MHD_reply_with_error (connection,
                                       MHD_HTTP_BAD_REQUEST,
                                       TALER_EC_GENERIC_PARAMETER_MALFORMED,
                                       "storage_duration_years");
  }
  if (0 == storage_years)
    storage_years = 1;

  {
    struct TALER_Amount zero_amount;

    TALER_amount_set_zero (AH_currency,
                           &zero_amount);
    if (0 != TALER_amount_cmp (&AH_truth_upload_fee,
                               &zero_amount))
    {
      struct GNUNET_TIME_Absolute desired_until;
      enum GNUNET_DB_QueryStatus qs;

      desired_until
        = GNUNET_TIME_relative_to_absolute (
            GNUNET_TIME_relative_multiply (GNUNET_TIME_UNIT_YEARS,
                                           storage_years));
      qs = db->check_truth_upload_paid (db->cls,
                                        truth_uuid,
                                        &paid_until);
      if (qs < 0)
        return TALER_MHD_reply_with_error (connection,
                                           MHD_HTTP_INTERNAL_SERVER_ERROR,
                                           TALER_EC_GENERIC_DB_FETCH_FAILED,
                                           NULL);
      if ( (0 == qs) ||
           (paid_until.abs_value_us < desired_until.abs_value_us) )
      {
        struct GNUNET_TIME_Absolute now;
        struct GNUNET_TIME_Relative rem;

        now = GNUNET_TIME_absolute_get ();
        if (paid_until.abs_value_us < now.abs_value_us)
          paid_until = now;
        rem = GNUNET_TIME_absolute_get_difference (paid_until,
                                                   desired_until);
        tuc->years_to_pay = rem.rel_value_us
                            / GNUNET_TIME_UNIT_YEARS.rel_value_us;
        if (0 != (rem.rel_value_us % GNUNET_TIME_UNIT_YEARS.rel_value_us))
          tuc->years_to_pay++;
        if (0 >
            TALER_amount_multiply (&tuc->upload_fee,
                                   &AH_truth_upload_fee,
                                   tuc->years_to_pay))
        {
          GNUNET_break_op (0);
          return TALER_MHD_reply_with_error (connection,
                                             MHD_HTTP_BAD_REQUEST,
                                             TALER_EC_GENERIC_PARAMETER_MALFORMED,
                                             "storage_duration_years");
        }
        if ( (0 != tuc->upload_fee.fraction) ||
             (0 != tuc->upload_fee.value) )
        {
          GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
                      "Truth upload payment required (%d)!\n",
                      qs);
          return begin_payment (tuc);
        }
      }
      GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
                  "TRUTH paid until %s (%d)!\n",
                  GNUNET_STRINGS_relative_time_to_string (
                    GNUNET_TIME_absolute_get_remaining (
                      paid_until),
                    GNUNET_YES),
                  qs);
    }
    else
    {
      paid_until
        = GNUNET_TIME_relative_to_absolute (
            GNUNET_TIME_relative_multiply (GNUNET_TIME_UNIT_YEARS,
                                           ANASTASIS_MAX_YEARS_STORAGE));
    }
  }


  GNUNET_log (GNUNET_ERROR_TYPE_INFO,
              "Storing truth until %s!\n",
              GNUNET_STRINGS_absolute_time_to_string (paid_until));
  qs = db->store_truth (db->cls,
                        truth_uuid,
                        &key_share_data,
                        (NULL == truth_mime)
                        ? ""
                        : truth_mime,
                        encrypted_truth,
                        encrypted_truth_size,
                        type,
                        GNUNET_TIME_absolute_get_remaining (paid_until));
  switch (qs)
  {
  case GNUNET_DB_STATUS_HARD_ERROR:
  case GNUNET_DB_STATUS_SOFT_ERROR:
    GNUNET_break (0);
    GNUNET_JSON_parse_free (spec);
    return TALER_MHD_reply_with_error (connection,
                                       MHD_HTTP_INTERNAL_SERVER_ERROR,
                                       TALER_EC_GENERIC_DB_INVARIANT_FAILURE,
                                       "store_truth");
  case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
    {
      void *xtruth;
      size_t xtruth_size;
      char *xtruth_mime;
      char *xmethod;
      bool ok = false;

      if (GNUNET_DB_STATUS_SUCCESS_ONE_RESULT ==
          db->get_escrow_challenge (db->cls,
                                    truth_uuid,
                                    &xtruth,
                                    &xtruth_size,
                                    &xtruth_mime,
                                    &xmethod))
      {
        ok = ( (xtruth_size == encrypted_truth_size) &&
               (0 == strcmp (xmethod,
                             type)) &&
               (0 == strcmp (((NULL == truth_mime) ? "" : truth_mime),
                             ((NULL == xtruth_mime) ? "" : xtruth_mime))) &&
               (0 == memcmp (xtruth,
                             encrypted_truth,
                             xtruth_size)) );
        GNUNET_free (encrypted_truth);
        GNUNET_free (xtruth_mime);
        GNUNET_free (xmethod);
      }
      if (! ok)
      {
        GNUNET_JSON_parse_free (spec);

        return TALER_MHD_reply_with_error (connection,
                                           MHD_HTTP_CONFLICT,
                                           TALER_EC_ANASTASIS_TRUTH_UPLOAD_UUID_EXISTS,
                                           NULL);
      }
      /* idempotency detected, intentional fall through! */
    }
  case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
    {
      struct MHD_Response *resp;

      GNUNET_JSON_parse_free (spec);
      resp = MHD_create_response_from_buffer (0,
                                              NULL,
                                              MHD_RESPMEM_PERSISTENT);
      TALER_MHD_add_global_headers (resp);
      ret = MHD_queue_response (connection,
                                MHD_HTTP_NO_CONTENT,
                                resp);
      MHD_destroy_response (resp);
      GNUNET_break (MHD_YES == ret);
      return ret;
    }
  }
  GNUNET_JSON_parse_free (spec);
  GNUNET_break (0);
  return MHD_NO;
}
