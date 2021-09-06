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
 * @file src/anastasis/anastasis-gtk_handle-policy-button.c
 * @brief Handle right-click context menu in policy review
 * @author Christian Grothoff
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_helper.h"
#include "anastasis-gtk_pe.h"
#include <jansson.h>


gboolean
anastasis_gtk_review_policy_treeview_key_press_event_cb (
  GtkWidget *widget,
  GdkEvent  *event,
  gpointer user_data)
{
  GtkTreeView *tv;
  GtkTreeSelection *ts;
  GtkTreeModel *tm;
  GtkTreeIter iter;
  guint pindex;
  gboolean is_challenge;
  guint mindex;

  if ( (GDK_KEY_PRESS != event->type) ||
       (GDK_KEY_Delete != ((GdkEventKey *) event)->keyval) )
    return FALSE;
  tv = GTK_TREE_VIEW (GCG_get_main_window_object (
                        "anastasis_gtk_review_policy_treeview"));
  ts = gtk_tree_view_get_selection (tv);
  if (! gtk_tree_selection_get_selected (ts,
                                         &tm,
                                         &iter))
  {
    GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                "Nothing selected, cannot delete\n");
    return FALSE;
  }
  gtk_tree_model_get (tm,
                      &iter,
                      AG_PRMC_POLICY_INDEX,
                      &pindex,
                      AG_PRMC_IS_CHALLENGE,
                      &is_challenge,
                      AG_PRMC_METHOD_INDEX,
                      &mindex,
                      -1);
  if (is_challenge)
    AG_delete_challenge (pindex,
                         mindex);
  else
    AG_delete_policy (pindex);
  return TRUE;
}
