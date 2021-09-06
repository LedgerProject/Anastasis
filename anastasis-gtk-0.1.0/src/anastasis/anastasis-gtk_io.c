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
 * @file src/anastasis/anastasis-gtk_io.c
 * @brief
 * @author Christian Grothoff
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_attributes.h"
#include "anastasis-gtk_dispatch.h"
#include "anastasis-gtk_helper.h"
#include <jansson.h>


/**
 * Function called from the open-directory dialog upon completion.
 *
 * @param dialog the pseudonym selection dialog
 * @param response_id response code from the dialog
 * @param user_data the builder of the dialog
 */
void
open_directory_dialog_response_cb (GtkDialog *dialog,
                                   gint response_id,
                                   gpointer user_data)
{
  GtkBuilder *builder = GTK_BUILDER (user_data);
  char *filename;

  if (GTK_RESPONSE_OK != response_id)
  {
    gtk_widget_destroy (GTK_WIDGET (dialog));
    g_object_unref (G_OBJECT (builder));
    return;
  }
  filename =
    GNUNET_GTK_filechooser_get_filename_utf8 (GTK_FILE_CHOOSER (dialog));
  gtk_widget_destroy (GTK_WIDGET (dialog));
  g_object_unref (G_OBJECT (builder));
  AG_load (filename);
  GNUNET_free (filename);
}


/**
 * User clicked the "open" button.
 *
 * @param button the button
 * @param user_data unused
 */
void
anastasis_gtk_open_state_clicked_cb (GtkButton *button,
                                     gpointer user_data)
{
  GtkWidget *ad;
  GtkBuilder *builder;

  builder = GNUNET_GTK_get_new_builder ("anastasis_gtk_open_file_dialog.glade",
                                        NULL);
  if (NULL == builder)
  {
    GNUNET_break (0);
    return;
  }
  ad = GTK_WIDGET (gtk_builder_get_object (builder,
                                           "open_file_dialog"));
  {
    GtkWidget *toplevel;

    toplevel = gtk_widget_get_toplevel (GTK_WIDGET (button));
    gtk_window_set_transient_for (GTK_WINDOW (ad),
                                  GTK_WINDOW (toplevel));
    gtk_window_present (GTK_WINDOW (ad));
  }
}


/**
 * Serialize state of currently shown use attribute editing frame to JSON.
 */
static void
save_user_attributes_collecting (void)
{
  json_t *ia;

  ia = AG_collect_attributes (true);
  if (NULL == ia)
  {
    GNUNET_break (0);
    return;
  }
  GNUNET_break (0 ==
                json_object_set (AG_redux_state,
                                 "identity_attributes",
                                 json_object_get (ia,
                                                  "identity_attributes")));
  json_decref (ia);
}


/**
 * Function called from the open-directory dialog upon completion.
 *
 * @param dialog the pseudonym selection dialog
 * @param response_id response code from the dialog
 * @param user_data the builder of the dialog
 */
void
save_directory_dialog_response_cb (GtkDialog *dialog,
                                   gint response_id,
                                   gpointer user_data)
{
  static const struct DispatchItem save_state[] = {
    { .state = "USER_ATTRIBUTES_COLLECTING",
      .action = &save_user_attributes_collecting },
    { .state = NULL,
      .action = NULL }
  };
  GtkBuilder *builder = GTK_BUILDER (user_data);
  char *filename;

  if (GTK_RESPONSE_ACCEPT != response_id)
  {
    gtk_widget_destroy (GTK_WIDGET (dialog));
    g_object_unref (G_OBJECT (builder));
    return;
  }
  (void) AG_dispatch (save_state);
  filename =
    GNUNET_GTK_filechooser_get_filename_utf8 (GTK_FILE_CHOOSER (dialog));
  gtk_widget_destroy (GTK_WIDGET (dialog));
  g_object_unref (G_OBJECT (builder));

  /* check if we should warn the user about writing 'core_secret' to disk */
  {
    json_t *cs;

    cs = json_object_get (AG_redux_state,
                          "core_secret");
    if ( (NULL != cs) &&
         (! json_is_null (cs)) )
    {
      GtkWidget *diag;
      gint ret;
      GtkWidget *toplevel;

      toplevel = gtk_widget_get_toplevel (
        GTK_WIDGET (GCG_get_main_window_object (
                      "anastasis_gtk_main_window")));
      diag = gtk_message_dialog_new (
        GTK_WINDOW (toplevel),
        GTK_DIALOG_MODAL,
        GTK_MESSAGE_QUESTION,
        GTK_BUTTONS_OK_CANCEL,
        _ ("This will write your secret to disk in cleartext!"));
      ret = gtk_dialog_run (GTK_DIALOG (diag));
      gtk_widget_destroy (diag);
      switch (ret)
      {
      case GTK_RESPONSE_OK:
        break;
      default:
        /* user aborted */
        return;
      }
    }
  }

  /* all good, do writing! */
  {
    const char *ana;

    ana = strstr (filename,
                  ".ana");
    if ( (NULL == ana) ||
         (4 != strlen (ana)) )
    {
      char *tmp;

      GNUNET_asprintf (&tmp,
                       "%s.ana",
                       filename);
      GNUNET_free (filename);
      filename = tmp;
    }
  }
  if (0 !=
      json_dump_file (AG_redux_state,
                      filename,
                      JSON_COMPACT))
  {
    AG_error ("Failed to write state to `%s'\n",
              filename);
  }
  GNUNET_free (filename);
}


/**
 * User clicked the "save as" button.
 *
 * @param button the button
 * @param user_data unused
 */
void
anastasis_gtk_main_window_save_as_button_clicked_cb (GtkButton *button,
                                                     gpointer user_data)
{
  GtkWidget *ad;
  GtkBuilder *builder;
  GtkWidget *toplevel;

  toplevel = gtk_widget_get_toplevel (GTK_WIDGET (button));
  builder = GNUNET_GTK_get_new_builder ("anastasis_gtk_save_file_dialog.glade",
                                        NULL);
  if (NULL == builder)
  {
    GNUNET_break (0);
    return;
  }
  ad = GTK_WIDGET (gtk_builder_get_object (builder,
                                           "save_file_dialog"));
  gtk_file_chooser_set_current_name (GTK_FILE_CHOOSER (ad),
                                     "untitled.ana");
  {
    gtk_window_set_transient_for (GTK_WINDOW (ad),
                                  GTK_WINDOW (toplevel));
    gtk_window_present (GTK_WINDOW (ad));
  }
}
