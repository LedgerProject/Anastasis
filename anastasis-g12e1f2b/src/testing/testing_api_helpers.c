/*
  This file is part of ANASTASIS
  Copyright (C) 2014-2021 Anastasis SARL

  ANASTASIS is free software; you can redistribute it and/or modify
  it under the terms of the GNU General Public License as
  published by the Free Software Foundation; either version 3, or
  (at your option) any later version.

  ANASTASIS is distributed in the hope that it will be useful, but
  WITHOUT ANY WARRANTY; without even the implied warranty of
  ANASTASISABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public
  License along with ANASTASIS; see the file COPYING.  If not, see
  <http://www.gnu.org/licenses/>
*/

/**
 * @file anastasis/src/testing/testing_api_helpers.c
 * @brief helper functions for test library.
 * @author Christian Grothoff
 * @author Marcello Stanisci
 */

#include "platform.h"
#include "anastasis_testing_lib.h"
#include <gnunet/gnunet_curl_lib.h>


struct GNUNET_OS_Process *
ANASTASIS_TESTING_run_anastasis (const char *config_filename,
                                 const char *anastasis_url)
{
  struct GNUNET_OS_Process *anastasis_proc;
  unsigned int iter;
  char *wget_cmd;

  anastasis_proc
    = GNUNET_OS_start_process (GNUNET_OS_INHERIT_STD_ALL,
                               NULL, NULL, NULL,
                               "anastasis-httpd",
                               "anastasis-httpd",
                               "--log=INFO",
                               "-c", config_filename,
                               NULL);
  if (NULL == anastasis_proc)
    ANASTASIS_FAIL ();

  GNUNET_asprintf (&wget_cmd,
                   "wget -q -t 1 -T 1"
                   " %s"
                   " -o /dev/null -O /dev/null",
                   anastasis_url);

  /* give child time to start and bind against the socket */
  fprintf (stderr,
           "Waiting for `anastasis-httpd' to be ready\n");
  iter = 0;
  do
  {
    if (100 == iter)
    {
      GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                  "Failed to launch `anastasis-httpd' (or `wget')\n");
      GNUNET_OS_process_kill (anastasis_proc,
                              SIGTERM);
      GNUNET_OS_process_wait (anastasis_proc);
      GNUNET_OS_process_destroy (anastasis_proc);
      ANASTASIS_FAIL ();
    }
    {
      struct timespec req = {
        .tv_nsec = 10000
      };

      nanosleep (&req,
                 NULL);
    }
    iter++;
  }
  while (0 != system (wget_cmd));
  GNUNET_free (wget_cmd);
  fprintf (stderr,
           "\n");
  return anastasis_proc;
}


char *
ANASTASIS_TESTING_prepare_anastasis (const char *config_filename)
{
  struct GNUNET_CONFIGURATION_Handle *cfg;
  unsigned long long port;
  struct GNUNET_OS_Process *dbinit_proc;
  enum GNUNET_OS_ProcessStatusType type;
  unsigned long code;
  char *base_url;

  cfg = GNUNET_CONFIGURATION_create ();
  if (GNUNET_OK !=
      GNUNET_CONFIGURATION_load (cfg,
                                 config_filename))
    ANASTASIS_FAIL ();
  if (GNUNET_OK !=
      GNUNET_CONFIGURATION_get_value_number (cfg,
                                             "anastasis",
                                             "PORT",
                                             &port))
  {
    GNUNET_log_config_missing (GNUNET_ERROR_TYPE_ERROR,
                               "anastasis",
                               "PORT");
    GNUNET_CONFIGURATION_destroy (cfg);
    return NULL;
  }

  GNUNET_CONFIGURATION_destroy (cfg);

  if (GNUNET_OK !=
      GNUNET_NETWORK_test_port_free (IPPROTO_TCP,
                                     (uint16_t) port))
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Required port %llu not available, skipping.\n",
                port);
    return NULL;
  }

  /* DB preparation */
  if (NULL == (dbinit_proc = GNUNET_OS_start_process
                               (GNUNET_OS_INHERIT_STD_ALL,
                               NULL, NULL, NULL,
                               "anastasis-dbinit",
                               "anastasis-dbinit",
                               "-c", config_filename,
                               "-r",
                               NULL)))
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Failed to run anastasis-dbinit. Check your PATH.\n");
    return NULL;
  }

  if (GNUNET_SYSERR ==
      GNUNET_OS_process_wait_status (dbinit_proc,
                                     &type,
                                     &code))
  {
    GNUNET_OS_process_destroy (dbinit_proc);
    ANASTASIS_FAIL ();
  }
  if ( (type == GNUNET_OS_PROCESS_EXITED) &&
       (0 != code) )
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Failed to setup database\n");
    return NULL;
  }
  if ( (type != GNUNET_OS_PROCESS_EXITED) ||
       (0 != code) )
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Unexpected error running `anastasis-dbinit'!\n");
    return NULL;
  }
  GNUNET_OS_process_destroy (dbinit_proc);
  GNUNET_asprintf (&base_url,
                   "http://localhost:%llu/",
                   port);
  return base_url;
}
