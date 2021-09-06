/*
     This file is part of anastasis-gtk.
     Copyright (C) 2021 Anastasis SARL

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
 * @file src/anastasis/anastasis-gtk_handle-country-activated.c
 * @brief
 * @author Christian Grothoff
 * @author Dennis Neufeld
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_helper.h"
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_handle-main-window-forward-clicked.h"
#include <jansson.h>


/**
 * Function called on each selected item.
 * Sets @a data to true if called.
 *
 * @param model unused
 * @param path unused
 * @param iter unused
 * @param[out] data pointer to a `bool` to set to true
 */
static void
select_cb (GtkTreeModel *model,
           GtkTreePath *path,
           GtkTreeIter *iter,
           gpointer data)
{
  bool *ptr = data;

  (void) model;
  (void) path;
  (void) iter;
  *ptr = true;
}


/**
 * Callback invoked if the currency selection changed.
 *
 * @param treeselection selection object
 * @param user_data NULL
 */
void
anastasis_gtk_currency_selection_changed_cb (GtkTreeSelection *treeselection,
                                             gpointer user_data)
{
  bool have_sel = false;

  (void) user_data;
  gtk_tree_selection_selected_foreach (treeselection,
                                       &select_cb,
                                       &have_sel);
  if (have_sel)
    AG_sensitive ("anastasis_gtk_main_window_forward_button");
  else
    AG_insensitive ("anastasis_gtk_main_window_forward_button");
}
