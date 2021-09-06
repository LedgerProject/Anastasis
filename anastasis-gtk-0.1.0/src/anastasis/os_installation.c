/*
     This file is part of Anastasis.
     Copyright (C) 2020 Anastasis SARL

     Anastasis is free software; you can redistribute it and/or modify
     it under the terms of the GNU General Public License as published
     by the Free Software Foundation; either version 3, or (at your
     option) any later version.

     Anastasis is distributed in the hope that it will be useful, but
     WITHOUT ANY WARRANTY; without even the implied warranty of
     MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
     General Public License for more details.

     You should have received a copy of the GNU General Public License
     along with Anastasis; see the file COPYING.  If not, write to the
     Free Software Foundation, Inc., 51 Franklin Street, Fifth Floor,
     Boston, MA 02110-1301, USA.
*/
/**
 * @file src/anastasis/os_installation.c
 * @brief initialize GNUNET_OS for anastasis-gtk
 * @author Christian Grothoff
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>

/**
 * Default project data used for installation path detection
 * for anastasis-gtk.
 */
static const struct GNUNET_OS_ProjectData gtk_pd = {
  .libname = "libanastasisgtk",
  .project_dirname = "anastasis",
  .binary_name = "anastasis-gtk",
  .env_varname = "ANASTASIS_GTK_PREFIX",
  .env_varname_alt = "ANASTASIS_PREFIX",
  .base_config_varname = "ANASTASIS_BASE_CONFIG",
  .bug_email = "anastasis@gnu.org",
  .homepage = "https://anastasis.lu/",
  .config_file = "anastasis.conf",
  .user_config_file = "~/.config/anastasis.conf"
};


/**
 * Initialize.
 */
void __attribute__ ((constructor))
ANASTASIS_GTK_init ()
{
  GNUNET_OS_init (&gtk_pd);
}


/* end of os_installation.c */
