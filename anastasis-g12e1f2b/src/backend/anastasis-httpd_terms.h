/*
  This file is part of Anastasis
  Copyright (C) 2020, 2021 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU Lesser General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with
  Anastasis; see the file COPYING.GPL.  If not, see <http://www.gnu.org/licenses/>
*/
/**
 * @file backend/anastasis-httpd_terms.h
 * @brief headers for /terms handler
 * @author Christian Grothoff
 * @author Dennis Neufeld
 * @author Dominik Meister
 */
#ifndef ANASTASIS_HTTPD_TERMS_H
#define ANASTASIS_HTTPD_TERMS_H
#include <microhttpd.h>
#include "anastasis-httpd.h"

/**
 * Manages a /terms call.
 *
 * @param rh context of the handler
 * @param connection the MHD connection to handle
 * @return MHD result code
 */
MHD_RESULT
AH_handler_terms (struct AH_RequestHandler *rh,
                  struct MHD_Connection *connection);


/**
 * Handle a "/privacy" request.
 *
 * @param rh context of the handler
 * @param connection the MHD connection to handle
 * @return MHD result code
 */
MHD_RESULT
AH_handler_privacy (struct AH_RequestHandler *rh,
                    struct MHD_Connection *connection);

/**
 * Load our terms of service as per configuration.
 *
 * @param cfg configuration to process
 */
void
AH_load_terms (const struct GNUNET_CONFIGURATION_Handle *cfg);


#endif

/* end of anastasis-httpd_terms.h */
