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
 * @file src/anastasis/anastasis-gtk_handle-challenge-code.c
 * @brief Handle dialogs for code returned to challenge address (Email, SMS, POST)
 * @author Christian Grothoff
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_helper.h"
#include "anastasis-gtk_handle-identity-changed.h"
#include <jansson.h>


/**
 * Function called from the secure question challenge dialog upon completion.
 *
 * @param dialog the pseudonym selection dialog
 * @param response_id response code from the dialog
 * @param user_data the builder of the dialog
 */
void
anastasis_gtk_c_code_dialog_response_cb (GtkDialog *dialog,
                                         gint response_id,
                                         gpointer user_data)
{
  GtkBuilder *builder = GTK_BUILDER (user_data);
  GtkEntry *q;
  const char *qs;
  json_t *args;
  unsigned long long pin;
  char dummy;

  if (GTK_RESPONSE_OK != response_id)
  {
    gtk_widget_destroy (GTK_WIDGET (dialog));
    g_object_unref (G_OBJECT (builder));
    GNUNET_assert (NULL == AG_ra);
    AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                    "back",
                                    NULL,
                                    &AG_action_cb,
                                    NULL);
    return;
  }
  q = GTK_ENTRY (gtk_builder_get_object (builder,
                                         "anastasis_gtk_c_code_entry"));
  qs = gtk_entry_get_text (q);
  if ( (NULL != qs) &&
       (0 == strncasecmp ("a-", qs, 2)) )
    qs += 2; /* skip "A-" prefix if present */
  if (1 != sscanf (qs,
                   "%llu%c",
                   &pin,
                   &dummy))
  {
    GNUNET_break (0);
    return;
  }
  args = GNUNET_JSON_PACK (
    GNUNET_JSON_pack_uint64 ("pin",
                             pin));
  gtk_widget_destroy (GTK_WIDGET (dialog));
  g_object_unref (G_OBJECT (builder));
  AG_freeze ();
  AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                  "solve_challenge",
                                  args,
                                  &AG_action_cb,
                                  NULL);
  json_decref (args);
}


void
anastasis_gtk_c_code_dialog_answer_entry_changed_cb (GtkEntry *entry,
                                                     gpointer user_data)
{
  GtkBuilder *builder = GTK_BUILDER (user_data);
  GtkEntry *a;
  const char *as;
  unsigned int pin;
  char dummy;
  bool ok;

  a = GTK_ENTRY (gtk_builder_get_object (builder,
                                         "anastasis_gtk_c_code_entry"));
  as = gtk_entry_get_text (a);
  if ( (NULL != as) &&
       (0 == strncasecmp ("a-", as, 2)) )
    as += 2; /* skip "A-" prefix if present */
  ok = ( (NULL != as) &&
         (1 == sscanf (as,
                       "%u%c",
                       &pin,
                       &dummy)) );
  gtk_widget_set_sensitive (
    GTK_WIDGET (gtk_builder_get_object (builder,
                                        "anastasis_gtk_c_code_dialog_btn_ok")),
    ok);
}
