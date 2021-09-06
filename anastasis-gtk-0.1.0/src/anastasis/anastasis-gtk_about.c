/*
     This file is part of Anastasis-gtk
     Copyright (C) 2005-2013, 2021 Anastasis SARL

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
 * @file src/anastasis/anastasis-gtk_about.c
 * @author Christian Grothoff
 *
 * This file contains the about dialog.
 */
#include <gnunet/platform.h>
#include <gnunet-gtk/gnunet_gtk.h>


void
ANASTASIS_GTK_about_close_response (GtkDialog *dialog,
                                    gint response_id,
                                    gpointer user_data)
{
  GtkBuilder *builder = user_data;

  gtk_widget_destroy (GTK_WIDGET (dialog));
  g_object_unref (G_OBJECT (builder));
}


/**
 * This displays an about window
 */
void
anastasis_gtk_about_imagemenuitem_activate_cb (GtkWidget *dummy,
                                               gpointer data)
{
  GtkBuilder *builder;
  GtkWidget *diag;

  builder = GNUNET_GTK_get_new_builder ("anastasis_gtk_about_window.glade",
                                        NULL);
  if (NULL == builder)
  {
    GNUNET_break (0);
    return;
  }
  diag = GTK_WIDGET (gtk_builder_get_object (builder,
                                             "about_window"));
  gtk_widget_show (diag);
}


/* end of anastasis-gtk_about.c */
