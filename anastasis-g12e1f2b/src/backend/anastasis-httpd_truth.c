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
 * @file anastasis-httpd_truth.c
 * @brief functions to handle incoming requests on /truth
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
#include "anastasis_authorization_lib.h"
#include <taler/taler_merchant_service.h>
#include <taler/taler_json_lib.h>

/**
 * What is the maximum frequency at which we allow
 * clients to attempt to answer security questions?
 */
#define MAX_QUESTION_FREQ GNUNET_TIME_relative_multiply ( \
    GNUNET_TIME_UNIT_SECONDS, 30)

/**
 * How long do we hold an HTTP client connection if
 * we are awaiting payment before giving up?
 */
#define CHECK_PAYMENT_GENERIC_TIMEOUT GNUNET_TIME_relative_multiply ( \
    GNUNET_TIME_UNIT_MINUTES, 30)

/**
 * How long should the wallet check for auto-refunds before giving up?
 */
#define AUTO_REFUND_TIMEOUT GNUNET_TIME_relative_multiply ( \
    GNUNET_TIME_UNIT_MINUTES, 2)


/**
 * How many retries do we allow per code?
 */
#define INITIAL_RETRY_COUNTER 3


struct GetContext
{

  /**
   * Payment Identifier
   */
  struct ANASTASIS_PaymentSecretP payment_identifier;

  /**
   * Public key of the challenge which is solved.
   */
  struct ANASTASIS_CRYPTO_TruthUUIDP truth_uuid;

  /**
   * Key to decrypt the truth.
   */
  struct ANASTASIS_CRYPTO_TruthKeyP truth_key;

  /**
   * Cost for paying the challenge.
   */
  struct TALER_Amount challenge_cost;

  /**
   * Our handler context.
   */
  struct TM_HandlerContext *hc;

  /**
   * Kept in DLL for shutdown handling while suspended.
   */
  struct GetContext *next;

  /**
   * Kept in DLL for shutdown handling while suspended.
   */
  struct GetContext *prev;

  /**
   * Connection handle for closing or resuming
   */
  struct MHD_Connection *connection;

  /**
   * Reference to the authorization plugin which was loaded
   */
  struct ANASTASIS_AuthorizationPlugin *authorization;

  /**
   * Status of the authorization
   */
  struct ANASTASIS_AUTHORIZATION_State *as;

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
   * Our entry in the #to_heap, or NULL.
   */
  struct GNUNET_CONTAINER_HeapNode *hn;

  /**
   * Challenge response we got from the request.
   */
  struct GNUNET_HashCode challenge_response;

  /**
   * How long do we wait at most for payment or
   * authorization?
   */
  struct GNUNET_TIME_Absolute timeout;

  /**
   * Random authorization code we are using.
   */
  uint64_t code;

  /**
   * HTTP response code to use on resume, if resp is set.
   */
  unsigned int response_code;

  /**
   * true if client provided a payment secret / order ID?
   */
  bool payment_identifier_provided;

  /**
   * True if this entry is in the #gc_head DLL.
   */
  bool in_list;

  /**
   * True if this entry is currently suspended.
   */
  bool suspended;

  /**
   * Did the request include a response?
   */
  bool have_response;

};

/**
 * Information we track for refunds.
 */
struct RefundEntry
{
  /**
   * Kept in a DLL.
   */
  struct RefundEntry *next;

  /**
   * Kept in a DLL.
   */
  struct RefundEntry *prev;

  /**
   * Operation handle.
   */
  struct TALER_MERCHANT_OrderRefundHandle *ro;

  /**
   * Which order is being refunded.
   */
  char *order_id;

  /**
   * Payment Identifier
   */
  struct ANASTASIS_PaymentSecretP payment_identifier;

  /**
   * Public key of the challenge which is solved.
   */
  struct ANASTASIS_CRYPTO_TruthUUIDP truth_uuid;
};


/**
 * Head of linked list of active refund operations.
 */
static struct RefundEntry *re_head;

/**
 * Tail of linked list of active refund operations.
 */
static struct RefundEntry *re_tail;

/**
 * Head of linked list over all authorization processes
 */
static struct GetContext *gc_head;

/**
 * Tail of linked list over all authorization processes
 */
static struct GetContext *gc_tail;

/**
 * Task running #do_timeout().
 */
static struct GNUNET_SCHEDULER_Task *to_task;


/**
 * Timeout requests that are past their due date.
 *
 * @param cls NULL
 */
static void
do_timeout (void *cls)
{
  struct GetContext *gc;

  (void) cls;
  to_task = NULL;
  while (NULL !=
         (gc = GNUNET_CONTAINER_heap_peek (AH_to_heap)))
  {
    if (GNUNET_TIME_absolute_is_future (gc->timeout))
      break;
    if (gc->suspended)
    {
      /* Test needed as we may have a "concurrent"
         wakeup from another task that did not clear
         this entry from the heap before the
         response process concluded. */
      gc->suspended = false;
      MHD_resume_connection (gc->connection);
    }
    GNUNET_assert (NULL != gc->hn);
    gc->hn = NULL;
    GNUNET_assert (gc ==
                   GNUNET_CONTAINER_heap_remove_root (AH_to_heap));
  }
  if (NULL == gc)
    return;
  to_task = GNUNET_SCHEDULER_add_at (gc->timeout,
                                     &do_timeout,
                                     NULL);
}


void
AH_truth_shutdown (void)
{
  struct GetContext *gc;
  struct RefundEntry *re;

  while (NULL != (re = re_head))
  {
    GNUNET_CONTAINER_DLL_remove (re_head,
                                 re_tail,
                                 re);
    if (NULL != re->ro)
    {
      TALER_MERCHANT_post_order_refund_cancel (re->ro);
      re->ro = NULL;
    }
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Refund `%s' failed due to shutdown\n",
                re->order_id);
    GNUNET_free (re->order_id);
    GNUNET_free (re);
  }

  while (NULL != (gc = gc_head))
  {
    GNUNET_CONTAINER_DLL_remove (gc_head,
                                 gc_tail,
                                 gc);
    gc->in_list = false;
    if (NULL != gc->cpo)
    {
      TALER_MERCHANT_merchant_order_get_cancel (gc->cpo);
      gc->cpo = NULL;
    }
    if (NULL != gc->po)
    {
      TALER_MERCHANT_orders_post_cancel (gc->po);
      gc->po = NULL;
    }
    if (gc->suspended)
    {
      gc->suspended = false;
      MHD_resume_connection (gc->connection);
    }
    if (NULL != gc->as)
    {
      gc->authorization->cleanup (gc->as);
      gc->as = NULL;
      gc->authorization = NULL;
    }
  }
  ANASTASIS_authorization_plugin_shutdown ();
  if (NULL != to_task)
  {
    GNUNET_SCHEDULER_cancel (to_task);
    to_task = NULL;
  }
}


/**
 * Callback to process a POST /orders/ID/refund request
 *
 * @param cls closure with a `struct RefundEntry *`
 * @param hr HTTP response details
 * @param taler_refund_uri the refund uri offered to the wallet
 * @param h_contract hash of the contract a Browser may need to authorize
 *        obtaining the HTTP response.
 */
static void
refund_cb (
  void *cls,
  const struct TALER_MERCHANT_HttpResponse *hr,
  const char *taler_refund_uri,
  const struct TALER_PrivateContractHash *h_contract)
{
  struct RefundEntry *re = cls;

  re->ro = NULL;
  switch (hr->http_status)
  {
  case MHD_HTTP_OK:
    {
      enum GNUNET_DB_QueryStatus qs;

      GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                  "Refund `%s' succeeded\n",
                  re->order_id);
      qs = db->record_challenge_refund (db->cls,
                                        &re->truth_uuid,
                                        &re->payment_identifier);
      switch (qs)
      {
      case GNUNET_DB_STATUS_HARD_ERROR:
        GNUNET_break (0);
        break;
      case GNUNET_DB_STATUS_SOFT_ERROR:
        GNUNET_break (0);
        break;
      case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
        GNUNET_break (0);
        break;
      case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
        break;
      }
    }
    break;
  default:
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Refund `%s' failed with HTTP status %u: %s (#%u)\n",
                re->order_id,
                hr->http_status,
                hr->hint,
                (unsigned int) hr->ec);
    break;
  }
  GNUNET_CONTAINER_DLL_remove (re_head,
                               re_tail,
                               re);
  GNUNET_free (re->order_id);
  GNUNET_free (re);
}


/**
 * Start to give a refund for the challenge created by @a gc.
 *
 * @param gc request where we failed and should now grant a refund for
 */
static void
begin_refund (const struct GetContext *gc)
{
  struct RefundEntry *re;

  re = GNUNET_new (struct RefundEntry);
  re->order_id = GNUNET_STRINGS_data_to_string_alloc (
    &gc->payment_identifier,
    sizeof (gc->payment_identifier));
  GNUNET_log (GNUNET_ERROR_TYPE_INFO,
              "Challenge execution failed, triggering refund for order `%s'\n",
              re->order_id);
  re->payment_identifier = gc->payment_identifier;
  re->truth_uuid = gc->truth_uuid;
  re->ro = TALER_MERCHANT_post_order_refund (AH_ctx,
                                             AH_backend_url,
                                             re->order_id,
                                             &gc->challenge_cost,
                                             "failed to issue challenge",
                                             &refund_cb,
                                             re);
  if (NULL == re->ro)
  {
    GNUNET_break (0);
    GNUNET_free (re->order_id);
    GNUNET_free (re);
    return;
  }
  GNUNET_CONTAINER_DLL_insert (re_head,
                               re_tail,
                               re);
}


/**
 * Callback used to notify the application about completed requests.
 * Cleans up the requests data structures.
 *
 * @param hc
 */
static void
request_done (struct TM_HandlerContext *hc)
{
  struct GetContext *gc = hc->ctx;

  GNUNET_log (GNUNET_ERROR_TYPE_INFO,
              "Request completed\n");
  if (NULL == gc)
    return;
  hc->cc = NULL;
  GNUNET_assert (! gc->suspended);
  if (gc->in_list)
  {
    GNUNET_CONTAINER_DLL_remove (gc_head,
                                 gc_tail,
                                 gc);
    gc->in_list = false;
  }
  if (NULL != gc->hn)
  {
    GNUNET_assert (gc ==
                   GNUNET_CONTAINER_heap_remove_node (gc->hn));
    gc->hn = NULL;
  }
  if (NULL != gc->as)
  {
    gc->authorization->cleanup (gc->as);
    gc->authorization = NULL;
    gc->as = NULL;
  }
  if (NULL != gc->cpo)
  {
    TALER_MERCHANT_merchant_order_get_cancel (gc->cpo);
    gc->cpo = NULL;
  }
  if (NULL != gc->po)
  {
    TALER_MERCHANT_orders_post_cancel (gc->po);
    gc->po = NULL;
  }
  GNUNET_free (gc);
  hc->ctx = NULL;
}


/**
 * Transmit a payment request for @a order_id on @a connection
 *
 * @param gc context to make payment request for
 */
static void
make_payment_request (struct GetContext *gc)
{
  struct MHD_Response *resp;

  resp = MHD_create_response_from_buffer (0,
                                          NULL,
                                          MHD_RESPMEM_PERSISTENT);
  GNUNET_assert (NULL != resp);
  TALER_MHD_add_global_headers (resp);
  {
    char *hdr;
    char *order_id;
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

    order_id = GNUNET_STRINGS_data_to_string_alloc (
      &gc->payment_identifier,
      sizeof (gc->payment_identifier));
    GNUNET_asprintf (&hdr,
                     "%spay/%s%s/",
                     pfx,
                     hn,
                     order_id);
    GNUNET_free (order_id);
    GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                "Sending payment request `%s'\n",
                hdr);
    GNUNET_break (MHD_YES ==
                  MHD_add_response_header (resp,
                                           ANASTASIS_HTTP_HEADER_TALER,
                                           hdr));
    GNUNET_free (hdr);
  }
  gc->resp = resp;
  gc->response_code = MHD_HTTP_PAYMENT_REQUIRED;
}


/**
 * Callbacks of this type are used to serve the result of submitting a
 * /contract request to a merchant.
 *
 * @param cls our `struct GetContext`
 * @param por response details
 */
static void
proposal_cb (void *cls,
             const struct TALER_MERCHANT_PostOrdersReply *por)
{
  struct GetContext *gc = cls;
  enum GNUNET_DB_QueryStatus qs;

  gc->po = NULL;
  GNUNET_assert (gc->in_list);
  GNUNET_CONTAINER_DLL_remove (gc_head,
                               gc_tail,
                               gc);
  gc->in_list = false;
  GNUNET_assert (gc->suspended);
  gc->suspended = false;
  MHD_resume_connection (gc->connection);
  AH_trigger_daemon (NULL);
  if (MHD_HTTP_OK != por->hr.http_status)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                "Backend returned status %u/%d\n",
                por->hr.http_status,
                (int) por->hr.ec);
    GNUNET_break (0);
    gc->resp = TALER_MHD_MAKE_JSON_PACK (
      GNUNET_JSON_pack_uint64 ("code",
                               TALER_EC_ANASTASIS_TRUTH_PAYMENT_CREATE_BACKEND_ERROR),
      GNUNET_JSON_pack_string ("hint",
                               "Failed to setup order with merchant backend"),
      GNUNET_JSON_pack_uint64 ("backend-ec",
                               por->hr.ec),
      GNUNET_JSON_pack_uint64 ("backend-http-status",
                               por->hr.http_status),
      GNUNET_JSON_pack_allow_null (
        GNUNET_JSON_pack_object_steal ("backend-reply",
                                       (json_t *) por->hr.reply)));
    gc->response_code = MHD_HTTP_BAD_GATEWAY;
    return;
  }
  qs = db->record_challenge_payment (db->cls,
                                     &gc->truth_uuid,
                                     &gc->payment_identifier,
                                     &gc->challenge_cost);
  if (0 >= qs)
  {
    GNUNET_break (0);
    gc->resp = TALER_MHD_make_error (TALER_EC_GENERIC_DB_STORE_FAILED,
                                     "record challenge payment");
    gc->response_code = MHD_HTTP_INTERNAL_SERVER_ERROR;
    return;
  }
  GNUNET_log (GNUNET_ERROR_TYPE_INFO,
              "Setup fresh order, creating payment request\n");
  make_payment_request (gc);
}


/**
 * Callback to process a GET /check-payment request
 *
 * @param cls our `struct GetContext`
 * @param hr HTTP response details
 * @param osr order status
 */
static void
check_payment_cb (void *cls,
                  const struct TALER_MERCHANT_HttpResponse *hr,
                  const struct TALER_MERCHANT_OrderStatusResponse *osr)

{
  struct GetContext *gc = cls;

  gc->cpo = NULL;
  GNUNET_assert (gc->in_list);
  GNUNET_CONTAINER_DLL_remove (gc_head,
                               gc_tail,
                               gc);
  gc->in_list = false;
  GNUNET_assert (gc->suspended);
  gc->suspended = false;
  MHD_resume_connection (gc->connection);
  AH_trigger_daemon (NULL);

  switch (hr->http_status)
  {
  case MHD_HTTP_OK:
    GNUNET_assert (NULL != osr);
    break;
  case MHD_HTTP_NOT_FOUND:
    /* We created this order before, how can it be not found now? */
    GNUNET_break (0);
    gc->resp = TALER_MHD_make_error (TALER_EC_ANASTASIS_TRUTH_ORDER_DISAPPEARED,
                                     NULL);
    gc->response_code = MHD_HTTP_BAD_GATEWAY;
    return;
  case MHD_HTTP_BAD_GATEWAY:
    gc->resp = TALER_MHD_make_error (
      TALER_EC_ANASTASIS_TRUTH_BACKEND_EXCHANGE_BAD,
      NULL);
    gc->response_code = MHD_HTTP_BAD_GATEWAY;
    return;
  case MHD_HTTP_GATEWAY_TIMEOUT:
    gc->resp = TALER_MHD_make_error (TALER_EC_ANASTASIS_GENERIC_BACKEND_TIMEOUT,
                                     "Timeout check payment status");
    GNUNET_assert (NULL != gc->resp);
    gc->response_code = MHD_HTTP_GATEWAY_TIMEOUT;
    return;
  default:
    {
      char status[14];

      GNUNET_snprintf (status,
                       sizeof (status),
                       "%u",
                       hr->http_status);
      gc->resp = TALER_MHD_make_error (
        TALER_EC_ANASTASIS_TRUTH_UNEXPECTED_PAYMENT_STATUS,
        status);
      GNUNET_assert (NULL != gc->resp);
      gc->response_code = MHD_HTTP_INTERNAL_SERVER_ERROR;
      return;
    }
  }

  switch (osr->status)
  {
  case TALER_MERCHANT_OSC_PAID:
    {
      enum GNUNET_DB_QueryStatus qs;

      qs = db->update_challenge_payment (db->cls,
                                         &gc->truth_uuid,
                                         &gc->payment_identifier);
      if (0 <= qs)
      {
        GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                    "Order has been paid, continuing with request processing\n");
        return; /* continue as planned */
      }
      GNUNET_break (0);
      gc->resp = TALER_MHD_make_error (TALER_EC_GENERIC_DB_STORE_FAILED,
                                       "update challenge payment");
      gc->response_code = MHD_HTTP_INTERNAL_SERVER_ERROR;
      return; /* continue as planned */
    }
  case TALER_MERCHANT_OSC_CLAIMED:
  case TALER_MERCHANT_OSC_UNPAID:
    /* repeat payment request */
    GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                "Order remains unpaid, sending payment request again\n");
    make_payment_request (gc);
    return;
  }
  /* should never get here */
  GNUNET_break (0);
}


/**
 * Helper function used to ask our backend to begin processing a
 * payment for the user's account.  May perform asynchronous
 * operations by suspending the connection if required.
 *
 * @param gc context to begin payment for.
 * @return MHD status code
 */
static MHD_RESULT
begin_payment (struct GetContext *gc)
{
  enum GNUNET_DB_QueryStatus qs;
  char *order_id;

  qs = db->lookup_challenge_payment (db->cls,
                                     &gc->truth_uuid,
                                     &gc->payment_identifier);
  if (qs < 0)
  {
    GNUNET_break (0);
    return TALER_MHD_reply_with_error (gc->connection,
                                       MHD_HTTP_INTERNAL_SERVER_ERROR,
                                       TALER_EC_GENERIC_DB_FETCH_FAILED,
                                       "lookup challenge payment");
  }
  GNUNET_assert (! gc->in_list);
  gc->in_list = true;
  GNUNET_CONTAINER_DLL_insert (gc_tail,
                               gc_head,
                               gc);
  GNUNET_assert (! gc->suspended);
  gc->suspended = true;
  MHD_suspend_connection (gc->connection);
  if (GNUNET_DB_STATUS_SUCCESS_ONE_RESULT == qs)
  {
    /* We already created the order, check if it was paid */
    struct GNUNET_TIME_Relative timeout;

    order_id = GNUNET_STRINGS_data_to_string_alloc (
      &gc->payment_identifier,
      sizeof (gc->payment_identifier));
    GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                "Order exists, checking payment status for order `%s'\n",
                order_id);
    timeout = GNUNET_TIME_absolute_get_remaining (gc->timeout);
    gc->cpo = TALER_MERCHANT_merchant_order_get (AH_ctx,
                                                 AH_backend_url,
                                                 order_id,
                                                 NULL /* NOT session-bound */,
                                                 false,
                                                 timeout,
                                                 &check_payment_cb,
                                                 gc);
  }
  else
  {
    /* Create a fresh order */
    json_t *order;
    struct GNUNET_TIME_Absolute pay_deadline;

    GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_WEAK,
                                &gc->payment_identifier,
                                sizeof (struct ANASTASIS_PaymentSecretP));
    order_id = GNUNET_STRINGS_data_to_string_alloc (
      &gc->payment_identifier,
      sizeof (gc->payment_identifier));
    GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                "Creating fresh order `%s'\n",
                order_id);
    pay_deadline = GNUNET_TIME_relative_to_absolute (
      ANASTASIS_CHALLENGE_OFFER_LIFETIME);
    GNUNET_TIME_round_abs (&pay_deadline);
    order = GNUNET_JSON_PACK (
      TALER_JSON_pack_amount ("amount",
                              &gc->challenge_cost),
      GNUNET_JSON_pack_string ("summary",
                               "challenge fee for anastasis service"),
      GNUNET_JSON_pack_string ("order_id",
                               order_id),
      GNUNET_JSON_pack_time_rel ("auto_refund",
                                 AUTO_REFUND_TIMEOUT),
      GNUNET_JSON_pack_time_abs ("pay_deadline",
                                 pay_deadline));
    gc->po = TALER_MERCHANT_orders_post2 (AH_ctx,
                                          AH_backend_url,
                                          order,
                                          AUTO_REFUND_TIMEOUT,
                                          NULL, /* no payment target */
                                          0,
                                          NULL, /* no inventory products */
                                          0,
                                          NULL, /* no uuids */
                                          false, /* do NOT require claim token */
                                          &proposal_cb,
                                          gc);
    json_decref (order);
  }
  GNUNET_free (order_id);
  AH_trigger_curl ();
  return MHD_YES;
}


/**
 * Load encrypted keyshare from db and return it to the client.
 *
 * @param truth_uuid UUID to the truth for the looup
 * @param connection the connection to respond upon
 * @return MHD status code
 */
static MHD_RESULT
return_key_share (
  const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
  struct MHD_Connection *connection)
{
  struct ANASTASIS_CRYPTO_EncryptedKeyShareP encrypted_keyshare;

  {
    enum GNUNET_DB_QueryStatus qs;

    qs = db->get_key_share (db->cls,
                            truth_uuid,
                            &encrypted_keyshare);
    switch (qs)
    {
    case GNUNET_DB_STATUS_HARD_ERROR:
    case GNUNET_DB_STATUS_SOFT_ERROR:
      GNUNET_break (0);
      return TALER_MHD_reply_with_error (connection,
                                         MHD_HTTP_INTERNAL_SERVER_ERROR,
                                         TALER_EC_GENERIC_DB_FETCH_FAILED,
                                         "get key share");
    case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
      return TALER_MHD_reply_with_error (connection,
                                         MHD_HTTP_NOT_FOUND,
                                         TALER_EC_ANASTASIS_TRUTH_KEY_SHARE_GONE,
                                         NULL);
    case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
      break;
    }
  }

  GNUNET_log (GNUNET_ERROR_TYPE_INFO,
              "Returning key share\n");
  {
    struct MHD_Response *resp;
    MHD_RESULT ret;

    resp = MHD_create_response_from_buffer (sizeof (encrypted_keyshare),
                                            &encrypted_keyshare,
                                            MHD_RESPMEM_MUST_COPY);
    TALER_MHD_add_global_headers (resp);
    ret = MHD_queue_response (connection,
                              MHD_HTTP_OK,
                              resp);
    MHD_destroy_response (resp);
    return ret;
  }
}


/**
 * Mark @a gc as suspended and update the respective
 * data structures and jobs.
 *
 * @param[in,out] gc context of the suspended operation
 */
static void
gc_suspended (struct GetContext *gc)
{
  gc->suspended = true;
  if (NULL == AH_to_heap)
    AH_to_heap = GNUNET_CONTAINER_heap_create (
      GNUNET_CONTAINER_HEAP_ORDER_MIN);
  gc->hn = GNUNET_CONTAINER_heap_insert (AH_to_heap,
                                         gc,
                                         gc->timeout.abs_value_us);
  if (NULL != to_task)
  {
    GNUNET_SCHEDULER_cancel (to_task);
    to_task = NULL;
  }
  {
    struct GetContext *rn;

    rn = GNUNET_CONTAINER_heap_peek (AH_to_heap);
    to_task = GNUNET_SCHEDULER_add_at (rn->timeout,
                                       &do_timeout,
                                       NULL);
  }
}


/**
 * Run the authorization method-specific 'process' function and continue
 * based on its result with generating an HTTP response.
 *
 * @param connection the connection we are handling
 * @param gc our overall handler context
 */
static MHD_RESULT
run_authorization_process (struct MHD_Connection *connection,
                           struct GetContext *gc)
{
  enum ANASTASIS_AUTHORIZATION_Result ret;
  enum GNUNET_DB_QueryStatus qs;

  GNUNET_assert (! gc->suspended);
  ret = gc->authorization->process (gc->as,
                                    gc->timeout,
                                    connection);
  switch (ret)
  {
  case ANASTASIS_AUTHORIZATION_RES_SUCCESS:
    /* Challenge sent successfully */
    GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                "Authorization request sent successfully\n");
    qs = db->mark_challenge_sent (db->cls,
                                  &gc->payment_identifier,
                                  &gc->truth_uuid,
                                  gc->code);
    GNUNET_break (0 < qs);
    gc->authorization->cleanup (gc->as);
    gc->as = NULL;
    return MHD_YES;
  case ANASTASIS_AUTHORIZATION_RES_FAILED:
    if (gc->payment_identifier_provided)
    {
      begin_refund (gc);
    }
    gc->authorization->cleanup (gc->as);
    gc->as = NULL;
    return MHD_YES;
  case ANASTASIS_AUTHORIZATION_RES_SUSPENDED:
    /* connection was suspended */
    gc_suspended (gc);
    return MHD_YES;
  case ANASTASIS_AUTHORIZATION_RES_SUCCESS_REPLY_FAILED:
    /* Challenge sent successfully */
    qs = db->mark_challenge_sent (db->cls,
                                  &gc->payment_identifier,
                                  &gc->truth_uuid,
                                  gc->code);
    GNUNET_break (0 < qs);
    gc->authorization->cleanup (gc->as);
    gc->as = NULL;
    return MHD_NO;
  case ANASTASIS_AUTHORIZATION_RES_FAILED_REPLY_FAILED:
    gc->authorization->cleanup (gc->as);
    gc->as = NULL;
    return MHD_NO;
  case ANASTASIS_AUTHORIZATION_RES_FINISHED:
    GNUNET_assert (! gc->suspended);
    gc->authorization->cleanup (gc->as);
    gc->as = NULL;
    GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                "Resuming with authorization successful!\n");
    if (gc->in_list)
    {
      GNUNET_CONTAINER_DLL_remove (gc_head,
                                   gc_tail,
                                   gc);
      gc->in_list = false;
    }
    return MHD_YES;
  }
  GNUNET_break (0);
  return MHD_NO;
}


/**
 * Use the database to rate-limit queries to the
 * authentication procedure, but without actually
 * storing 'real' challenge codes.
 *
 * @param[in,out] gc context to rate limit requests for
 * @return #GNUNET_OK if rate-limiting passes,
 *         #GNUNET_NO if a reply was sent (rate limited)
 *         #GNUNET_SYSERR if we failed and no reply
 *                        was queued
 */
static enum GNUNET_GenericReturnValue
rate_limit (struct GetContext *gc)
{
  enum GNUNET_DB_QueryStatus qs;
  struct GNUNET_TIME_Absolute rt;
  uint64_t code;
  enum ANASTASIS_DB_CodeStatus cs;
  struct GNUNET_HashCode hc;
  bool satisfied;
  uint64_t dummy;

  rt = GNUNET_TIME_UNIT_FOREVER_ABS;
  qs = db->create_challenge_code (db->cls,
                                  &gc->truth_uuid,
                                  MAX_QUESTION_FREQ,
                                  GNUNET_TIME_UNIT_HOURS,
                                  INITIAL_RETRY_COUNTER,
                                  &rt,
                                  &code);
  if (0 > qs)
  {
    GNUNET_break (0 < qs);
    return (MHD_YES ==
            TALER_MHD_reply_with_error (gc->connection,
                                        MHD_HTTP_INTERNAL_SERVER_ERROR,
                                        TALER_EC_GENERIC_DB_FETCH_FAILED,
                                        "create_challenge_code (for rate limiting)"))
      ? GNUNET_NO
      : GNUNET_SYSERR;
  }
  if (GNUNET_DB_STATUS_SUCCESS_NO_RESULTS == qs)
  {
    return (MHD_YES ==
            TALER_MHD_reply_with_error (gc->connection,
                                        MHD_HTTP_TOO_MANY_REQUESTS,
                                        TALER_EC_ANASTASIS_TRUTH_RATE_LIMITED,
                                        NULL))
      ? GNUNET_NO
      : GNUNET_SYSERR;
  }
  /* decrement trial counter */
  ANASTASIS_hash_answer (code + 1,      /* always use wrong answer */
                         &hc);
  cs = db->verify_challenge_code (db->cls,
                                  &gc->truth_uuid,
                                  &hc,
                                  &dummy,
                                  &satisfied);
  switch (cs)
  {
  case ANASTASIS_DB_CODE_STATUS_CHALLENGE_CODE_MISMATCH:
    /* good, what we wanted */
    return GNUNET_OK;
  case ANASTASIS_DB_CODE_STATUS_HARD_ERROR:
  case ANASTASIS_DB_CODE_STATUS_SOFT_ERROR:
    GNUNET_break (0);
    return (MHD_YES ==
            TALER_MHD_reply_with_error (gc->connection,
                                        MHD_HTTP_INTERNAL_SERVER_ERROR,
                                        TALER_EC_GENERIC_DB_FETCH_FAILED,
                                        "verify_challenge_code"))
      ? GNUNET_NO
      : GNUNET_SYSERR;
  case ANASTASIS_DB_CODE_STATUS_NO_RESULTS:
    return (MHD_YES ==
            TALER_MHD_reply_with_error (gc->connection,
                                        MHD_HTTP_TOO_MANY_REQUESTS,
                                        TALER_EC_ANASTASIS_TRUTH_RATE_LIMITED,
                                        NULL))
      ? GNUNET_NO
      : GNUNET_SYSERR;
  case ANASTASIS_DB_CODE_STATUS_VALID_CODE_STORED:
    /* this should be impossible, we used code+1 */
    GNUNET_assert (0);
  }
  return GNUNET_SYSERR;
}


/**
 * Handle special case of a security question where we do not
 * generate a code. Rate limits answers against brute forcing.
 *
 * @param[in,out] gc request to handle
 * @param decrypted_truth hash to check against
 * @param decrypted_truth_size number of bytes in @a decrypted_truth
 * @return MHD status code
 */
static MHD_RESULT
handle_security_question (struct GetContext *gc,
                          const void *decrypted_truth,
                          size_t decrypted_truth_size)
{
  GNUNET_log (GNUNET_ERROR_TYPE_INFO,
              "Handling security question challenge\n");
  if (! gc->have_response)
  {
    return TALER_MHD_reply_with_error (gc->connection,
                                       MHD_HTTP_FORBIDDEN,
                                       TALER_EC_ANASTASIS_TRUTH_CHALLENGE_RESPONSE_REQUIRED,
                                       NULL);
  }
  /* rate limit */
  {
    enum GNUNET_GenericReturnValue ret;

    ret = rate_limit (gc);
    if (GNUNET_OK != ret)
      return (GNUNET_NO == ret) ? MHD_YES : MHD_NO;
  }
  /* check reply matches truth */
  if ( (decrypted_truth_size != sizeof (struct GNUNET_HashCode)) ||
       (0 != memcmp (&gc->challenge_response,
                     decrypted_truth,
                     decrypted_truth_size)) )
  {
    GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                "Wrong answer provided to secure question had %u bytes, wanted %u\n",
                (unsigned int) decrypted_truth_size,
                (unsigned int) sizeof (struct GNUNET_HashCode));
    return TALER_MHD_reply_with_error (gc->connection,
                                       MHD_HTTP_FORBIDDEN,
                                       TALER_EC_ANASTASIS_TRUTH_CHALLENGE_FAILED,
                                       NULL);
  }
  /* good, return the key share */
  return return_key_share (&gc->truth_uuid,
                           gc->connection);
}


/**
 * Handle special case of an answer being directly checked by the
 * plugin and not by our database. Rate limits answers against brute
 * forcing.
 *
 * @param[in,out] gc request to handle
 * @param decrypted_truth hash to check against
 * @param decrypted_truth_size number of bytes in @a decrypted_truth
 * @return MHD status code
 */
static MHD_RESULT
direct_validation (struct GetContext *gc,
                   const void *decrypted_truth,
                   size_t decrypted_truth_size)
{
  /* Non-random code, call plugin directly! */
  enum ANASTASIS_AUTHORIZATION_Result aar;
  enum GNUNET_GenericReturnValue res;

  res = rate_limit (gc);
  if (GNUNET_OK != res)
    return (GNUNET_NO == res) ? MHD_YES : MHD_NO;
  gc->as = gc->authorization->start (gc->authorization->cls,
                                     &AH_trigger_daemon,
                                     NULL,
                                     &gc->truth_uuid,
                                     0LLU,
                                     decrypted_truth,
                                     decrypted_truth_size);
  if (NULL == gc->as)
  {
    GNUNET_break (0);
    return TALER_MHD_reply_with_error (gc->connection,
                                       MHD_HTTP_INTERNAL_SERVER_ERROR,
                                       TALER_EC_ANASTASIS_TRUTH_AUTHORIZATION_START_FAILED,
                                       NULL);
  }
  aar = gc->authorization->process (gc->as,
                                    GNUNET_TIME_UNIT_ZERO_ABS,
                                    gc->connection);
  switch (aar)
  {
  case ANASTASIS_AUTHORIZATION_RES_SUCCESS:
    GNUNET_break (0);
    return MHD_YES;
  case ANASTASIS_AUTHORIZATION_RES_FAILED:
    return MHD_YES;
  case ANASTASIS_AUTHORIZATION_RES_SUSPENDED:
    gc_suspended (gc);
    return MHD_YES;
  case ANASTASIS_AUTHORIZATION_RES_SUCCESS_REPLY_FAILED:
    GNUNET_break (0);
    return MHD_NO;
  case ANASTASIS_AUTHORIZATION_RES_FAILED_REPLY_FAILED:
    return MHD_NO;
  case ANASTASIS_AUTHORIZATION_RES_FINISHED:
    return return_key_share (&gc->truth_uuid,
                             gc->connection);
  }
  GNUNET_break (0);
  return MHD_NO;
}


MHD_RESULT
AH_handler_truth_get (
  struct MHD_Connection *connection,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
  struct TM_HandlerContext *hc)
{
  struct GetContext *gc = hc->ctx;
  void *encrypted_truth;
  size_t encrypted_truth_size;
  void *decrypted_truth;
  size_t decrypted_truth_size;
  char *truth_mime = NULL;
  bool is_question;

  if (NULL == gc)
  {
    /* Fresh request, do initial setup */
    gc = GNUNET_new (struct GetContext);
    gc->hc = hc;
    hc->ctx = gc;
    gc->connection = connection;
    gc->truth_uuid = *truth_uuid;
    gc->hc->cc = &request_done;
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
              &gc->payment_identifier,
              sizeof (struct ANASTASIS_PaymentSecretP)))
        {
          GNUNET_break_op (0);
          return TALER_MHD_reply_with_error (connection,
                                             MHD_HTTP_BAD_REQUEST,
                                             TALER_EC_GENERIC_PARAMETER_MALFORMED,
                                             ANASTASIS_HTTP_HEADER_PAYMENT_IDENTIFIER);
        }
        gc->payment_identifier_provided = true;
        GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                    "Client provided payment identifier `%s'\n",
                    pay_id);
      }
    }

    {
      /* check if header contains Truth-Decryption-Key */
      const char *tdk;

      tdk = MHD_lookup_connection_value (connection,
                                         MHD_HEADER_KIND,
                                         ANASTASIS_HTTP_HEADER_TRUTH_DECRYPTION_KEY);
      if (NULL == tdk)
      {
        GNUNET_break_op (0);
        return TALER_MHD_reply_with_error (connection,
                                           MHD_HTTP_BAD_REQUEST,
                                           TALER_EC_GENERIC_PARAMETER_MISSING,
                                           ANASTASIS_HTTP_HEADER_TRUTH_DECRYPTION_KEY);
      }

      if (GNUNET_OK !=
          GNUNET_STRINGS_string_to_data (
            tdk,
            strlen (tdk),
            &gc->truth_key,
            sizeof (struct ANASTASIS_CRYPTO_TruthKeyP)))
      {
        GNUNET_break_op (0);
        return TALER_MHD_reply_with_error (connection,
                                           MHD_HTTP_BAD_REQUEST,
                                           TALER_EC_GENERIC_PARAMETER_MALFORMED,
                                           ANASTASIS_HTTP_HEADER_TRUTH_DECRYPTION_KEY);
      }
    }

    {
      const char *challenge_response_s;

      challenge_response_s = MHD_lookup_connection_value (connection,
                                                          MHD_GET_ARGUMENT_KIND,
                                                          "response");
      if ( (NULL != challenge_response_s) &&
           (GNUNET_OK !=
            GNUNET_CRYPTO_hash_from_string (challenge_response_s,
                                            &gc->challenge_response)) )
      {
        GNUNET_break_op (0);
        return TALER_MHD_reply_with_error (connection,
                                           MHD_HTTP_BAD_REQUEST,
                                           TALER_EC_GENERIC_PARAMETER_MALFORMED,
                                           "response");
      }
      gc->have_response = (NULL != challenge_response_s);
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
        gc->timeout
          = GNUNET_TIME_relative_to_absolute (GNUNET_TIME_relative_multiply (
                                                GNUNET_TIME_UNIT_MILLISECONDS,
                                                timeout));
      }
      else
      {
        gc->timeout = GNUNET_TIME_relative_to_absolute (
          GNUNET_TIME_UNIT_SECONDS);
      }
    }
  } /* end of first-time initialization (if NULL == gc) */
  else
  {
    /* might have been woken up by authorization plugin,
       so clear the flag. MDH called us, so we are
       clearly no longer suspended */
    gc->suspended = false;
    if (NULL != gc->resp)
    {
      MHD_RESULT ret;

      /* We generated a response asynchronously, queue that */
      ret = MHD_queue_response (connection,
                                gc->response_code,
                                gc->resp);
      GNUNET_break (MHD_YES == ret);
      MHD_destroy_response (gc->resp);
      gc->resp = NULL;
      return ret;
    }
    if (NULL != gc->as)
    {
      /* Authorization process is "running", check what is going on */
      GNUNET_assert (NULL != gc->authorization);
      GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                  "Continuing with running the authorization process\n");
      GNUNET_assert (! gc->suspended);
      return run_authorization_process (connection,
                                        gc);

    }
    /* We get here if the async check for payment said this request
       was indeed paid! */
  }

  {
    /* load encrypted truth from DB */
    enum GNUNET_DB_QueryStatus qs;
    char *method;

    qs = db->get_escrow_challenge (db->cls,
                                   &gc->truth_uuid,
                                   &encrypted_truth,
                                   &encrypted_truth_size,
                                   &truth_mime,
                                   &method);
    switch (qs)
    {
    case GNUNET_DB_STATUS_HARD_ERROR:
    case GNUNET_DB_STATUS_SOFT_ERROR:
      GNUNET_break (0);
      return TALER_MHD_reply_with_error (gc->connection,
                                         MHD_HTTP_INTERNAL_SERVER_ERROR,
                                         TALER_EC_GENERIC_DB_FETCH_FAILED,
                                         "get escrow challenge");
    case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
      return TALER_MHD_reply_with_error (connection,
                                         MHD_HTTP_NOT_FOUND,
                                         TALER_EC_ANASTASIS_TRUTH_UNKNOWN,
                                         NULL);
    case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
      break;
    }
    is_question = (0 == strcmp ("question",
                                method));
    if (! is_question)
    {
      gc->authorization
        = ANASTASIS_authorization_plugin_load (method,
                                               db,
                                               AH_cfg);
      if (NULL == gc->authorization)
      {
        MHD_RESULT ret;

        ret = TALER_MHD_reply_with_error (
          connection,
          MHD_HTTP_INTERNAL_SERVER_ERROR,
          TALER_EC_ANASTASIS_TRUTH_AUTHORIZATION_METHOD_NO_LONGER_SUPPORTED,
          method);
        GNUNET_free (encrypted_truth);
        GNUNET_free (truth_mime);
        GNUNET_free (method);
        return ret;
      }
      gc->challenge_cost = gc->authorization->cost;
    }
    else
    {
      gc->challenge_cost = AH_question_cost;
    }
    GNUNET_free (method);
  }

  if ( (is_question) ||
       (! gc->authorization->payment_plugin_managed) )
  {
    if (! TALER_amount_is_zero (&gc->challenge_cost))
    {
      /* Check database to see if the transaction is paid for */
      enum GNUNET_DB_QueryStatus qs;
      bool paid;

      if (! gc->payment_identifier_provided)
      {
        GNUNET_free (truth_mime);
        GNUNET_free (encrypted_truth);
        GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                    "Beginning payment, client did not provide payment identifier\n");
        return begin_payment (gc);
      }
      qs = db->check_challenge_payment (db->cls,
                                        &gc->payment_identifier,
                                        &gc->truth_uuid,
                                        &paid);
      switch (qs)
      {
      case GNUNET_DB_STATUS_HARD_ERROR:
      case GNUNET_DB_STATUS_SOFT_ERROR:
        GNUNET_break (0);
        GNUNET_free (truth_mime);
        GNUNET_free (encrypted_truth);
        return TALER_MHD_reply_with_error (gc->connection,
                                           MHD_HTTP_INTERNAL_SERVER_ERROR,
                                           TALER_EC_GENERIC_DB_FETCH_FAILED,
                                           "check challenge payment");
      case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
        /* Create fresh payment identifier (cannot trust client) */
        GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                    "Client-provided payment identifier is unknown.\n");
        GNUNET_free (truth_mime);
        GNUNET_free (encrypted_truth);
        return begin_payment (gc);
      case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
        if (! paid)
        {
          GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                      "Payment identifier known. Checking payment with client's payment identifier\n");
          GNUNET_free (truth_mime);
          GNUNET_free (encrypted_truth);
          return begin_payment (gc);
        }
        GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                    "Payment confirmed\n");
        break;
      }
    }
    else
    {
      GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                  "Request is free of charge\n");
    }
  }

  /* We've been paid, now validate response */
  {
    /* decrypt encrypted_truth */
    ANASTASIS_CRYPTO_truth_decrypt (&gc->truth_key,
                                    encrypted_truth,
                                    encrypted_truth_size,
                                    &decrypted_truth,
                                    &decrypted_truth_size);
    GNUNET_free (encrypted_truth);
  }
  if (NULL == decrypted_truth)
  {
    GNUNET_free (truth_mime);
    return TALER_MHD_reply_with_error (connection,
                                       MHD_HTTP_EXPECTATION_FAILED,
                                       TALER_EC_ANASTASIS_TRUTH_DECRYPTION_FAILED,
                                       NULL);
  }

  /* Special case for secure question: we do not generate a numeric challenge,
     but check that the hash matches */
  if (is_question)
  {
    MHD_RESULT ret;

    ret = handle_security_question (gc,
                                    decrypted_truth,
                                    decrypted_truth_size);
    GNUNET_free (truth_mime);
    GNUNET_free (decrypted_truth);
    return ret;
  }

  /* Not security question, check for answer in DB */
  if (gc->have_response)
  {
    enum ANASTASIS_DB_CodeStatus cs;
    bool satisfied;
    uint64_t code;

    GNUNET_free (truth_mime);
    if (gc->authorization->user_provided_code)
    {
      MHD_RESULT res;

      res = direct_validation (gc,
                               decrypted_truth,
                               decrypted_truth_size);
      GNUNET_free (decrypted_truth);
      return res;
    }

    /* random code, check against database */
    cs = db->verify_challenge_code (db->cls,
                                    &gc->truth_uuid,
                                    &gc->challenge_response,
                                    &code,
                                    &satisfied);
    switch (cs)
    {
    case ANASTASIS_DB_CODE_STATUS_CHALLENGE_CODE_MISMATCH:
      GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                  "Provided response does not match our stored challenge\n");
      GNUNET_free (decrypted_truth);
      return TALER_MHD_reply_with_error (connection,
                                         MHD_HTTP_FORBIDDEN,
                                         TALER_EC_ANASTASIS_TRUTH_CHALLENGE_FAILED,
                                         NULL);
    case ANASTASIS_DB_CODE_STATUS_HARD_ERROR:
    case ANASTASIS_DB_CODE_STATUS_SOFT_ERROR:
      GNUNET_break (0);
      GNUNET_free (decrypted_truth);
      return TALER_MHD_reply_with_error (gc->connection,
                                         MHD_HTTP_INTERNAL_SERVER_ERROR,
                                         TALER_EC_GENERIC_DB_FETCH_FAILED,
                                         "verify_challenge_code");
    case ANASTASIS_DB_CODE_STATUS_NO_RESULTS:
      GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                  "Response code unknown (possibly expired). Testing if we may provide a new one.\n");
      gc->have_response = false;
      break;
    case ANASTASIS_DB_CODE_STATUS_VALID_CODE_STORED:
      GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                  "Response code valid (%s)\n",
                  satisfied ? "satisfied" : "unsatisfied");
      if (satisfied)
      {
        GNUNET_free (decrypted_truth);
        return return_key_share (&gc->truth_uuid,
                                 connection);
      }
      /* continue with authorization plugin below */
      gc->code = code;
      break;
    default:
      GNUNET_break (0);
      return MHD_NO;
    }
  }
  if (! gc->have_response)
  {
    /* Not security question and no answer: use plugin to check if
       decrypted truth is a valid challenge! */
    GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                "No challenge provided, creating fresh challenge\n");
    {
      enum GNUNET_GenericReturnValue ret;

      ret = gc->authorization->validate (gc->authorization->cls,
                                         connection,
                                         truth_mime,
                                         decrypted_truth,
                                         decrypted_truth_size);
      GNUNET_free (truth_mime);
      switch (ret)
      {
      case GNUNET_OK:
        /* data valid, continued below */
        break;
      case GNUNET_NO:
        /* data invalid, reply was queued */
        GNUNET_free (decrypted_truth);
        return MHD_YES;
      case GNUNET_SYSERR:
        /* data invalid, reply was NOT queued */
        GNUNET_free (decrypted_truth);
        return MHD_NO;
      }
    }

    /* Setup challenge and begin authorization process */
    {
      struct GNUNET_TIME_Absolute transmission_date;
      enum GNUNET_DB_QueryStatus qs;

      qs = db->create_challenge_code (db->cls,
                                      &gc->truth_uuid,
                                      gc->authorization->code_rotation_period,
                                      gc->authorization->code_validity_period,
                                      gc->authorization->retry_counter,
                                      &transmission_date,
                                      &gc->code);
      switch (qs)
      {
      case GNUNET_DB_STATUS_HARD_ERROR:
      case GNUNET_DB_STATUS_SOFT_ERROR:
        GNUNET_break (0);
        GNUNET_free (decrypted_truth);
        return TALER_MHD_reply_with_error (gc->connection,
                                           MHD_HTTP_INTERNAL_SERVER_ERROR,
                                           TALER_EC_GENERIC_DB_FETCH_FAILED,
                                           "create_challenge_code");
      case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
        /* 0 == retry_counter of existing challenge => rate limit exceeded */
        GNUNET_free (decrypted_truth);
        return TALER_MHD_reply_with_error (connection,
                                           MHD_HTTP_TOO_MANY_REQUESTS,
                                           TALER_EC_ANASTASIS_TRUTH_RATE_LIMITED,
                                           NULL);
      case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
        /* challenge code was stored successfully*/
        GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                    "Created fresh challenge\n");
        break;
      }

      if (GNUNET_TIME_absolute_get_duration (transmission_date).rel_value_us <
          gc->authorization->code_retransmission_frequency.rel_value_us)
      {
        /* Too early for a retransmission! */
        GNUNET_free (decrypted_truth);
        return TALER_MHD_reply_with_error (gc->connection,
                                           MHD_HTTP_ALREADY_REPORTED,
                                           TALER_EC_ANASTASIS_TRUTH_CHALLENGE_ACTIVE,
                                           NULL);
      }
    }
  }

  GNUNET_log (GNUNET_ERROR_TYPE_INFO,
              "Beginning authorization process\n");
  gc->as = gc->authorization->start (gc->authorization->cls,
                                     &AH_trigger_daemon,
                                     NULL,
                                     &gc->truth_uuid,
                                     gc->code,
                                     decrypted_truth,
                                     decrypted_truth_size);
  GNUNET_free (decrypted_truth);
  if (NULL == gc->as)
  {
    GNUNET_break (0);
    return TALER_MHD_reply_with_error (gc->connection,
                                       MHD_HTTP_INTERNAL_SERVER_ERROR,
                                       TALER_EC_ANASTASIS_TRUTH_AUTHORIZATION_START_FAILED,
                                       NULL);
  }
  if (! gc->in_list)
  {
    gc->in_list = true;
    GNUNET_CONTAINER_DLL_insert (gc_head,
                                 gc_tail,
                                 gc);
  }
  GNUNET_assert (! gc->suspended);
  return run_authorization_process (connection,
                                    gc);
}
