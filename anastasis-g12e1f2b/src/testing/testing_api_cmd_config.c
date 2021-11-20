/*
  This file is part of Anastasis
  Copyright (C) 2019, 2021 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

  You should have received a copy of the GNU General Public License along with
  Anastasis; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
*/
/**
 * @file anastasis/src/testing/testing_api_cmd_config.c
 * @brief command to obtain the configuration of an anastasis backend service.
 * @author Dennis Neufeld
 * @author Dominik Meister
 */
#include "platform.h"
#include "anastasis_testing_lib.h"
#include <taler/taler_util.h>
#include <taler/taler_testing_lib.h>


/**
 * State for a "config" CMD.
 */
struct ConfigState
{
  /**
   * The interpreter state.
   */
  struct TALER_TESTING_Interpreter *is;

  /**
   * URL of the anastasis backend.
   */
  const char *anastasis_url;

  /**
   * Expected status code.
   */
  unsigned int http_status;

  /**
   * The /config GET operation handle.
   */
  struct ANASTASIS_ConfigOperation *so;

  /**
   * The salt value from server.
   */
  struct ANASTASIS_CRYPTO_ProviderSaltP salt;
};


/**
 * Function called with the results of a #ANASTASIS_get_config().
 *
 * @param cls closure
 * @param http_status HTTP status of the request
 * @param config config from the server
 */
static void
config_cb (void *cls,
           unsigned int http_status,
           const struct ANASTASIS_Config *config)
{
  struct ConfigState *ss = cls;

  ss->so = NULL;
  if (http_status != ss->http_status)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Unexpected response code %u to command %s in %s:%u\n",
                http_status,
                ss->is->commands[ss->is->ip].label,
                __FILE__,
                __LINE__);
    TALER_TESTING_interpreter_fail (ss->is);
    return;
  }
  if (NULL == config)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Config is NULL, command %s in %s:%u\n",
                ss->is->commands[ss->is->ip].label,
                __FILE__,
                __LINE__);
    TALER_TESTING_interpreter_fail (ss->is);
    return;
  }
  ss->salt = config->salt;
  TALER_TESTING_interpreter_next (ss->is);
}


/**
 * Run a "config" CMD.
 *
 * @param cls closure.
 * @param cmd command currently being run.
 * @param is interpreter state.
 */
static void
config_run (void *cls,
            const struct TALER_TESTING_Command *cmd,
            struct TALER_TESTING_Interpreter *is)
{
  struct ConfigState *ss = cls;

  ss->is = is;
  ss->so = ANASTASIS_get_config (is->ctx,
                                 ss->anastasis_url,
                                 &config_cb,
                                 ss);
  if (NULL == ss->so)
  {
    GNUNET_break (0);
    TALER_TESTING_interpreter_fail (ss->is);
    return;
  }
}


/**
 * Free the state of a "config" CMD, and possibly
 * cancel it if it did not complete.
 *
 * @param cls closure.
 * @param cmd command being freed.
 */
static void
config_cleanup (void *cls,
                const struct TALER_TESTING_Command *cmd)
{
  struct ConfigState *ss = cls;

  if (NULL != ss->so)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                "Command '%s' did not complete (config)\n",
                cmd->label);
    ANASTASIS_config_cancel (ss->so);
    ss->so = NULL;
  }
  GNUNET_free (ss);
}


/**
 * Offer internal data to other commands.
 *
 * @param cls closure
 * @param[out] ret result (could be anything)
 * @param trait name of the trait
 * @param index index number of the object to extract.
 * @return #GNUNET_OK on success
 */
static int
config_traits (void *cls,
               const void **ret,
               const char *trait,
               unsigned int index)
{
  struct ConfigState *ss = cls;
  struct TALER_TESTING_Trait traits[] = {
    ANASTASIS_TESTING_make_trait_salt (&ss->salt),
    TALER_TESTING_trait_end ()
  };

  return TALER_TESTING_get_trait (traits,
                                  ret,
                                  trait,
                                  index);
}


struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_config (const char *label,
                              const char *anastasis_url,
                              unsigned int http_status)
{
  struct ConfigState *ss;

  ss = GNUNET_new (struct ConfigState);
  ss->http_status = http_status;
  ss->anastasis_url = anastasis_url;
  {
    struct TALER_TESTING_Command cmd = {
      .cls = ss,
      .label = label,
      .run = &config_run,
      .cleanup = &config_cleanup,
      .traits = &config_traits
    };

    return cmd;
  }
}
