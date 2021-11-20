/*
     This file is part of Anastasis.
     Copyright (C) 2012-2021 Anastasis Systems SA

     Anastasis is free software: you can redistribute it and/or modify it
     under the terms of the GNU General Public License as published
     by the Free Software Foundation, either version 3 of the License,
     or (at your option) any later version.

     Anastasis is distributed in the hope that it will be useful, but
     WITHOUT ANY WARRANTY; without even the implied warranty of
     MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
     General Public License for more details.

     You should have received a copy of the GNU General Public License
     along with this program.  If not, see <http://www.gnu.org/licenses/>.

     SPDX-License-Identifier: AGPL3.0-or-later
 */

/**
 * @file util/anastasis-config.c
 * @brief tool to access and manipulate Anastasis configuration files
 * @author Christian Grothoff
 */
#include "platform.h"
#include "anastasis_util_lib.h"


/**
 * Program to manipulate configuration files.
 *
 * @param argc number of arguments from the command line
 * @param argv command line arguments
 * @return 0 ok, 1 on error
 */
int
main (int argc,
      char *const *argv)
{
  struct GNUNET_CONFIGURATION_ConfigSettings cs = {
    .api_version = GNUNET_UTIL_VERSION,
    .global_ret = EXIT_SUCCESS
  };
  struct GNUNET_GETOPT_CommandLineOption options[] = {
    GNUNET_GETOPT_OPTION_END
  };
  enum GNUNET_GenericReturnValue ret;

  if (GNUNET_OK !=
      GNUNET_STRINGS_get_utf8_args (argc, argv,
                                    &argc, &argv))
    return EXIT_FAILURE;
  ANASTASIS_OS_init ();
  ret = GNUNET_PROGRAM_run (argc,
                            argv,
                            "anastasis-config [OPTIONS]",
                            gettext_noop (
                              "Manipulate Anastasis configuration files"),
                            options,
                            &GNUNET_CONFIGURATION_config_tool_run,
                            &cs);
  GNUNET_free_nz ((void *) argv);
  GNUNET_CONFIGURATION_config_settings_free (&cs);
  if (GNUNET_NO == ret)
    return 0;
  if (GNUNET_SYSERR == ret)
    return EXIT_INVALIDARGUMENT;
  return cs.global_ret;
}


/* end of anastasis-config.c */
