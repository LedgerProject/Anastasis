/*
  This file is part of Anastasis
  Copyright (C) 2019 Anastasis SARL

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
 * @file backend/anastasis-httpd.h
 * @brief HTTP serving layer
 * @author Christian Grothoff
 */
#ifndef ANASTASIS_HTTPD_H
#define ANASTASIS_HTTPD_H

#include "platform.h"
#include "anastasis_database_lib.h"
#include <microhttpd.h>
#include <taler/taler_mhd_lib.h>
#include <gnunet/gnunet_mhd_compat.h>


/**
 * For how many years do we allow users to store truth at most? Also
 * how long we store things if the cost is zero.
 */
#define ANASTASIS_MAX_YEARS_STORAGE 5


/**
 * @brief Struct describing an URL and the handler for it.
 */
struct AH_RequestHandler
{

  /**
   * URL the handler is for.
   */
  const char *url;

  /**
   * Method the handler is for, NULL for "all".
   */
  const char *method;

  /**
   * Mime type to use in reply (hint, can be NULL).
   */
  const char *mime_type;

  /**
   * Raw data for the @e handler
   */
  const void *data;

  /**
   * Number of bytes in @e data, 0 for 0-terminated.
   */
  size_t data_size;


  /**
   * Function to call to handle the request.
   *
   * @param rh this struct
   * @param connection the MHD connection to handle
   * @return MHD result code
   */
  MHD_RESULT (*handler)(struct AH_RequestHandler *rh,
                        struct MHD_Connection *connection);

  /**
   * Default response code.
   */
  unsigned int response_code;
};


/**
 * Each MHD response handler that sets the "connection_cls" to a
 * non-NULL value must use a struct that has this struct as its first
 * member.  This struct contains a single callback, which will be
 * invoked to clean up the memory when the contection is completed.
 */
struct TM_HandlerContext;

/**
 * Signature of a function used to clean up the context
 * we keep in the "connection_cls" of MHD when handling
 * a request.
 *
 * @param hc header of the context to clean up.
 */
typedef void
(*TM_ContextCleanup)(struct TM_HandlerContext *hc);


/**
 * Each MHD response handler that sets the "connection_cls" to a
 * non-NULL value must use a struct that has this struct as its first
 * member.  This struct contains a single callback, which will be
 * invoked to clean up the memory when the connection is completed.
 */
struct TM_HandlerContext
{

  /**
   * Function to execute the handler-specific cleanup of the
   * (typically larger) context.
   */
  TM_ContextCleanup cc;

  /**
   * Handler-specific context.
   */
  void *ctx;

  /**
   * Which request handler is handling this request?
   */
  const struct AH_RequestHandler *rh;

  /**
   * URL requested by the client, for logging.
   */
  const char *url;

  /**
   * Asynchronous request context id.
   */
  struct GNUNET_AsyncScopeId async_scope_id;
};

/**
 * Handle to the database backend.
 */
extern struct ANASTASIS_DatabasePlugin *db;

/**
 * Upload limit to the service, in megabytes.
 */
extern unsigned long long AH_upload_limit_mb;

/**
 * Annual fee for the backup account.
 */
extern struct TALER_Amount AH_annual_fee;

/**
 * Fee for a truth upload.
 */
extern struct TALER_Amount AH_truth_upload_fee;

/**
 * Amount of insurance.
 */
extern struct TALER_Amount AH_insurance;

/**
 * Cost for secure question truth download.
 */
extern struct TALER_Amount AH_question_cost;

/**
 * Our Taler backend to process payments.
 */
extern char *AH_backend_url;

/**
 * Taler currency.
 */
extern char *AH_currency;

/**
 * Heap for processing timeouts of requests.
 */
extern struct GNUNET_CONTAINER_Heap *AH_to_heap;

/**
 * Our configuration.
 */
extern const struct GNUNET_CONFIGURATION_Handle *AH_cfg;

/**
 * Number of policy uploads permitted per annual fee payment.
 */
extern unsigned long long AH_post_counter;

/**
 * Our fulfillment URL
 */
extern char *AH_fulfillment_url;

/**
 * Our business name.
 */
extern char *AH_business_name;

/**
 * Our server salt.
 */
extern struct ANASTASIS_CRYPTO_ProviderSaltP AH_server_salt;

/**
 * Our context for making HTTP requests.
 */
extern struct GNUNET_CURL_Context *AH_ctx;


/**
 * Kick MHD to run now, to be called after MHD_resume_connection().
 * Basically, we need to explicitly resume MHD's event loop whenever
 * we made progress serving a request.  This function re-schedules
 * the task processing MHD's activities to run immediately.
 *
 * @param cls NULL
 */
void
AH_trigger_daemon (void *cls);

/**
 * Kick GNUnet Curl scheduler to begin curl interactions.
 */
void
AH_trigger_curl (void);

#endif
