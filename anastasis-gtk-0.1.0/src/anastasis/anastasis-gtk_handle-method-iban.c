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
 * @file src/anastasis/anastasis-gtk_handle-method-iban.c
 * @brief Handle dialogs for security iban
 * @author Christian Grothoff
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_helper.h"
#include "anastasis-gtk_handle-identity-changed.h"
#include <jansson.h>


/**
 * Return obfuscated variant of an IBAN.
 *
 * @param iban input address
 * @return obfuscated version, NULL on errors
 */
static char *
mask_iban (const char *iban)
{
  size_t slen = strlen (iban);
  char *result;

  GNUNET_assert (slen > 5);
  GNUNET_asprintf (&result,
                   "%.*s...%s",
                   (int) 5,
                   iban,
                   &iban[slen - 5]);
  return result;
}


/**
 * Function called from the security-iban dialog upon completion.
 *
 * @param dialog the pseudonym selection dialog
 * @param response_id response code from the dialog
 * @param user_data the builder of the dialog
 */
void
anastasis_gtk_b_iban_dialog_response_cb (GtkDialog *dialog,
                                         gint response_id,
                                         gpointer user_data)
{
  GtkBuilder *builder = GTK_BUILDER (user_data);
  GtkEntry *q;
  const char *qs;
  json_t *args;
  char *ins;
  char *pe;

  if (GTK_RESPONSE_OK != response_id)
  {
    gtk_widget_destroy (GTK_WIDGET (dialog));
    g_object_unref (G_OBJECT (builder));
    return;
  }
  q = GTK_ENTRY (gtk_builder_get_object (builder,
                                         "anastasis_gtk_b_iban_dialog_iban_entry"));
  qs = gtk_entry_get_text (q);
  pe = mask_iban (qs);
  GNUNET_asprintf (&ins,
                   _ ("IBAN %s"),
                   pe);
  GNUNET_free (pe);
  args = json_pack ("{ s:{s:s, s:o, s:s}}",
                    "authentication_method",
                    "type",
                    "iban",
                    "challenge",
                    GNUNET_JSON_from_data (qs,
                                           strlen (qs)),
                    "instructions",
                    ins);
  GNUNET_free (ins);
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


void
anastasis_gtk_b_iban_dialog_iban_entry_changed_cb (GtkEntry *entry,
                                                   gpointer user_data)
{
  GtkBuilder *builder = GTK_BUILDER (user_data);
  GtkEntry *q;
  const char *qs;
  char *err;

  q = GTK_ENTRY (gtk_builder_get_object (builder,
                                         "anastasis_gtk_b_iban_dialog_iban_entry"));
  qs = gtk_entry_get_text (q);
  err = TALER_iban_validate (qs);
  gtk_widget_set_sensitive (
    GTK_WIDGET (gtk_builder_get_object (builder,
                                        "anastasis_gtk_b_iban_dialog_btn_ok")),
    NULL == err);
  if (NULL != err)
  {
    /* TODO: show _inside_ the dialog instead of in logs... */
    GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                "IBAN `%s' invalid: %s\n",
                qs,
                err);
  }
  GNUNET_free (err);
}


/**
 * Callback invoked if the the "secure iban"-button is clicked.
 *
 * @param object
 * @param user_data unused
 */
void
anastasis_gtk_btn_add_auth_iban_clicked_cb (GObject *object,
                                            gpointer user_data)
{
  GtkWidget *ad;
  GtkBuilder *builder;

  builder = GNUNET_GTK_get_new_builder ("anastasis_gtk_auth_add_iban.glade",
                                        NULL);
  if (NULL == builder)
  {
    GNUNET_break (0);
    return;
  }
  ad = GTK_WIDGET (gtk_builder_get_object (builder,
                                           "anastasis_gtk_b_iban_dialog"));
  {
    GtkWidget *toplevel;

    toplevel = gtk_widget_get_toplevel (GTK_WIDGET (object));
    gtk_window_set_transient_for (GTK_WINDOW (ad),
                                  GTK_WINDOW (toplevel));
    gtk_window_present (GTK_WINDOW (ad));
  }
}
