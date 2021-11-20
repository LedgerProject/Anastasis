/*
  This file is part of Anastasis
  Copyright (C) 2015, 2016, 2021 Anastasis SARL

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
 * @file anastasis_authorization_plugin.c
 * @brief Logic to load database plugin
 * @author Christian Grothoff
 * @author Dominik Meister
 */
#include "platform.h"
#include "anastasis_authorization_lib.h"
#include <ltdl.h>


/**
 * Head of linked list for all loaded plugins
 */
static struct AuthPlugin *ap_head;

/**
 * Tail ofinked list for all loaded plugins
 */
static struct AuthPlugin *ap_tail;


/**
 * Authentication plugin which is used to verify code based authentication
 * like SMS, E-Mail.
 */
struct AuthPlugin
{
  /**
   * Kept in a DLL.
   */
  struct AuthPlugin *next;

  /**
   * Kept in a DLL.
   */
  struct AuthPlugin *prev;

  /**
   * Actual plugin handle.
   */
  struct ANASTASIS_AuthorizationPlugin *authorization;

  /**
   * I.e. "sms", "phone".
   */
  char *name;

  /**
   * Name of the shared object providing the plugin logic.
   */
  char *lib_name;

  /**
   * Authorization context passed to the plugin.
   */
  struct ANASTASIS_AuthorizationContext ac;

};


struct ANASTASIS_AuthorizationPlugin *
ANASTASIS_authorization_plugin_load (
  const char *method,
  struct ANASTASIS_DatabasePlugin *db,
  const struct GNUNET_CONFIGURATION_Handle *AH_cfg)
{
  struct ANASTASIS_AuthorizationPlugin *authorization;
  char *lib_name;
  char *sec_name;
  struct AuthPlugin *ap;
  char *currency;
  struct TALER_Amount cost;

  for (ap = ap_head; NULL != ap; ap = ap->next)
    if (0 == strcmp (method,
                     ap->name))
      return ap->authorization;
  if (GNUNET_OK !=
      TALER_config_get_currency (AH_cfg,
                                 &currency))
    return NULL;
  ap = GNUNET_new (struct AuthPlugin);
  ap->ac.db = db;
  ap->ac.cfg = AH_cfg;
  GNUNET_asprintf (&sec_name,
                   "authorization-%s",
                   method);
  if (GNUNET_OK !=
      TALER_config_get_amount (AH_cfg,
                               sec_name,
                               "COST",
                               &cost))
  {
    GNUNET_log_config_missing (GNUNET_ERROR_TYPE_WARNING,
                               sec_name,
                               "COST");
    GNUNET_free (sec_name);
    GNUNET_free (currency);
    GNUNET_free (ap);
    return NULL;
  }

  GNUNET_free (currency);
  GNUNET_free (sec_name);
  GNUNET_asprintf (&lib_name,
                   "libanastasis_plugin_authorization_%s",
                   method);
  authorization = GNUNET_PLUGIN_load (lib_name,
                                      &ap->ac);
  if (NULL == authorization)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Authentication method `%s' not supported\n",
                method);
    GNUNET_free (lib_name);
    GNUNET_free (ap);
    return NULL;
  }
  authorization->cost = cost;
  ap->name = GNUNET_strdup (method);
  ap->lib_name = lib_name;
  ap->authorization = authorization;
  GNUNET_CONTAINER_DLL_insert (ap_head,
                               ap_tail,
                               ap);
  return authorization;
}


void
ANASTASIS_authorization_plugin_shutdown (void)
{
  struct AuthPlugin *ap;

  while (NULL != (ap = ap_head))
  {
    GNUNET_CONTAINER_DLL_remove (ap_head,
                                 ap_tail,
                                 ap);
    GNUNET_PLUGIN_unload (ap->lib_name,
                          ap->authorization);
    GNUNET_free (ap->lib_name);
    GNUNET_free (ap->name);
    GNUNET_free (ap);
  }
}


/**
 * Libtool search path before we started.
 */
static char *old_dlsearchpath;


/**
 * Setup libtool paths.
 */
void __attribute__ ((constructor))
anastasis_authorization_plugin_init (void)
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
anastasis_authorization_plugin_fini (void)
{
  lt_dlsetsearchpath (old_dlsearchpath);
  if (NULL != old_dlsearchpath)
  {
    GNUNET_free (old_dlsearchpath);
  }
  lt_dlexit ();
}


/* end of anastasis_authorization_plugin.c */
