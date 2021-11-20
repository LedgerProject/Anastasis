/*
  This file is part of Anastasis
  Copyright (C) 2020, 2021 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

  You should have received a copy of the GNU General Public License along with
  Anastasis; see the file COPYING.GPL.  If not, see <http://www.gnu.org/licenses/>
*/
/**
 * @file restclient/anastasis_api_config.c
 * @brief Implementation of the /config GET
 * @author Christian Grothoff
 * @author Dennis Neufeld
 * @author Dominik Meister
 */
#include "platform.h"
#include <curl/curl.h>
#include <microhttpd.h> /* just for HTTP status codes */
#include "anastasis_service.h"
#include "anastasis_api_curl_defaults.h"
#include <gnunet/gnunet_json_lib.h>
#include <taler/taler_json_lib.h>


/**
 * Which version of the Taler protocol is implemented
 * by this library?  Used to determine compatibility.
 */
#define ANASTASIS_PROTOCOL_CURRENT 0

/**
 * How many versions are we backwards compatible with?
 */
#define ANASTASIS_PROTOCOL_AGE 0


struct ANASTASIS_ConfigOperation
{
  /**
   * The url for this request.
   */
  char *url;

  /**
   * Handle for the request.
   */
  struct GNUNET_CURL_Job *job;

  /**
   * Reference to the execution context.
   */
  struct GNUNET_CURL_Context *ctx;

  /**
  * The callback to pass the backend response to
  */
  ANASTASIS_ConfigCallback cb;

  /**
   * Closure for @a cb.
   */
  void *cb_cls;

};


/**
 * Function called when we're done processing the
 * HTTP /config request.
 *
 * @param cls the `struct ANASTASIS_ConfigOperation`
 * @param response_code HTTP response code, 0 on error
 * @param response parsed JSON result, NULL on error
 */
static void
handle_config_finished (void *cls,
                        long response_code,
                        const void *response)
{
  struct ANASTASIS_ConfigOperation *co = cls;
  const json_t *json = response;

  co->job = NULL;
  switch (response_code)
  {
  case 0:
    /* No reply received */
    GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                "Backend `%s' failed to respond to GET /config\n",
                co->url);
    break;
  case MHD_HTTP_OK:
    {
      const char *name;
      struct ANASTASIS_Config acfg;
      json_t *methods;
      struct GNUNET_JSON_Specification spec[] = {
        GNUNET_JSON_spec_string ("name",
                                 &name),
        GNUNET_JSON_spec_string ("business_name",
                                 &acfg.business_name),
        GNUNET_JSON_spec_string ("version",
                                 &acfg.version),
        GNUNET_JSON_spec_string ("currency",
                                 &acfg.currency),
        GNUNET_JSON_spec_json ("methods",
                               &methods),
        GNUNET_JSON_spec_uint32 ("storage_limit_in_megabytes",
                                 &acfg.storage_limit_in_megabytes),
        TALER_JSON_spec_amount_any ("annual_fee",
                                    &acfg.annual_fee),
        TALER_JSON_spec_amount_any ("truth_upload_fee",
                                    &acfg.truth_upload_fee),
        TALER_JSON_spec_amount_any ("liability_limit",
                                    &acfg.liability_limit),
        GNUNET_JSON_spec_fixed_auto ("server_salt",
                                     &acfg.salt),
        GNUNET_JSON_spec_end ()
      };

      if (GNUNET_OK !=
          GNUNET_JSON_parse (json,
                             spec,
                             NULL, NULL))
      {
        GNUNET_break_op (0);
        response_code = 0;
        break;
      }
      if (0 != strcmp (name,
                       "anastasis"))
      {
        GNUNET_JSON_parse_free (spec);
        response_code = 0;
        break;
      }
      {
        unsigned int age;
        unsigned int revision;
        unsigned int current;
        char dummy;

        if (3 != sscanf (acfg.version,
                         "%u:%u:%u%c",
                         &current,
                         &revision,
                         &age,
                         &dummy))
        {
          GNUNET_break_op (0);
          response_code = 0;
          GNUNET_JSON_parse_free (spec);
          break;
        }
        if ( (ANASTASIS_PROTOCOL_CURRENT < current) &&
             (ANASTASIS_PROTOCOL_CURRENT < current - age) )
        {
          GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                      "Provider protocol version too new\n");
          response_code = 0;
          GNUNET_JSON_parse_free (spec);
          break;
        }
        if ( (ANASTASIS_PROTOCOL_CURRENT > current) &&
             (ANASTASIS_PROTOCOL_CURRENT - ANASTASIS_PROTOCOL_AGE > current) )
        {
          GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                      "Provider protocol version too old\n");
          GNUNET_break_op (0);
          response_code = 0;
          GNUNET_JSON_parse_free (spec);
          break;
        }
      }
      if ( (GNUNET_OK !=
            TALER_amount_cmp_currency (&acfg.liability_limit,
                                       &acfg.annual_fee)) ||
           (0 !=
            strcasecmp (acfg.currency,
                        acfg.annual_fee.currency)) )
      {
        GNUNET_break_op (0);
        GNUNET_JSON_parse_free (spec);
        response_code = 0;
        break;
      }

      if (! json_is_array (methods))
      {
        GNUNET_break_op (0);
        GNUNET_JSON_parse_free (spec);
        response_code = 0;
        break;
      }
      acfg.methods_length = json_array_size (methods);
      {
        struct ANASTASIS_AuthorizationMethodConfig mcfg[GNUNET_NZL (
                                                          acfg.methods_length)];

        for (unsigned int i = 0; i<acfg.methods_length; i++)
        {
          struct ANASTASIS_AuthorizationMethodConfig *m = &mcfg[i];
          struct GNUNET_JSON_Specification spec[] = {
            GNUNET_JSON_spec_string ("type",
                                     &m->type),
            TALER_JSON_spec_amount_any ("cost",
                                        &m->usage_fee),
            GNUNET_JSON_spec_end ()
          };

          if ( (GNUNET_OK !=
                GNUNET_JSON_parse (json_array_get (methods,
                                                   i),
                                   spec,
                                   NULL, NULL)) )
          {
            GNUNET_break_op (0);
            GNUNET_JSON_parse_free (spec);
            response_code = 0;
            goto end;
          }
        }
        acfg.methods = mcfg;
        co->cb (co->cb_cls,
                MHD_HTTP_OK,
                &acfg);
        GNUNET_JSON_parse_free (spec);
        ANASTASIS_config_cancel (co);
        return;
      }
    }
  case MHD_HTTP_BAD_REQUEST:
    /* This should never happen, either us or the anastasis server is buggy
       (or API version conflict); just pass JSON reply to the application */
    break;
  case MHD_HTTP_NOT_FOUND:
    /* Nothing really to verify */
    break;
  case MHD_HTTP_INTERNAL_SERVER_ERROR:
    /* Server had an internal issue; we should retry, but this API
       leaves this to the application */
    break;
  default:
    /* unexpected response code */
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Unexpected response code %u\n",
                (unsigned int) response_code);
    GNUNET_break_op (0);
    break;
  }
end:
  co->cb (co->cb_cls,
          response_code,
          NULL);
  ANASTASIS_config_cancel (co);
}


struct ANASTASIS_ConfigOperation *
ANASTASIS_get_config (struct GNUNET_CURL_Context *ctx,
                      const char *base_url,
                      ANASTASIS_ConfigCallback cb,
                      void *cb_cls)
{
  struct ANASTASIS_ConfigOperation *co;

  co = GNUNET_new (struct ANASTASIS_ConfigOperation);
  co->url = TALER_url_join (base_url,
                            "config",
                            NULL);
  co->ctx = ctx;
  co->cb = cb;
  co->cb_cls = cb_cls;
  {
    CURL *eh;

    eh = ANASTASIS_curl_easy_get_ (co->url);
    co->job = GNUNET_CURL_job_add (ctx,
                                   eh,
                                   &handle_config_finished,
                                   co);
  }
  if (NULL == co->job)
  {
    GNUNET_free (co->url);
    GNUNET_free (co);
    return NULL;
  }
  return co;
}


void
ANASTASIS_config_cancel (struct ANASTASIS_ConfigOperation *co)
{
  if (NULL != co->job)
  {
    GNUNET_CURL_job_cancel (co->job);
    co->job = NULL;
  }
  GNUNET_free (co->url);
  GNUNET_free (co);
}


/* end of anastasis_api_config.c */
