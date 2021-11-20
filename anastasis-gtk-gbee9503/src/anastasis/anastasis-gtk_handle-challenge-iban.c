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
 * @file src/anastasis/anastasis-gtk_handle-challenge-iban.c
 * @brief Handle dialog for IBAN challenge
 * @author Christian Grothoff
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk.h"
#include "anastasis-gtk_action.h"


/**
 * Function called from the IBAN dialog upon completion.
 *
 * @param dialog the pseudonym selection dialog
 * @param response_id response code from the dialog
 * @param user_data the builder of the dialog
 */
void
anastasis_gtk_c_iban_dialog_response_cb (GtkDialog *dialog,
                                         gint response_id,
                                         gpointer user_data)
{
  GtkBuilder *builder = GTK_BUILDER (user_data);

  gtk_widget_destroy (GTK_WIDGET (dialog));
  g_object_unref (G_OBJECT (builder));
  GNUNET_assert (NULL == AG_ra);
  AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                  "back",
                                  NULL,
                                  &AG_action_cb,
                                  NULL);
}
