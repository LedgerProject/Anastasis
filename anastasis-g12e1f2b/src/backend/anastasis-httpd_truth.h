/*
  This file is part of Anastasis
  Copyright (C) 2014, 2015, 2016, 2021 Anastasis SARL

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
 * @file anastasis-httpd_truth.h
 * @brief functions to handle incoming requests on /truth
 * @author Dennis Neufeld
 * @author Dominik Meister
 * @author Christian Grothoff
 */
#ifndef ANASTASIS_HTTPD_TRUTH_H
#define ANASTASIS_HTTPD_TRUTH_H
#include <microhttpd.h>


/**
 * Prepare all active GET truth requests for system shutdown.
 */
void
AH_truth_shutdown (void);


/**
 * Prepare all active POST truth requests for system shutdown.
 */
void
AH_truth_upload_shutdown (void);


/**
 * Handle a GET to /truth/$UUID
 *
 * @param connection the MHD connection to handle
 * @param truth_uuid the truth UUID
 * @param hc connection context
 * @return MHD result code
 */
MHD_RESULT
AH_handler_truth_get (
  struct MHD_Connection *connection,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
  struct TM_HandlerContext *hc);


/**
 * Handle a POST to /truth/$UUID.
 *
 * @param connection the MHD connection to handle
 * @param hc connection context
 * @param truth_uuid the truth UUID
 * @param truth_data truth data
 * @param truth_data_size number of bytes (left) in @a truth_data
 * @return MHD result code
 */
MHD_RESULT
AH_handler_truth_post (
  struct MHD_Connection *connection,
  struct TM_HandlerContext *hc,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
  const char *truth_data,
  size_t *truth_data_size);

#endif
