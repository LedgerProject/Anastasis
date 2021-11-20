/*
  This file is part of Anastasis
  Copyright (C) 2018-2020 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

  You should have received a copy of the GNU General Public License along with
  Anastasis; see the file COPYING.  If not, see
  <http://www.gnu.org/licenses/>
*/
/**
 * @file libanastasiseufin/lae_parse.c
 * @brief Convenience function to parse authentication configuration
 * @author Christian Grothoff
 */
#include "platform.h"
#include "anastasis_eufin_lib.h"


/**
 * Parse configuration section with bank authentication data.
 *
 * @param cfg configuration to parse
 * @param section the section with the configuration data
 * @param[out] auth set to the configuration data found
 * @return #GNUNET_OK on success
 */
int
ANASTASIS_EUFIN_auth_parse_cfg (const struct GNUNET_CONFIGURATION_Handle *cfg,
                                const char *section,
                                struct ANASTASIS_EUFIN_AuthenticationData *auth)
{
  const struct
  {
    const char *m;
    enum ANASTASIS_EUFIN_AuthenticationMethod e;
  } methods[] = {
    { "NONE",  ANASTASIS_EUFIN_AUTH_NONE  },
    { "BASIC", ANASTASIS_EUFIN_AUTH_BASIC },
    { NULL, ANASTASIS_EUFIN_AUTH_NONE     }
  };
  char *method;

  if (GNUNET_OK !=
      GNUNET_CONFIGURATION_get_value_string (cfg,
                                             section,
                                             "WIRE_GATEWAY_URL",
                                             &auth->wire_gateway_url))
  {
    GNUNET_log_config_missing (GNUNET_ERROR_TYPE_ERROR,
                               section,
                               "WIRE_GATEWAY_URL");
    return GNUNET_SYSERR;
  }

  if (GNUNET_OK !=
      GNUNET_CONFIGURATION_get_value_string (cfg,
                                             section,
                                             "WIRE_GATEWAY_AUTH_METHOD",
                                             &method))
  {
    GNUNET_log_config_missing (GNUNET_ERROR_TYPE_ERROR,
                               section,
                               "WIRE_GATEWAY_AUTH_METHOD");
    GNUNET_free (auth->wire_gateway_url);
    return GNUNET_SYSERR;
  }
  for (unsigned int i = 0; NULL != methods[i].m; i++)
  {
    if (0 == strcasecmp (method,
                         methods[i].m))
    {
      switch (methods[i].e)
      {
      case ANASTASIS_EUFIN_AUTH_NONE:
        auth->method = ANASTASIS_EUFIN_AUTH_NONE;
        GNUNET_free (method);
        return GNUNET_OK;
      case ANASTASIS_EUFIN_AUTH_BASIC:
        if (GNUNET_OK !=
            GNUNET_CONFIGURATION_get_value_string (cfg,
                                                   section,
                                                   "USERNAME",
                                                   &auth->details.basic.username))
        {
          GNUNET_log_config_missing (GNUNET_ERROR_TYPE_ERROR,
                                     section,
                                     "USERNAME");
          GNUNET_free (method);
          GNUNET_free (auth->wire_gateway_url);
          return GNUNET_SYSERR;
        }
        if (GNUNET_OK !=
            GNUNET_CONFIGURATION_get_value_string (cfg,
                                                   section,
                                                   "PASSWORD",
                                                   &auth->details.basic.password))
        {
          GNUNET_free (auth->details.basic.username);
          auth->details.basic.username = NULL;
          GNUNET_log_config_missing (GNUNET_ERROR_TYPE_ERROR,
                                     section,
                                     "PASSWORD");
          GNUNET_free (method);
          GNUNET_free (auth->wire_gateway_url);
          return GNUNET_SYSERR;
        }
        auth->method = ANASTASIS_EUFIN_AUTH_BASIC;
        GNUNET_free (method);
        return GNUNET_OK;
      }
    }
  }
  GNUNET_free (method);
  return GNUNET_SYSERR;
}


/**
 * Free memory inside of @a auth (but not @a auth itself).
 * Dual to #ANASTASIS_EUFIN_auth_parse_cfg().
 *
 * @param[in] auth authentication data to free
 */
void
ANASTASIS_EUFIN_auth_free (struct ANASTASIS_EUFIN_AuthenticationData *auth)
{
  switch (auth->method)
  {
  case ANASTASIS_EUFIN_AUTH_NONE:
    break;
  case ANASTASIS_EUFIN_AUTH_BASIC:
    if (NULL != auth->details.basic.username)
    {
      GNUNET_free (auth->details.basic.username);
      auth->details.basic.username = NULL;
    }
    if (NULL != auth->details.basic.password)
    {
      GNUNET_free (auth->details.basic.password);
      auth->details.basic.password = NULL;
    }
    break;
  }
  GNUNET_free (auth->wire_gateway_url);
  auth->wire_gateway_url = NULL;
}


/* end of lae_parse.c */
