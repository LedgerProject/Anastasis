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
 * @file include/anastasis_database_lib.h
 * @brief database plugin loader
 * @author Dominik Meister
 * @author Dennis Neufeld
 * @author Christian Grothoff
 */
#ifndef ANASTASIS_DB_LIB_H
#define ANASTASIS_DB_LIB_H

#include "anastasis_database_plugin.h"

/**
 * Initialize the plugin.
 *
 * @param cfg configuration to use
 * @return NULL on failure
 */
struct ANASTASIS_DatabasePlugin *
ANASTASIS_DB_plugin_load (const struct GNUNET_CONFIGURATION_Handle *cfg);


/**
 * Shutdown the plugin.
 *
 * @param plugin plugin to unload
 */
void
ANASTASIS_DB_plugin_unload (struct ANASTASIS_DatabasePlugin *plugin);


#endif  /* ANASTASIS_DB_LIB_H */

/* end of anastasis_database_lib.h */
