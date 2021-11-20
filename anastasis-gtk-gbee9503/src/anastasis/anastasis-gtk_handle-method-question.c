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
 * @file src/anastasis/anastasis-gtk_handle-method-question.c
 * @brief Handle dialogs for security question
 * @author Christian Grothoff
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_helper.h"
#include "anastasis-gtk_handle-identity-changed.h"
#include <jansson.h>


/**
 * Function called from the security-question dialog upon completion.
 *
 * @param dialog the pseudonym selection dialog
 * @param response_id response code from the dialog
 * @param user_data the builder of the dialog
 */
void
anastasis_gtk_b_question_dialog_response_cb (GtkDialog *dialog,
                                             gint response_id,
                                             gpointer user_data)
{
  GtkBuilder *builder = GTK_BUILDER (user_data);
  GtkEntry *q;
  GtkEntry *a;
  const char *qs;
  const char *as;
  json_t *args;

  if (GTK_RESPONSE_OK != response_id)
  {
    gtk_widget_destroy (GTK_WIDGET (dialog));
    g_object_unref (G_OBJECT (builder));
    return;
  }
  q = GTK_ENTRY (gtk_builder_get_object (builder,
                                         "anastasis_gtk_b_question_dialog_question_entry"));
  qs = gtk_entry_get_text (q);
  a = GTK_ENTRY (gtk_builder_get_object (builder,
                                         "anastasis_gtk_b_question_dialog_answer_entry"));
  as = gtk_entry_get_text (a);
  args = json_pack ("{ s:{s:s, s:o, s:s}}",
                    "authentication_method",
                    "type",
                    "question",
                    "challenge",
                    GNUNET_JSON_from_data (as,
                                           strlen (as)),
                    "instructions",
                    qs);
  gtk_widget_destroy (GTK_WIDGET (dialog));
  g_object_unref (G_OBJECT (builder));
  AG_freeze ();
  AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                  "add_authentication",
                                  args,
                                  &AG_action_cb,
                                  NULL);
  json_decref (args);
}


static void
update_sensitivity (GtkBuilder *builder)
{
  GtkEntry *q;
  GtkEntry *a;
  const char *qs;
  const char *as;

  q = GTK_ENTRY (gtk_builder_get_object (builder,
                                         "anastasis_gtk_b_question_dialog_question_entry"));
  qs = gtk_entry_get_text (q);
  a = GTK_ENTRY (gtk_builder_get_object (builder,
                                         "anastasis_gtk_b_question_dialog_answer_entry"));
  as = gtk_entry_get_text (a);
  gtk_widget_set_sensitive (
    GTK_WIDGET (gtk_builder_get_object (builder,
                                        "anastasis_gtk_b_question_dialog_btn_ok")),
    ( (NULL != qs) &&
      (0 < strlen (qs)) &&
      (NULL != as) &&
      (0 < strlen (as)) ));
}


void
anastasis_gtk_b_question_dialog_question_entry_changed_cb (GtkEntry *entry,
                                                           gpointer user_data)
{
  GtkBuilder *builder = GTK_BUILDER (user_data);

  update_sensitivity (builder);
}


void
anastasis_gtk_b_question_dialog_answer_entry_changed_cb (GtkEntry *entry,
                                                         gpointer user_data)
{
  GtkBuilder *builder = GTK_BUILDER (user_data);

  update_sensitivity (builder);
}


/**
 * Callback invoked if the the "secure question"-button is clicked.
 *
 * @param object
 * @param user_data unused
 */
void
anastasis_gtk_btn_add_auth_question_clicked_cb (GObject *object,
                                                gpointer user_data)
{
  GtkWidget *ad;
  GtkBuilder *builder;

  builder = GNUNET_GTK_get_new_builder ("anastasis_gtk_auth_add_question.glade",
                                        NULL);
  if (NULL == builder)
  {
    GNUNET_break (0);
    return;
  }
  ad = GTK_WIDGET (gtk_builder_get_object (builder,
                                           "anastasis_gtk_b_question_dialog"));
  {
    GtkWidget *toplevel;

    toplevel = gtk_widget_get_toplevel (GTK_WIDGET (object));
    gtk_window_set_transient_for (GTK_WINDOW (ad),
                                  GTK_WINDOW (toplevel));
    gtk_window_present (GTK_WINDOW (ad));
  }
}
