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
 * @file anastasis-httpd_mhd.c
 * @brief helpers for MHD interaction; these are TALER_EXCHANGE_handler_ functions
 *        that generate simple MHD replies that do not require any real operations
 *        to be performed (error handling, static pages, etc.)
 * @author Florian Dold
 * @author Benedikt Mueller
 * @author Christian Grothoff
 */
#include "platform.h"
#include <jansson.h>
#include "anastasis-httpd_mhd.h"


MHD_RESULT
TMH_MHD_handler_static_response (struct AH_RequestHandler *rh,
                                 struct MHD_Connection *connection)
{
  if (0 == rh->data_size)
    rh->data_size = strlen ((const char *) rh->data);
  return TALER_MHD_reply_static (connection,
                                 rh->response_code,
                                 rh->mime_type,
                                 (void *) rh->data,
                                 rh->data_size);
}


MHD_RESULT
TMH_MHD_handler_agpl_redirect (struct AH_RequestHandler *rh,
                               struct MHD_Connection *connection)
{
  (void) rh;
  return TALER_MHD_reply_agpl (connection,
                               "https://git.taler.net/anastasis.git");
}


/* end of anastasis-httpd_mhd.c */
