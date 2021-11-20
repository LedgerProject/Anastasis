/*
     This file is part of anastasis-gtk.
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
 * @file src/anastasis/anastasis-gtk_handle-country-unselected.c
 * @brief
 * @author Christian Grothoff
 * @author Dennis Neufeld
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_helper.h"
#include <jansson.h>


/**
 * Callback invoked if a country is unselected (unselected signal).
 *
 * @param selection A GtkTreeSelection.
 * @param user_data user data set when the signal handler was connected.
 */
void
anastasis_gtk_country_unselected (GtkTreeSelection *selection,
                                  gpointer user_data)
{
  GtkTreeModel *model;

  if (gtk_tree_selection_get_selected (selection,
                                       &model,
                                       NULL))
    AG_sensitive ("anastasis_gtk_main_window_forward_button");
  else
    AG_insensitive ("anastasis_gtk_main_window_forward_button");
}
