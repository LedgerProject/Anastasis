/*
  This file is part of Anastasis
  Copyright (C) 2019 Anastasis SARL

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
 * @file anastasis_authorization_plugin_file.c
 * @brief authorization plugin file based for testing
 * @author Dominik Meister
 */
#include "platform.h"
#include "anastasis_authorization_plugin.h"
#include <taler/taler_mhd_lib.h>
#include <gnunet/gnunet_db_lib.h>
#include "anastasis_database_lib.h"

/**
 * How many retries do we allow per code?
 */
#define INITIAL_RETRY_COUNTER 3


/**
 * Saves the state of a authorization process
 */
struct ANASTASIS_AUTHORIZATION_State
{
  /**
   * UUID of the challenge which is authorised
   */
  struct ANASTASIS_CRYPTO_TruthUUIDP truth_uuid;

  /**
   * Code which is sent to the user (here saved into a file)
   */
  uint64_t code;

  /**
   * holds the truth information
   */
  char *filename;

  /**
   * closure
   */
  void *cls;
};


/**
 * Validate @a data is a well-formed input into the challenge method,
 * i.e. @a data is a well-formed phone number for sending an SMS, or
 * a well-formed e-mail address for sending an e-mail. Not expected to
 * check that the phone number or e-mail account actually exists.
 *
 * To be possibly used before issuing a 402 payment required to the client.
 *
 * @param cls closure with a `const struct ANASTASIS_AuthorizationContext *`
 * @param connection HTTP client request (for queuing response)
 * @param truth_mime mime type of @e data
 * @param data input to validate (i.e. is it a valid phone number, etc.)
 * @param data_length number of bytes in @a data
 * @return #GNUNET_OK if @a data is valid,
 *         #GNUNET_NO if @a data is invalid and a reply was successfully queued on @a connection
 *         #GNUNET_SYSERR if @a data invalid but we failed to queue a reply on @a connection
 */
static enum GNUNET_GenericReturnValue
file_validate (void *cls,
               struct MHD_Connection *connection,
               const char *truth_mime,
               const char *data,
               size_t data_length)
{
  char *filename;
  bool flag;

  (void) cls;
  if (NULL == data)
    return GNUNET_NO;
  filename = GNUNET_STRINGS_data_to_string_alloc (data,
                                                  data_length);
  flag = false;
  for (size_t i = 0; i<strlen (filename); i++)
  {
    if ( (filename[i] == ' ') ||
         (filename[i] == '/') )
    {
      flag = true;
      break;
    }
  }
  if (flag)
    return GNUNET_NO;
  GNUNET_free (filename);
  return GNUNET_OK;
}


/**
 * Begin issuing authentication challenge to user based on @a data.
 * I.e. start to send SMS or e-mail or launch video identification.
 *
 * @param cls closure
 * @param trigger function to call when we made progress
 * @param trigger_cls closure for @a trigger
 * @param truth_uuid Identifier of the challenge, to be (if possible) included in the
 *             interaction with the user
 * @param code secret code that the user has to provide back to satisfy the challenge in
 *             the main anastasis protocol
 * @param data input to validate (i.e. is it a valid phone number, etc.)
 * @param data_length number of bytes in @a data
 * @return state to track progress on the authorization operation, NULL on failure
 */
static struct ANASTASIS_AUTHORIZATION_State *
file_start (void *cls,
            GNUNET_SCHEDULER_TaskCallback trigger,
            void *trigger_cls,
            const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
            uint64_t code,
            const void *data,
            size_t data_length)
{
  const struct ANASTASIS_AuthorizationContext *ac = cls;
  struct ANASTASIS_AUTHORIZATION_State *as;
  enum GNUNET_DB_QueryStatus qs;

  /* If the user can show this challenge code, this
     plugin is already happy (no additional
     requirements), so mark this challenge as
     already satisfied from the start. */
  qs = ac->db->mark_challenge_code_satisfied (ac->db->cls,
                                              truth_uuid,
                                              code);
  if (qs <= 0)
  {
    GNUNET_break (0);
    return NULL;
  }
  as = GNUNET_new (struct ANASTASIS_AUTHORIZATION_State);
  as->cls = cls;
  as->truth_uuid = *truth_uuid;
  as->code = code;
  as->filename = GNUNET_strndup (data,
                                 data_length);
  return as;
}


/**
 * Begin issuing authentication challenge to user based on @a data.
 * I.e. start to send SMS or e-mail or launch video identification.
 *
 * @param as authorization state
 * @param timeout how long do we have to produce a reply
 * @param connection HTTP client request (for queuing response, such as redirection to video portal)
 * @return state of the request
 */
static enum ANASTASIS_AUTHORIZATION_Result
file_process (struct ANASTASIS_AUTHORIZATION_State *as,
              struct GNUNET_TIME_Absolute timeout,
              struct MHD_Connection *connection)
{
  const char *mime;
  const char *lang;

  mime = MHD_lookup_connection_value (connection,
                                      MHD_HEADER_KIND,
                                      MHD_HTTP_HEADER_ACCEPT);
  if (NULL == mime)
    mime = "text/plain";
  lang = MHD_lookup_connection_value (connection,
                                      MHD_HEADER_KIND,
                                      MHD_HTTP_HEADER_ACCEPT_LANGUAGE);
  if (NULL == lang)
    lang = "en";
  {
    FILE *f = fopen (as->filename, "w");

    if (NULL == f)
    {
      struct MHD_Response *resp;
      MHD_RESULT mres;

      GNUNET_log_strerror_file (GNUNET_ERROR_TYPE_ERROR,
                                "open",
                                as->filename);
      resp = TALER_MHD_make_error (TALER_EC_GENERIC_INTERNAL_INVARIANT_FAILURE,
                                   "open");
      mres = MHD_queue_response (connection,
                                 MHD_HTTP_INTERNAL_SERVER_ERROR,
                                 resp);
      MHD_destroy_response (resp);
      if (MHD_YES != mres)
        return ANASTASIS_AUTHORIZATION_RES_FAILED_REPLY_FAILED;
      return ANASTASIS_AUTHORIZATION_RES_FAILED;
    }

    /* print challenge code to file */
    if (0 >= fprintf (f,
                      "%lu",
                      as->code))
    {
      struct MHD_Response *resp;
      MHD_RESULT mres;

      GNUNET_break (0 == fclose (f));
      resp = TALER_MHD_make_error (TALER_EC_GENERIC_INTERNAL_INVARIANT_FAILURE,
                                   "write");
      mres = MHD_queue_response (connection,
                                 MHD_HTTP_INTERNAL_SERVER_ERROR,
                                 resp);
      MHD_destroy_response (resp);
      if (MHD_YES != mres)
        return ANASTASIS_AUTHORIZATION_RES_FAILED_REPLY_FAILED;
      return ANASTASIS_AUTHORIZATION_RES_FAILED;
    }
    GNUNET_break (0 == fclose (f));
  }

  /* Build HTTP response */
  {
    struct MHD_Response *resp;

    if (TALER_MHD_xmime_matches (mime,
                                 "application/json"))
    {
      resp = TALER_MHD_MAKE_JSON_PACK (
        GNUNET_JSON_pack_string ("filename",
                                 as->filename));
    }
    else
    {
      size_t response_size;
      char *response;

      response_size = GNUNET_asprintf (&response,
                                       _ ("Challenge written to file"));
      resp = MHD_create_response_from_buffer (response_size,
                                              response,
                                              MHD_RESPMEM_MUST_COPY);
      GNUNET_free (response);
      TALER_MHD_add_global_headers (resp);
      GNUNET_break (MHD_YES ==
                    MHD_add_response_header (resp,
                                             MHD_HTTP_HEADER_CONTENT_TYPE,
                                             "text/plain"));
    }

    {
      MHD_RESULT mres;

      mres = MHD_queue_response (connection,
                                 MHD_HTTP_FORBIDDEN,
                                 resp);
      MHD_destroy_response (resp);
      if (MHD_YES != mres)
        return ANASTASIS_AUTHORIZATION_RES_SUCCESS_REPLY_FAILED;
      return ANASTASIS_AUTHORIZATION_RES_SUCCESS;
    }
  }
}


/**
 * Free internal state associated with @a as.
 *
 * @param as state to clean up
 */
static void
file_cleanup (struct ANASTASIS_AUTHORIZATION_State *as)
{
  GNUNET_free (as->filename);
  GNUNET_free (as);
}


/**
 * Initialize File based authorization plugin
 *
 * @param cls a configuration instance
 * @return NULL on error, otherwise a `struct ANASTASIS_AuthorizationPlugin`
 */
void *
libanastasis_plugin_authorization_file_init (void *cls)
{
  const struct ANASTASIS_AuthorizationContext *ac = cls;
  struct ANASTASIS_AuthorizationPlugin *plugin;

  plugin = GNUNET_new (struct ANASTASIS_AuthorizationPlugin);
  plugin->cls = (void *) ac;
  plugin->retry_counter = INITIAL_RETRY_COUNTER;
  plugin->code_validity_period = GNUNET_TIME_UNIT_MINUTES;
  plugin->code_rotation_period = GNUNET_TIME_UNIT_MINUTES;
  plugin->code_retransmission_frequency = GNUNET_TIME_UNIT_MINUTES;
  plugin->validate = &file_validate;
  plugin->start = &file_start;
  plugin->process = &file_process;
  plugin->cleanup = &file_cleanup;
  return plugin;
}


/**
 * Unload authorization plugin
 *
 * @param cls a `struct ANASTASIS_AuthorizationPlugin`
 * @return NULL (always)
 */
void *
libanastasis_plugin_authorization_file_done (void *cls)
{
  struct ANASTASIS_AuthorizationPlugin *plugin = cls;

  GNUNET_free (plugin);
  return NULL;
}
