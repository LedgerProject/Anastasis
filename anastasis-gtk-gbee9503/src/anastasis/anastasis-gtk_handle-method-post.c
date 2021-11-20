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
 * @file src/anastasis/anastasis-gtk_handle-method-post.c
 * @brief Handle dialogs for security post
 * @author Christian Grothoff
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_helper.h"
#include "anastasis-gtk_handle-identity-changed.h"
#include <jansson.h>


/**
 * Get text of @a widget_name from builder @a b.
 *
 * @param b a builder
 * @param widget_name name of an entry widget of @a b
 * @return associated text
 */
static const char *
gt (GtkBuilder *b,
    const char *widget_name)
{
  GtkEntry *q;

  q = GTK_ENTRY (gtk_builder_get_object (b,
                                         widget_name));
  if (NULL == q)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Could not find GtkEntry widget `%s'\n",
                widget_name);
  }
  return gtk_entry_get_text (q);
}


/**
 * Function called from the security-post dialog upon completion.
 *
 * @param dialog the pseudonym selection dialog
 * @param response_id response code from the dialog
 * @param user_data the builder of the dialog
 */
void
anastasis_gtk_b_post_dialog_response_cb (GtkDialog *dialog,
                                         gint response_id,
                                         gpointer user_data)
{
  GtkBuilder *builder = GTK_BUILDER (user_data);
  json_t *args;
  char *addr_s;
  char *ins;

  if (GTK_RESPONSE_OK != response_id)
  {
    gtk_widget_destroy (GTK_WIDGET (dialog));
    g_object_unref (G_OBJECT (builder));
    return;
  }
  GNUNET_asprintf (&ins,
                   _ ("postal address %s"),
                   gt (builder,
                       "anastasis_gtk_b_post_dialog_postcode_entry"));
  {
    json_t *addr;

    addr = GNUNET_JSON_PACK (
      GNUNET_JSON_pack_string ("full_name",
                               gt (builder,
                                   "anastasis_gtk_b_post_dialog_full_name_entry")),
      GNUNET_JSON_pack_string ("street",
                               gt (builder,
                                   "anastasis_gtk_b_post_dialog_street_entry")),
      GNUNET_JSON_pack_string ("city",
                               gt (builder,
                                   "anastasis_gtk_b_post_dialog_city_entry")),
      GNUNET_JSON_pack_string ("postcode",
                               gt (builder,
                                   "anastasis_gtk_b_post_dialog_postcode_entry")),
      GNUNET_JSON_pack_string ("country",
                               gt (builder,
                                   "anastasis_gtk_b_post_dialog_country_entry")));
    addr_s = json_dumps (addr,
                         JSON_COMPACT | JSON_SORT_KEYS);
    json_decref (addr);
  }
  args = json_pack ("{ s:{s:s, s:o, s:s}}",
                    "authentication_method",
                    "type",
                    "post",
                    "challenge",
                    GNUNET_JSON_from_data (addr_s,
                                           strlen (addr_s)),
                    "instructions",
                    ins);
  free (addr_s);
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
anastasis_gtk_b_post_dialog_entry_changed_cb (GtkEntry *entry,
                                              gpointer user_data)
{
  const char *fields[] = {
    "anastasis_gtk_b_post_dialog_full_name_entry",
    "anastasis_gtk_b_post_dialog_street_entry",
    "anastasis_gtk_b_post_dialog_city_entry",
    "anastasis_gtk_b_post_dialog_postcode_entry",
    "anastasis_gtk_b_post_dialog_country_entry",
    NULL
  };
  GtkBuilder *builder = GTK_BUILDER (user_data);
  bool sensitive = true;

  for (unsigned int i = 0; NULL != fields[i]; i++)
  {
    const char *qs;

    qs = gt (builder,
             fields[i]);
    if ( (NULL == qs) ||
         (0 == strlen (qs)) )
    {
      sensitive = false;
      break;
    }
  }

  {
    GtkWidget *button;

    button = GTK_WIDGET (gtk_builder_get_object (builder,
                                                 "anastasis_gtk_b_post_dialog_btn_ok"));
    gtk_widget_set_sensitive (button,
                              sensitive);
  }
}


/**
 * Callback invoked if the the "secure post"-button is clicked.
 *
 * @param object
 * @param user_data unused
 */
void
anastasis_gtk_btn_add_auth_post_clicked_cb (GObject *object,
                                            gpointer user_data)
{
  GtkWidget *ad;
  GtkBuilder *builder;

  builder = GNUNET_GTK_get_new_builder ("anastasis_gtk_auth_add_post.glade",
                                        NULL);
  if (NULL == builder)
  {
    GNUNET_break (0);
    return;
  }
  ad = GTK_WIDGET (gtk_builder_get_object (builder,
                                           "anastasis_gtk_b_post_dialog"));
  {
    GtkWidget *toplevel;

    toplevel = gtk_widget_get_toplevel (GTK_WIDGET (object));
    gtk_window_set_transient_for (GTK_WINDOW (ad),
                                  GTK_WINDOW (toplevel));
    gtk_window_present (GTK_WINDOW (ad));
  }
}
