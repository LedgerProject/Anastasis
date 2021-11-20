/*
  This file is part of Anastasis
  Copyright (C) 2015, 2016 Anastasis SARL

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
 * @file stasis/anastasis_db_plugin.c
 * @brief Logic to load database plugin
 * @author Christian Grothoff
 * @author Sree Harsha Totakura <sreeharsha@totakura.in>
 */
#include "platform.h"
#include "anastasis_database_plugin.h"
#include <ltdl.h>


/**
 * Initialize the plugin.
 *
 * @param cfg configuration to use
 * @return #GNUNET_OK on success
 */
struct ANASTASIS_DatabasePlugin *
ANASTASIS_DB_plugin_load (const struct GNUNET_CONFIGURATION_Handle *cfg)
{
  char *plugin_name;
  char *lib_name;
  struct ANASTASIS_DatabasePlugin *plugin;

  if (GNUNET_SYSERR ==
      GNUNET_CONFIGURATION_get_value_string (cfg,
                                             "anastasis",
                                             "db",
                                             &plugin_name))
  {
    GNUNET_log_config_missing (GNUNET_ERROR_TYPE_ERROR,
                               "anastasis",
                               "db");
    return NULL;
  }
  (void) GNUNET_asprintf (&lib_name,
                          "libanastasis_plugin_db_%s",
                          plugin_name);
  GNUNET_free (plugin_name);
  plugin = GNUNET_PLUGIN_load (lib_name,
                               (void *) cfg);
  if (NULL != plugin)
    plugin->library_name = lib_name;
  else
    lib_name = NULL;
  return plugin;
}


/**
 * Shutdown the plugin.
 *
 * @param plugin the plugin to unload
 */
void
ANASTASIS_DB_plugin_unload (struct ANASTASIS_DatabasePlugin *plugin)
{
  char *lib_name;

  if (NULL == plugin)
    return;
  lib_name = plugin->library_name;
  GNUNET_assert (NULL == GNUNET_PLUGIN_unload (lib_name,
                                               plugin));
  GNUNET_free (lib_name);
}


/**
 * Libtool search path before we started.
 */
static char *old_dlsearchpath;


/**
 * Setup libtool paths.
 */
void __attribute__ ((constructor))
plugin_init ()
{
  int err;
  const char *opath;
  char *path;
  char *cpath;

  err = lt_dlinit ();
  if (err > 0)
  {
    fprintf (stderr,
             _ ("Initialization of plugin mechanism failed: %s!\n"),
             lt_dlerror ());
    return;
  }
  opath = lt_dlgetsearchpath ();
  if (NULL != opath)
    old_dlsearchpath = GNUNET_strdup (opath);
  path = GNUNET_OS_installation_get_path (GNUNET_OS_IPK_LIBDIR);
  if (NULL != path)
  {
    if (NULL != opath)
    {
      GNUNET_asprintf (&cpath, "%s:%s", opath, path);
      lt_dlsetsearchpath (cpath);
      GNUNET_free (path);
      GNUNET_free (cpath);
    }
    else
    {
      lt_dlsetsearchpath (path);
      GNUNET_free (path);
    }
  }
}


/**
 * Shutdown libtool.
 */
void __attribute__ ((destructor))
plugin_fini ()
{
  lt_dlsetsearchpath (old_dlsearchpath);
  if (NULL != old_dlsearchpath)
  {
    GNUNET_free (old_dlsearchpath);
  }
  lt_dlexit ();
}


/* end of anastasis_db_plugin.c */
