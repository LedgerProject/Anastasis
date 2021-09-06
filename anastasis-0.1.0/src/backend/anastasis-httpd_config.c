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
 * @file backend/anastasis-httpd_config.c
 * @brief headers for /terms handler
 * @author Christian Grothoff
 * @author Dennis Neufeld
 * @author Dominik Meister
 */
#include "platform.h"
#include <jansson.h>
#include "anastasis-httpd_config.h"
#include "anastasis-httpd.h"
#include <taler/taler_json_lib.h>
#include "anastasis_authorization_lib.h"


/**
 * Add enabled methods and their fees to the ``/config`` response.
 *
 * @param[in,out] cls a `json_t` array to build
 * @param section configuration section to inspect
 */
static void
add_methods (void *cls,
             const char *section)
{
  json_t *method_arr = cls;
  struct ANASTASIS_AuthorizationPlugin *p;
  json_t *method;

  if (0 != strncasecmp (section,
                        "authorization-",
                        strlen ("authorization-")))
    return;
  if (GNUNET_YES !=
      GNUNET_CONFIGURATION_get_value_yesno (AH_cfg,
                                            section,
                                            "ENABLED"))
    return;
  section += strlen ("authorization-");
  p = ANASTASIS_authorization_plugin_load (section,
                                           db,
                                           AH_cfg);
  if (NULL == p)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Failed to load authorization plugin `%s'\n",
                section);
    return;
  }
  method = GNUNET_JSON_PACK (
    GNUNET_JSON_pack_string ("type",
                             section),
    TALER_JSON_pack_amount ("cost",
                            &p->cost));
  GNUNET_assert (
    0 ==
    json_array_append_new (method_arr,
                           method));
}


MHD_RESULT
AH_handler_config (struct AH_RequestHandler *rh,
                   struct MHD_Connection *connection)
{
  json_t *method_arr = json_array ();

  GNUNET_assert (NULL != method_arr);
  {
    json_t *method;

    method = GNUNET_JSON_PACK (
      GNUNET_JSON_pack_string ("type",
                               "question"),
      TALER_JSON_pack_amount ("cost",
                              &AH_question_cost));
    GNUNET_assert (
      0 ==
      json_array_append_new (method_arr,
                             method));
  }
  GNUNET_CONFIGURATION_iterate_sections (AH_cfg,
                                         &add_methods,
                                         method_arr);
  return TALER_MHD_REPLY_JSON_PACK (
    connection,
    MHD_HTTP_OK,
    GNUNET_JSON_pack_string ("name",
                             "anastasis"),
    GNUNET_JSON_pack_string ("version",
                             "0:0:0"),
    GNUNET_JSON_pack_string ("business_name",
                             AH_business_name),
    GNUNET_JSON_pack_string ("currency",
                             (char *) AH_currency),
    GNUNET_JSON_pack_array_steal ("methods",
                                  method_arr),
    GNUNET_JSON_pack_uint64 ("storage_limit_in_megabytes",
                             AH_upload_limit_mb),
    TALER_JSON_pack_amount ("annual_fee",
                            &AH_annual_fee),
    TALER_JSON_pack_amount ("truth_upload_fee",
                            &AH_truth_upload_fee),
    TALER_JSON_pack_amount ("liability_limit",
                            &AH_insurance),
    GNUNET_JSON_pack_data_auto ("server_salt",
                                &AH_server_salt));
}


/* end of anastasis-httpd_config.c */
