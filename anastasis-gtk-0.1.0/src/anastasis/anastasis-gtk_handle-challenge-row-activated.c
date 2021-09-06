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
 * @file src/anastasis/anastasis-gtk_handle-challenge-row-activated.c
 * @brief
 * @author Christian Grothoff
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_helper.h"
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_handle-identity-changed.h"
#include <jansson.h>


static void
start_solve (GtkTreeModel *model,
             GtkTreeIter *iter)
{
  char *uuid;
  gboolean solved;
  json_t *args;

  gtk_tree_model_get (model,
                      iter,
                      AG_CSM_CHALLENGE_UUID, &uuid,
                      AG_CSM_SOLVED, &solved,
                      -1);
  if (solved)
  {
    g_free (uuid);
    return;
  }
  args = GNUNET_JSON_PACK (
    GNUNET_JSON_pack_string ("uuid",
                             uuid));
  g_free (uuid);
  AG_freeze ();
  AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                  "select_challenge",
                                  args,
                                  &AG_action_cb,
                                  NULL);
  json_decref (args);
}


/**
 * The user activated a row in the challenge list.
 * If the row contains an unsolved challenge, start
 * the process to solve the challenge.
 *
 * @param selection the selected data
 * @param user_data unused
 */
void
anastasis_gtk_challenge_status_treeview_row_activated_cb (
  GtkTreeView       *tree_view,
  GtkTreePath       *path,
  GtkTreeViewColumn *column,
  gpointer user_data)
{
  GtkTreeModel *model;
  GtkTreeIter iter;
  GtkTreeSelection *selection;

  (void) path;
  (void) column;
  (void) user_data;
  selection = gtk_tree_view_get_selection (tree_view);
  if (gtk_tree_selection_get_selected (selection,
                                       &model,
                                       &iter))
  {
    start_solve (model,
                 &iter);
  }
  else
  {
    /* How can this be? */
    GNUNET_break (0);
  }
}


/**
 * The user clicked one of the challenge buttons, select the
 * challenge.
 *
 * @param button the button that was clicked
 * @param user_data a `json *` with the challenge
 */
void
anastasis_gtk_challenge_status_solved_toggled_cb (
  GtkCellRendererToggle *cell_renderer,
  gchar                 *path,
  gpointer user_data)
{
  GtkTreePath *p;
  GtkTreeIter iter;
  GtkTreeModel *model;

  model = GTK_TREE_MODEL (GCG_get_main_window_object (
                            "challenge_status_liststore"));
  p = gtk_tree_path_new_from_string (path);
  gtk_tree_model_get_iter (model,
                           &iter,
                           p);
  gtk_tree_path_free (p);
  start_solve (model,
               &iter);
}


/**
 * The user selected another row in the challenge list.
 * If the row has data that might be interesting for the
 * clipboard, copy it there.
 *
 * @param selection the selected data
 * @param user_data unused
 */
void
anastasis_gtk_challenge_status_treeselection_changed_cb (
  GtkTreeSelection *selection,
  gpointer user_data)
{
  GtkTreeModel *model;
  GtkTreeIter iter;
  GtkClipboard *cb;

  (void) user_data;
  cb = gtk_clipboard_get (GDK_SELECTION_PRIMARY);
  GNUNET_assert (NULL != cb);
  if (gtk_tree_selection_get_selected (selection,
                                       &model,
                                       &iter))
  {
    char *uri;
    char *url;
    gboolean paying;
    gboolean have_redir;

    gtk_tree_model_get (model,
                        &iter,
                        AG_CSM_PAYTO_URI, &uri,
                        AG_CSM_PAYING, &paying,
                        AG_CSM_REDIRECT_URL, &url,
                        AG_CSM_HAVE_REDIRECT, &have_redir,
                        -1);
    if (paying && (NULL != uri))
      gtk_clipboard_set_text (cb,
                              uri,
                              strlen (uri));
    else if (have_redir && (NULL != url))
      gtk_clipboard_set_text (cb,
                              url,
                              strlen (url));
    else
      gtk_clipboard_set_text (cb,
                              "",
                              0);
    g_free (url);
  }
  else
  {
    gtk_clipboard_set_text (cb,
                            "",
                            0);
  }
}
