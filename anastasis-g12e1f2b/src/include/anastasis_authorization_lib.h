/*
  This file is part of Anastasis
  Copyright (C) 2019, 2021 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU Affero General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with
  Anastasis; see the file COPYING.GPL.  If not, see <http://www.gnu.org/licenses/>
*/
/**
 * @file include/anastasis_authorization_lib.h
 * @brief database plugin loader
 * @author Dominik Meister
 * @author Dennis Neufeld
 * @author Christian Grothoff
 */
#ifndef ANASTASIS_AUTHORIZATION_LIB_H
#define ANASTASIS_AUTHORIZATION_LIB_H

#include "anastasis_authorization_plugin.h"

/**
 * Load authorization plugin.
 *
 * @param method name of the method to load
 * @param db database handle to use
 * @param AH_cfg configuration to use
 * @return plugin handle on success
 */
struct ANASTASIS_AuthorizationPlugin *
ANASTASIS_authorization_plugin_load (
  const char *method,
  struct ANASTASIS_DatabasePlugin *db,
  const struct GNUNET_CONFIGURATION_Handle *AH_cfg);


/**
 * Shutdown all loaded plugins.
 */
void
ANASTASIS_authorization_plugin_shutdown (void);

#endif
/* end of anastasis_authorization_lib.h */
