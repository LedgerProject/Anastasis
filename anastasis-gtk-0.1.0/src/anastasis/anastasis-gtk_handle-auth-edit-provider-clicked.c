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
 * @file src/anastasis/anastasis-gtk_backup.c
 * @brief Main function of anastasis-gtk
 * @author Christian Grothoff
 * @author Dennis Neufeld
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_helper.h"
#include "anastasis-gtk_handle-main-window-forward-clicked.h"
#include <jansson.h>
#include <microhttpd.h>


void
url_add_button_clicked_cb (GtkButton *button,
                           gpointer user_data)
{
  GtkBuilder *builder = GTK_BUILDER (user_data);
  GtkListStore *ls;
  GtkEntry *entry;
  const char *url;

  ls = GTK_LIST_STORE (gtk_builder_get_object (builder,
                                               "provider_liststore"));
  GNUNET_assert (NULL != ls);
  entry = GTK_ENTRY (gtk_builder_get_object (builder,
                                             "url_entry"));
  url = gtk_entry_get_text (entry);
  gtk_list_store_insert_with_values (ls,
                                     NULL,
                                     -1,
                                     AG_PMC_PROVIDER_URL, url,
                                     -1);
  gtk_entry_set_text (entry,
                      "");
}


void
url_entry_changed_cb (GtkEntry *entry,
                      gpointer user_data)
{
  GtkBuilder *builder = GTK_BUILDER (user_data);
  GtkWidget *button;
  const char *url;

  button = GTK_WIDGET (gtk_builder_get_object (builder,
                                               "add_button"));
  url = gtk_entry_get_text (entry);
  gtk_widget_set_sensitive (button,
                            (0 == strncasecmp (url,
                                               "http://",
                                               strlen ("http://"))) ||
                            (0 == strncasecmp (url,
                                               "https://",
                                               strlen ("https://"))));
}


/**
 * Function called from the edit-provider dialog upon completion.
 *
 * @param dialog the pseudonym selection dialog
 * @param response_id response code from the dialog
 * @param user_data the builder of the dialog
 */
void
edit_provider_dialog_response_cb (GtkDialog *dialog,
                                  gint response_id,
                                  gpointer user_data)
{
  GtkBuilder *builder = GTK_BUILDER (user_data);
  GtkTreeModel *tm;
  GtkTreeIter iter;
  const json_t *providers;
  json_t *urls;

  if (GTK_RESPONSE_APPLY != response_id)
  {
    gtk_widget_destroy (GTK_WIDGET (dialog));
    g_object_unref (G_OBJECT (builder));
    return;
  }
  tm = GTK_TREE_MODEL (gtk_builder_get_object (builder,
                                               "provider_liststore"));
  if (NULL == tm)
  {
    GNUNET_break (0);
    return;
  }
  providers = json_object_get (AG_redux_state,
                               "authentication_providers");
  urls = json_array ();
  if (gtk_tree_model_get_iter_first (tm,
                                     &iter))
    do {
      gchar *url;

      gtk_tree_model_get (tm,
                          &iter,
                          AG_PMC_PROVIDER_URL, &url,
                          -1);
      if (NULL == json_object_get (providers,
                                   url))
      {
        GNUNET_assert (0 ==
                       json_array_append_new (urls,
                                              json_string (url)));
      }
      g_free (url);
    }
    while (gtk_tree_model_iter_next (tm,
                                     &iter));
  gtk_widget_destroy (GTK_WIDGET (dialog));
  g_object_unref (G_OBJECT (builder));
  {
    json_t *args;

    args = GNUNET_JSON_PACK (
      GNUNET_JSON_pack_array_steal ("urls",
                                    urls));
    AG_freeze ();
    AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                    "add_provider",
                                    args,
                                    &AG_action_cb,
                                    NULL);
    json_decref (args);
  }
}


/**
 * Callback invoked if the the "Edit"-provider list button is clicked.
 *
 * @param object
 * @param user_data unused
 */
void
anastasis_gtk_edit_provider_list_clicked_cb (GtkButton *object,
                                             gpointer user_data)
{
  GtkWidget *ad;
  GtkBuilder *builder;
  GtkListStore *ls;
  json_t *providers;

  builder = GNUNET_GTK_get_new_builder ("anastasis_gtk_edit_providers.glade",
                                        NULL);
  if (NULL == builder)
  {
    GNUNET_break (0);
    return;
  }
  ls = GTK_LIST_STORE (gtk_builder_get_object (builder,
                                               "provider_liststore"));
  providers = json_object_get (AG_redux_state,
                               "authentication_providers");
  {
    const char *url;
    const json_t *provider;
    json_object_foreach (providers, url, provider)
    {
      uint32_t http_code;
      uint32_t ec;
      struct GNUNET_JSON_Specification spec[] = {
        GNUNET_JSON_spec_mark_optional (
          GNUNET_JSON_spec_uint32 ("http_status",
                                   &http_code)),
        GNUNET_JSON_spec_mark_optional (
          GNUNET_JSON_spec_uint32 ("error_code",
                                   &ec)),
        GNUNET_JSON_spec_end ()
      };
      char *status;
      const char *color;

      if (GNUNET_OK !=
          GNUNET_JSON_parse (provider,
                             spec,
                             NULL, NULL))
      {
        GNUNET_break (0);
        json_dumpf (provider,
                    stderr,
                    JSON_INDENT (2));
        continue;
      }
      if (MHD_HTTP_OK == http_code)
      {
        status = GNUNET_strdup (_ ("available"));
        color = "green";
      }
      else if (0 == http_code)
      {
        GNUNET_asprintf (&status,
                         _ ("Network failure: %s (#%u)"),
                         TALER_ErrorCode_get_hint (ec),
                         (unsigned int) ec);
        color = "red";
      }
      else
      {
        GNUNET_asprintf (&status,
                         _ ("HTTP %s (%u): %s (#%u)"),
                         MHD_get_reason_phrase_for (http_code),
                         (unsigned int) http_code,
                         TALER_ErrorCode_get_hint (ec),
                         (unsigned int) ec);
        color = "red";
      }
      gtk_list_store_insert_with_values (ls,
                                         NULL,
                                         -1,
                                         AG_PMC_PROVIDER_URL, url,
                                         AG_PMC_PROVIDER_STATUS, status,
                                         AG_PMC_PROVIDER_STATUS_COLOR, color,
                                         -1);
      GNUNET_free (status);
    }
  }
  ad = GTK_WIDGET (gtk_builder_get_object (builder,
                                           "edit_provider_dialog"));
  {
    GtkWidget *toplevel;

    toplevel = gtk_widget_get_toplevel (GTK_WIDGET (object));
    gtk_window_set_transient_for (GTK_WINDOW (ad),
                                  GTK_WINDOW (toplevel));
    gtk_window_present (GTK_WINDOW (ad));
  }
}
