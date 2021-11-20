/*
  This file is part of Anastasis
  Copyright (C) 2014, 2015, 2016 Anastasis SARL

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
 * @file anastasis-httpd_policy.h
 * @brief functions to handle incoming requests on /policy/
 * @author Dennis Neufeld
 * @author Dominik Meister
 * @author Christian Grothoff
 */
#ifndef ANASTASIS_HTTPD_POLICY_H
#define ANASTASIS_HTTPD_POLICY_H
#include <microhttpd.h>


/**
 * Service is shutting down, resume all MHD connections NOW.
 */
void
AH_resume_all_bc (void);


/**
 * Handle GET /policy/$ACCOUNT_PUB request.
 *
 * @param connection the MHD connection to handle
 * @param account_pub public key of the account
 * @return MHD result code
 */
MHD_RESULT
AH_policy_get (struct MHD_Connection *connection,
               const struct ANASTASIS_CRYPTO_AccountPublicKeyP *account_pub);


/**
 * Handle POST /policy/$ACCOUNT_PUB request.
 *
 * @param connection the MHD connection to handle
 * @param hc request context
 * @param account_pub public key of the account
 * @param upload_data upload data
 * @param upload_data_size number of bytes (left) in @a upload_data
 * @return MHD result code
 */
MHD_RESULT
AH_handler_policy_post (
  struct MHD_Connection *connection,
  struct TM_HandlerContext *hc,
  const struct ANASTASIS_CRYPTO_AccountPublicKeyP *account_pub,
  const char *upload_data,
  size_t *upload_data_size);


#endif
