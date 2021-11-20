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
 * @file src/anastasis/anastasis-gtk_handle-auth-delete-button-clicked.c
 * @brief Support for deletion of authentication methods
 * @author Christian Grothoff
 * @author Dennis Neufeld
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_helper.h"
#include <jansson.h>


/**
 * Callback invoked if the the "authentication methods delete"-button is clicked.
 *
 * @param object
 * @param user_data unused
 */
void
anastasis_gtk_authentication_method_delete_button_clicked_cb (GObject *object,
                                                              gpointer user_data)
{
  json_t *args;
  guint index;
  GtkTreeSelection *ts;
  GtkTreeModel *model;
  GtkTreeIter iter;

  ts = GTK_TREE_SELECTION (GCG_get_main_window_object (
                             "anastasis_gtk_authentication_methods_selection"));
  if (! gtk_tree_selection_get_selected (ts,
                                         &model,
                                         &iter))
  {
    GNUNET_break (0);
    return;
  }
  gtk_tree_model_get (model,
                      &iter,
                      AG_AMMC_INDEX, &index,
                      -1);
  AG_freeze ();
  args = GNUNET_JSON_PACK (
    GNUNET_JSON_pack_uint64 ("authentication_method",
                             index));
  AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                  "delete_authentication",
                                  args,
                                  &AG_action_cb,
                                  NULL);
  json_decref (args);
}


void
auth_method_selection_changed_cb (
  GtkTreeSelection *treeselection,
  gpointer user_data)
{
  GtkTreeModel *model;
  GtkTreeIter iter;

  if (gtk_tree_selection_get_selected (treeselection,
                                       &model,
                                       &iter))
    AG_sensitive ("anastasis_gtk_authentication_method_delete_button");
  else
    AG_insensitive ("anastasis_gtk_authentication_method_delete_button");
}
