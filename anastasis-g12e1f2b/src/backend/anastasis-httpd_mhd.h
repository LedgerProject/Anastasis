/*
  This file is part of Anastasis
  Copyright (C) 2014, 2015 Anastasis SARL

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
 * @file anastasis-httpd_mhd.h
 * @brief helpers for MHD interaction, used to generate simple responses
 * @author Florian Dold
 * @author Benedikt Mueller
 * @author Christian Grothoff
 */
#ifndef ANASTASIS_HTTPD_MHD_H
#define ANASTASIS_HTTPD_MHD_H
#include <gnunet/gnunet_util_lib.h>
#include <microhttpd.h>
#include "anastasis-httpd.h"


/**
 * Function to call to handle the request by sending
 * back static data from the @a rh.
 *
 * @param rh context of the handler
 * @param connection the MHD connection to handle
 * @return MHD result code
 */
MHD_RESULT
TMH_MHD_handler_static_response (struct AH_RequestHandler *rh,
                                 struct MHD_Connection *connection);


/**
 * Function to call to handle the request by sending
 * back a redirect to the AGPL source code.
 *
 * @param rh context of the handler
 * @param connection the MHD connection to handle
 * @return MHD result code
 */
MHD_RESULT
TMH_MHD_handler_agpl_redirect (struct AH_RequestHandler *rh,
                               struct MHD_Connection *connection);


#endif
