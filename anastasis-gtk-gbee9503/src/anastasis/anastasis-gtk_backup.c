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
 * @file src/anastasis/anastasis-gtk_backup.c
 * @brief Main function of anastasis-gtk
 * @author Christian Grothoff
 * @author Dennis Neufeld
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_helper.h"
#include <jansson.h>


/**
 * Callback invoked if the the "video OK"-button is clicked.
 *
 * @param object
 * @param user_data unused
 */
void
anastasis_gtk_b_video_dialog_btn_ok_clicked_cb (GObject *object,
                                                gpointer user_data)
{
  GtkHBox *hbox;
  GtkBox *vbox = GTK_BOX (GCG_get_main_window_object (
                            "anastasis_gtk_b_authentication_vbox"));

  bool is_box = GTK_IS_BOX (user_data);
  if (is_box)
  {
    hbox = (GtkHBox *) user_data;
    // if is_box is true, we are editing and have to delete the old method
    delete_auth_method (user_data);
  }
  else
    hbox = (GtkHBox *) gtk_box_new (GTK_ORIENTATION_HORIZONTAL, 0);
  // set labels
  GtkLabel *label_prefix = (GtkLabel *) gtk_label_new ("VIDEO: ");
  const gchar *photo_path = gtk_entry_get_text (
    GTK_ENTRY (GCG_get_main_window_object (
                 "anastasis_gtk_b_video_dialog_photo_path_entry")));
  GtkLabel *label_photo_path = (GtkLabel *) gtk_label_new (photo_path);
  {
    // build json arguments for reducer
    json_t *arguments = json_object ();
    json_t *auth_method = json_object ();
    json_t *method_data = json_object ();

    json_object_set_new (auth_method, "method", json_string ("video"));
    json_object_set_new (method_data, "picture", json_string (photo_path));       // FIXME: load photo, not only path
    json_object_set_new (auth_method, "data", method_data);
    json_object_set_new (arguments, "authentication_method", method_data);

    ra = ANASTASIS_redux_action (AG_redux_state,
                                 "add_authentication",
                                 arguments,
                                 &AG_action_cb,
                                 NULL);
  }

  // set buttons
  GtkHButtonBox *buttons = (GtkHButtonBox *) gtk_box_new (1, 0);
  GtkButton  *edit_btn = (GtkButton *) gtk_button_new_from_icon_name (
    "gtk-edit", GTK_ICON_SIZE_BUTTON);
  g_signal_connect (edit_btn,
                    "clicked",
                    G_CALLBACK (
                      anastasis_gtk_b_auth_method_btn_edit_clicked_cb),
                    hbox);
  GtkButton  *delete_btn = (GtkButton *) gtk_button_new_from_icon_name (
    "gtk-delete", GTK_ICON_SIZE_BUTTON);
  g_signal_connect (delete_btn,
                    "clicked",
                    G_CALLBACK (
                      anastasis_gtk_b_auth_method_btn_delete_clicked_cb),
                    hbox);
  gtk_box_pack_start (GTK_BOX (buttons), GTK_WIDGET (edit_btn), 0, 0, 0);
  gtk_box_pack_start (GTK_BOX (buttons), GTK_WIDGET (delete_btn), 0, 0, 0);

  gtk_box_pack_start (GTK_BOX (hbox), GTK_WIDGET (label_prefix), 0, 0, 0);
  gtk_box_pack_start (GTK_BOX (hbox), GTK_WIDGET (label_photo_path), 0, 0, 0);
  gtk_box_pack_end (GTK_BOX (hbox), GTK_WIDGET (buttons), 0, 0, 0);

  if (! is_box)
  {
    gtk_box_pack_start (GTK_BOX (vbox), GTK_WIDGET (hbox), 0, 0, 0);
  }

  gtk_widget_show (GTK_WIDGET (hbox));
  gtk_widget_show (GTK_WIDGET (label_prefix));
  gtk_widget_show (GTK_WIDGET (label_photo_path));
  gtk_widget_show (GTK_WIDGET (buttons));
  gtk_widget_show (GTK_WIDGET (edit_btn));
  gtk_widget_show (GTK_WIDGET (delete_btn));

  gtk_entry_set_text (GTK_ENTRY (
                        GCG_get_main_window_object (
                          "anastasis_gtk_b_video_dialog_photo_path_entry")),
                      "");
  gtk_widget_hide (GTK_WIDGET (GCG_get_main_window_object (
                                 "anastasis_gtk_b_video_dialog")));
  gtk_widget_set_sensitive (GTK_WIDGET (GCG_get_main_window_object (
                                          "anastasis_gtk_main_window_forward_button")),
                            true);
}


/**
 * Callback invoked if the the "video"-button is clicked.
 *
 * @param object
 * @param user_data unused
 */
void
anastasis_gtk_btn_add_auth_video_clicked_cb (GObject *object,
                                             gpointer user_data)
{
  gtk_widget_show (GTK_WIDGET (GCG_get_main_window_object (
                                 "anastasis_gtk_b_video_dialog")));
}
