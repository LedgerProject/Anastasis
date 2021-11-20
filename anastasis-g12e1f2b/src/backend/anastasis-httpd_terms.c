/*
  This file is part of Anastasis
  Copyright (C) 2020 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU Affero General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with
  Anastasis; see the file COPYING.GPL.  If not, see <http://www.gnu.org/licenses/>
*/
/**
 * @file backend/anastasis-httpd_terms.c
 * @brief headers for /terms handler
 * @author Christian Grothoff
 * @author Dennis Neufeld
 * @author Dominik Meister
 */
#include "platform.h"
#include "anastasis-httpd_terms.h"
#include <taler/taler_json_lib.h>

/**
 * Our terms of service.
 */
static struct TALER_MHD_Legal *tos;


/**
 * Our privacy policy.
 */
static struct TALER_MHD_Legal *pp;


MHD_RESULT
AH_handler_terms (struct AH_RequestHandler *rh,
                  struct MHD_Connection *connection)
{
  (void) rh;
  return TALER_MHD_reply_legal (connection,
                                tos);
}


MHD_RESULT
AH_handler_privacy (struct AH_RequestHandler *rh,
                    struct MHD_Connection *connection)
{
  (void) rh;
  return TALER_MHD_reply_legal (connection,
                                pp);
}


void
AH_load_terms (const struct GNUNET_CONFIGURATION_Handle *cfg)
{
  tos = TALER_MHD_legal_load (cfg,
                              "anastasis",
                              "TERMS_DIR",
                              "TERMS_ETAG");
  if (NULL == tos)
    GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                "Terms of service not configured\n");
  pp = TALER_MHD_legal_load (cfg,
                             "anastasis",
                             "PRIVACY_DIR",
                             "PRIVACY_ETAG");
  if (NULL == pp)
    GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                "Privacy policy not configured\n");
}


/* end of anastasis-httpd_terms.c */
