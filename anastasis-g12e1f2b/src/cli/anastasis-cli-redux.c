/*
  This file is part of Anastasis
  Copyright (C) 2020,2021 Anastasis SARL

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
 * @file cli/anastasis-cli-redux.c
 * @brief command line tool for our reducer
 * @author Christian Grothoff
 * @author Dennis Neufeld
 * @author Dominik Meister
 */

#include "platform.h"
#include <gnunet/gnunet_util_lib.h>
#include <gnunet/gnunet_curl_lib.h>
#include "anastasis_redux.h"
#include <taler/taler_util.h>
#include <taler/taler_error_codes.h>
#include <taler/taler_json_lib.h>
#include "anastasis_util_lib.h"

/**
 * Closure for #GNUNET_CURL_gnunet_scheduler_reschedule().
 */
static struct GNUNET_CURL_RescheduleContext *rc;

/**
 * Curl context for communication with anastasis backend
 */
static struct GNUNET_CURL_Context *ctx;

/**
 * -b option given.
 */
static int b_flag;

/**
 * -r option given.
 */
static int r_flag;

/**
 * Input to -a option given.
 */
static char *input;

/**
 * Output filename, if given.
 */
static char *output_filename;

/**
 * JSON containing previous state
 */
static json_t *prev_state;

/**
 * JSON containing arguments for action
 */
static json_t *arguments;

/**
 * Handle to an ongoing action.
 */
static struct ANASTASIS_ReduxAction *ra;

/**
 * Return value from main.
 */
static int global_ret;


/**
 * Persist a json state, report errors.
 *
 * @param state to persist
 * @param filename where to write the state to, NULL for stdout
 */
static void
persist_new_state (json_t *state,
                   const char *filename)
{
  if (NULL != filename)
  {
    if (0 !=
        json_dump_file (state,
                        filename,
                        JSON_COMPACT))
    {
      GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                  "Could not dump state to `%s'\n",
                  filename);
      return;
    }
    return;
  }
  {
    char *state_str = json_dumps (state,
                                  JSON_COMPACT);
    if (-1 >=
        fprintf (stdout,
                 "%s",
                 state_str))
    {
      GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                  "Could not dump state to stdout\n");
      GNUNET_free (state_str);
      return;
    }
    GNUNET_free (state_str);
  }
}


/**
 * Function called with the results of #ANASTASIS_redux_action().
 *
 * @param cls closure
 * @param error_code Error code
 * @param result_state new state as result
 */
static void
action_cb (void *cls,
           enum TALER_ErrorCode error_code,
           json_t *result_state)
{
  (void) cls;
  ra = NULL;
  if (NULL != result_state)
    persist_new_state (result_state,
                       output_filename);
  if (TALER_EC_NONE != error_code)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Redux failed with error %d: %s\n",
                error_code,
                TALER_ErrorCode_get_hint (error_code));
    json_dumpf (result_state,
                stderr,
                JSON_INDENT (2));
  }
  GNUNET_SCHEDULER_shutdown ();
  global_ret = (TALER_EC_NONE != error_code) ? 1 : 0;
}


/**
 * @brief Shutdown the application.
 *
 * @param cls closure
 */
static void
shutdown_task (void *cls)
{
  (void) cls;

  GNUNET_log (GNUNET_ERROR_TYPE_INFO,
              "Shutdown initiated\n");
  if (NULL != ra)
  {
    ANASTASIS_redux_action_cancel (ra);
    ra = NULL;
  }
  ANASTASIS_redux_done ();
  if (NULL != ctx)
  {
    GNUNET_CURL_fini (ctx);
    ctx = NULL;
  }
  if (NULL != rc)
  {
    GNUNET_CURL_gnunet_rc_destroy (rc);
    rc = NULL;
  }
  GNUNET_log (GNUNET_ERROR_TYPE_INFO,
              "Shutdown complete\n");
}


/**
 * @brief Start the application
 *
 * @param cls closure
 * @param args arguments left
 * @param cfgfile config file name
 * @param cfg handle for the configuration file
 */
static void
run (void *cls,
     char *const *args,
     const char *cfgfile,
     const struct GNUNET_CONFIGURATION_Handle *cfg)
{
  (void) cls;
  json_error_t error;

  GNUNET_log (GNUNET_ERROR_TYPE_INFO,
              "Starting anastasis-reducer\n");
  GNUNET_SCHEDULER_add_shutdown (&shutdown_task,
                                 NULL);
  if (b_flag && r_flag)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_MESSAGE,
                "We cannot start backup and recovery at the same time!\n");
    GNUNET_SCHEDULER_shutdown ();
    return;
  }
  if (r_flag)
  {
    json_t *init_state;

    init_state = ANASTASIS_recovery_start (cfg);
    if (NULL == init_state)
    {
      GNUNET_log (GNUNET_ERROR_TYPE_MESSAGE,
                  "Failed to create an initial recovery state!\n");
      GNUNET_SCHEDULER_shutdown ();
      return;
    }
    persist_new_state (init_state,
                       args[0]);
    json_decref (init_state);
    GNUNET_SCHEDULER_shutdown ();
    return;
  }
  if (b_flag)
  {
    json_t *init_state;

    init_state = ANASTASIS_backup_start (cfg);
    if (NULL == init_state)
    {
      GNUNET_log (GNUNET_ERROR_TYPE_MESSAGE,
                  "Failed to create an initial backup state!\n");
      GNUNET_SCHEDULER_shutdown ();
      return;
    }
    persist_new_state (init_state,
                       args[0]);
    json_decref (init_state);
    GNUNET_SCHEDULER_shutdown ();
    return;
  }

  /* action processing */
  {
    const char *action = args[0];

    if (NULL == action)
    {
      GNUNET_log (GNUNET_ERROR_TYPE_MESSAGE,
                  "You must specify an action as the first argument (or `-b' or `-r')\n");
      GNUNET_log (GNUNET_ERROR_TYPE_MESSAGE,
                  "Example: anastasis-reducer back\n");
      GNUNET_SCHEDULER_shutdown ();
      return;
    }
    args++;
    if (NULL != input)
    {
      arguments = json_loads (input,
                              JSON_DECODE_ANY,
                              &error);
      if (NULL == arguments)
      {
        GNUNET_log (GNUNET_ERROR_TYPE_MESSAGE,
                    "Failed to parse arguments on line %u:%u: %s!\n",
                    error.line,
                    error.column,
                    error.text);
        GNUNET_SCHEDULER_shutdown ();
        return;
      }
    }
    if (NULL != args[0])
    {
      prev_state = json_load_file (args[0],
                                   JSON_DECODE_ANY,
                                   &error);
      args++;
    }
    else
    {
      prev_state = json_loadf (stdin,
                               JSON_DECODE_ANY,
                               &error);
    }
    if (NULL == prev_state)
    {
      GNUNET_log (GNUNET_ERROR_TYPE_MESSAGE,
                  "Failed to parse initial state on line %u:%u: %s!\n",
                  error.line,
                  error.column,
                  error.text);
      GNUNET_SCHEDULER_shutdown ();
      return;
    }
    output_filename = args[0];
    /* initialize HTTP client event loop */
    ctx = GNUNET_CURL_init (&GNUNET_CURL_gnunet_scheduler_reschedule,
                            &rc);
    rc = GNUNET_CURL_gnunet_rc_create (ctx);
    ANASTASIS_redux_init (ctx);
    ra = ANASTASIS_redux_action (prev_state,
                                 action,
                                 arguments,
                                 &action_cb,
                                 cls);
  }
}


int
main (int argc,
      char *const *argv)
{
  /* the available command line options */
  struct GNUNET_GETOPT_CommandLineOption options[] = {
    GNUNET_GETOPT_option_flag ('b',
                               "backup",
                               "use reducer to handle states for backup process",
                               &b_flag),
    GNUNET_GETOPT_option_flag ('r',
                               "restore",
                               "use reducer to handle states for restore process",
                               &r_flag),
    GNUNET_GETOPT_option_string ('a',
                                 "arguments",
                                 "JSON",
                                 "pass a JSON string containing arguments to reducer",
                                 &input),

    GNUNET_GETOPT_OPTION_END
  };
  enum GNUNET_GenericReturnValue ret;

  /* FIRST get the libtalerutil initialization out
     of the way. Then throw that one away, and force
     the SYNC defaults to be used! */
  (void) TALER_project_data_default ();
  GNUNET_OS_init (ANASTASIS_project_data_default ());
  ret = GNUNET_PROGRAM_run (argc,
                            argv,
                            "anastasis-reducer",
                            "This is an application for using Anastasis to handle the states.\n",
                            options,
                            &run,
                            NULL);
  if (GNUNET_SYSERR == ret)
    return 3;
  if (GNUNET_NO == ret)
    return 0;
  return global_ret;
}


/* end of anastasis-cli-redux.c */
