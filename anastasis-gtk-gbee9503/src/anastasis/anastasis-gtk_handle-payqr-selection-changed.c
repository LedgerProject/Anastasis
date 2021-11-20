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
 * @file src/anastasis/anastasis-gtk_handle-payqr-selection-changed.c
 * @brief
 * @author Christian Grothoff
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_helper.h"
#include <jansson.h>


/**
 * Callback invoked if the QR code selection changed.
 *
 * @param selection A GtkTreeSelection.
 * @param user_data user data set when the signal handler was connected.
 */
void
unpaid_qr_tree_selection_changed_cb (GtkTreeSelection *selection,
                                     gpointer user_data)
{
  GtkTreeModel *model;
  GtkTreeIter iter;
  GtkClipboard *cb;

  cb = gtk_clipboard_get (GDK_SELECTION_PRIMARY);
  GNUNET_assert (NULL != cb);
  if (gtk_tree_selection_get_selected (selection,
                                       &model,
                                       &iter))
  {
    char *uri;

    gtk_tree_model_get (model,
                        &iter,
                        AG_UQRMC_URL, &uri,
                        -1);
    gtk_clipboard_set_text (cb,
                            uri,
                            strlen (uri));
    g_free (uri);
  }
  else
  {
    gtk_clipboard_set_text (cb,
                            "",
                            0);
  }
}
