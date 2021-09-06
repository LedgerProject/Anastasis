/*
  This file is part of Anastasis
  Copyright (C) 2019-2021 SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU Affero General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with
  Anastasis; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
*/
/**
 * @file stasis/anastasis-dbinit.c
 * @brief Create tables for the merchant database.
 * @author Dennis Neufeld
 * @author Dominik Meister
 */
#include "platform.h"
#include "anastasis_database_lib.h"


/**
 * Return value from main().
 */
static int global_ret;

/**
 * -r option: do full DB reset
 */
static int reset_db;

/**
 * Main function that will be run.
 *
 * @param cls closure
 * @param args remaining command-line arguments
 * @param cfgfile name of the configuration file used (for saving, can be NULL!)
 * @param cfg configuration
 */
static void
run (void *cls,
     char *const *args,
     const char *cfgfile,
     const struct GNUNET_CONFIGURATION_Handle *cfg)
{
  struct ANASTASIS_DatabasePlugin *plugin;

  if (NULL ==
      (plugin = ANASTASIS_DB_plugin_load (cfg)))
  {
    fprintf (stderr,
             "Failed to initialize database plugin.\n");
    global_ret = EXIT_FAILURE;
    return;
  }
  if (reset_db)
  {
    (void) plugin->drop_tables (plugin->cls);
    ANASTASIS_DB_plugin_unload (plugin);
    plugin = ANASTASIS_DB_plugin_load (cfg);
  }
  if (GNUNET_OK !=
      plugin->create_tables (plugin->cls))
  {
    global_ret = EXIT_FAILURE;
    return;
  }
  ANASTASIS_DB_plugin_unload (plugin);
}


/**
 * The main function of the database initialization tool.
 * Used to initialize the Anastasis' database.
 *
 * @param argc number of arguments from the command line
 * @param argv command line arguments
 * @return 0 ok, 1 on error
 */
int
main (int argc,
      char *const *argv)
{
  struct GNUNET_GETOPT_CommandLineOption options[] = {

    GNUNET_GETOPT_option_flag ('r',
                               "reset",
                               "reset database (DANGEROUS: all existing data is lost!)",
                               &reset_db),

    GNUNET_GETOPT_OPTION_END
  };

  /* force linker to link against libtalerutil; if we do
     not do this, the linker may "optimize" libtalerutil
     away and skip #TALER_OS_init(), which we do need */
  (void) TALER_project_data_default ();
  GNUNET_OS_init (ANASTASIS_project_data_default ());
  GNUNET_assert (GNUNET_OK ==
                 GNUNET_log_setup ("anastasis-dbinit",
                                   "INFO",
                                   NULL));
  if (GNUNET_OK !=
      GNUNET_PROGRAM_run (argc, argv,
                          "anastasis-dbinit",
                          "Initialize anastasis database",
                          options,
                          &run, NULL))
    return 1;
  return global_ret;
}


/* end of anastasis-dbinit.c */
