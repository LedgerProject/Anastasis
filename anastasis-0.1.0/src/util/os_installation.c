/*
     This file is part of GNU Anastasis.
     Copyright (C) 2019, 2021 Anastasis SARL

     Anastasis is free software; you can redistribute it and/or modify
     it under the terms of the GNU Affero General Public License as published
     by the Free Software Foundation; either version 3, or (at your
     option) any later version.

     Anastasis is distributed in the hope that it will be useful, but
     WITHOUT ANY WARRANTY; without even the implied warranty of
     MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
     General Public License for more details.

     You should have received a copy of the GNU Affero General Public License
     along with Anastasis; see the file COPYING.  If not, write to the
     Free Software Foundation, Inc., 51 Franklin Street, Fifth Floor,
     Boston, MA 02110-1301, USA.
*/

/**
 * @file anastasis/src/util/os_installation.c
 * @brief initialize libgnunet OS subsystem for Anastasis.
 * @author Christian Grothoff
 */
#include "platform.h"
#include <gnunet/gnunet_util_lib.h>


/**
 * Default project data used for installation path detection
 * for GNU Anastasis.
 */
static const struct GNUNET_OS_ProjectData anastasis_pd = {
  .libname = "libanastasisutil",
  .project_dirname = "anastasis",
  .binary_name = "anastasis-httpd",
  .env_varname = "ANASTASIS_PREFIX",
  .base_config_varname = "ANASTASIS_BASE_CONFIG",
  .bug_email = "contact@anastasis.lu",
  .homepage = "https://anastasis.lu/",
  .config_file = "anastasis.conf",
  .user_config_file = "~/.config/anastasis.conf",
  .version = PACKAGE_VERSION,
  .is_gnu = 1,
  .gettext_domain = "anastasis",
  .gettext_path = NULL,
};


/**
 * Return default project data used by Anastasis.
 */
const struct GNUNET_OS_ProjectData *
ANASTASIS_project_data_default (void)
{
  return &anastasis_pd;
}


/**
 * Initialize libanastasisutil.
 */
void __attribute__ ((constructor))
ANASTASIS_OS_init ()
{
  GNUNET_OS_init (&anastasis_pd);
}


/* end of os_installation.c */
