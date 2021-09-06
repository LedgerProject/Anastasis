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
 * @file src/anastasis/anastasis-gtk_handle-policy-activate.c
 * @brief Handle double-click in policy review
 * @author Christian Grothoff
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_helper.h"
#include "anastasis-gtk_pe.h"
#include <jansson.h>


void
anastasis_gtk_review_policy_treeview_row_activated_cb (
                                                       GtkTreeView       *tree_view,
                                                       GtkTreePath       *path,
                                                       GtkTreeViewColumn *column,
                                                       gpointer           user_data)
{
  GtkTreeModel *tm = gtk_tree_view_get_model (tree_view);
  GtkTreeIter iter;
  guint pindex;
  gboolean is_challenge;

  if (NULL == path)
    return;
  if (! gtk_tree_model_get_iter (tm,
                                 &iter,
                                 path))
  {
    GNUNET_break (0);
    return;
  }
  gtk_tree_path_free (path);
  gtk_tree_model_get (tm,
                      &iter,
                      AG_PRMC_POLICY_INDEX,
                      &pindex,
                      AG_PRMC_IS_CHALLENGE,
                      &is_challenge,
                      -1);
  if (! is_challenge)
    return;
  AG_edit_policy (pindex);
}
