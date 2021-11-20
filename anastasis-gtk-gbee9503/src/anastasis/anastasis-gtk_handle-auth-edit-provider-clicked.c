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


/**
 * Context for menu callbacks.
 */
struct MenuContext
{
  /**
   * Base URL of the selected provider.
   */
  char *url;

};


/**
 * An item was selected from the context menu; destroy the menu shell.
 *
 * @param menushell menu to destroy
 * @param user_data the 'struct MenuContext' of the menu
 */
static void
context_popup_selection_done (GtkMenuShell *menushell,
                              gpointer user_data)
{
  struct MenuContext *ctx = user_data;

  gtk_widget_destroy (GTK_WIDGET (menushell));
  GNUNET_free (ctx->url);
  GNUNET_free (ctx);
}


/**
 * Open @a url in a browser.
 *
 * @param url the URL to open
 */
static void
xdg_open (const char *url)
{
  pid_t chld;
  int status;

  chld = fork ();
  if (-1 == chld)
  {
    GNUNET_log_strerror (GNUNET_ERROR_TYPE_ERROR,
                         "fork");
    return;
  }
  if (0 == chld)
  {
    pid_t c2;

    c2 = fork ();
    if (-1 == c2)
      _exit (EXIT_FAILURE);
    if (0 != c2)
      _exit (EXIT_SUCCESS);
    execlp ("xdg-open",
            "xdg-open",
            url,
            NULL);
    execlp ("open",
            "open",
            url,
            NULL);
    GNUNET_log_strerror_file (GNUNET_ERROR_TYPE_ERROR,
                              "exec",
                              "open");
    _exit (EXIT_FAILURE);
  }
  waitpid (chld, &status, 0);
}


/**
 * The user selected the 'view pp' menu.
 *
 * @param menuitem the selected menu
 * @param user_data a `struct MenuContext`
 */
static void
view_terms_of_service (GtkMenuItem *menuitem,
                       gpointer user_data)
{
  struct MenuContext *ctx = user_data;
  char *tos;

  GNUNET_asprintf (&tos,
                   "%sterms",
                   ctx->url);
  xdg_open (tos);
  GNUNET_free (tos);
}


/**
 * The user selected the 'view tos' menu.
 *
 * @param menuitem the selected menu
 * @param user_data a `struct MenuContext`
 */
static void
view_privacy_policy (GtkMenuItem *menuitem,
                     gpointer user_data)
{
  struct MenuContext *ctx = user_data;
  char *pp;

  GNUNET_asprintf (&pp,
                   "%sprivacy",
                   ctx->url);
  xdg_open (pp);
  GNUNET_free (pp);
}


void
provider_toggle_callback (GtkCellRendererToggle *cell,
                          gchar *path_str,
                          gpointer user_data)
{
  GtkBuilder *builder = GTK_BUILDER (user_data);
  GtkTreeIter iter;
  GtkTreePath *path;
  gboolean enabled;
  GtkTreeModel *tm;

  tm = GTK_TREE_MODEL (gtk_builder_get_object (builder,
                                               "provider_liststore"));
  if (NULL == tm)
  {
    GNUNET_break (0);
    return;
  }
  path = gtk_tree_path_new_from_string (path_str);
  gtk_tree_model_get_iter (tm,
                           &iter,
                           path);
  gtk_tree_model_get (tm,
                      &iter,
                      AG_PMC_PROVIDER_ENABLED, &enabled,
                      -1);
  enabled = ! enabled;
  gtk_list_store_set (GTK_LIST_STORE (tm),
                      &iter,
                      AG_PMC_PROVIDER_ENABLED, enabled,
                      -1);
  gtk_tree_path_free (path);
}


/**
 * User clicked on the tree view. If it was a right-click, show
 * context menu to allow user to view PP or TOS.
 *
 * @param widget the tree view
 * @param event the event
 * @param user_data the builder
 */
gboolean
provider_tree_view_button_press_event_cb (GtkWidget *widget,
                                          GdkEvent *event,
                                          gpointer user_data)
{
  GtkBuilder *builder = GTK_BUILDER (user_data);
  GdkEventButton *event_button = (GdkEventButton *) event;
  GtkTreeView *tv;
  GtkTreeModel *tm;
  GtkTreePath *path;
  GtkTreeIter iter;
  struct MenuContext *ctx;
  GtkMenu *menu;

  if ((GDK_BUTTON_PRESS != event->type) ||
      (3 != event_button->button))
    return FALSE; /* not a right-click */
  tm = GTK_TREE_MODEL (gtk_builder_get_object (builder,
                                               "provider_liststore"));
  if (NULL == tm)
  {
    GNUNET_break (0);
    return FALSE;
  }
  tv = GTK_TREE_VIEW (gtk_builder_get_object (builder,
                                              "provider_tree_view"));
  if (! gtk_tree_view_get_path_at_pos (tv,
                                       event_button->x,
                                       event_button->y,
                                       &path,
                                       NULL,
                                       NULL,
                                       NULL))
  {
    /* nothing selected */
    return FALSE;
  }
  if (! gtk_tree_model_get_iter (tm,
                                 &iter,
                                 path))
  {
    /* not sure how we got a path but no iter... */
    GNUNET_break (0);
    return FALSE;
  }
  gtk_tree_path_free (path);
  ctx = GNUNET_new (struct MenuContext);
  gtk_tree_model_get (tm,
                      &iter,
                      AG_PMC_PROVIDER_URL, &ctx->url,
                      -1);
  menu = GTK_MENU (gtk_menu_new ());
  {
    GtkWidget *child;

    child = gtk_menu_item_new_with_label (_ ("View _privacy policy..."));
    g_signal_connect (child,
                      "activate",
                      G_CALLBACK (&view_privacy_policy),
                      ctx);
    gtk_label_set_use_underline (GTK_LABEL (
                                   gtk_bin_get_child (GTK_BIN (child))),
                                 TRUE);
    gtk_widget_show (child);
    gtk_menu_shell_append (GTK_MENU_SHELL (menu),
                           child);
  }
  {
    GtkWidget *child;

    child = gtk_menu_item_new_with_label (_ ("View _terms of service..."));
    g_signal_connect (child,
                      "activate",
                      G_CALLBACK (&view_terms_of_service),
                      ctx);
    gtk_label_set_use_underline (GTK_LABEL (
                                   gtk_bin_get_child (GTK_BIN (child))),
                                 TRUE);
    gtk_widget_show (child);
    gtk_menu_shell_append (GTK_MENU_SHELL (menu),
                           child);
  }

  g_signal_connect (menu,
                    "selection-done",
                    G_CALLBACK (&context_popup_selection_done),
                    ctx);

  gtk_menu_popup_at_pointer (menu,
                             event);

  return FALSE;
}


/**
 * The user clicked the "add" button to add a new provider to the list.
 *
 * @param button the button object
 * @param user_data the builder
 */
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
                                     AG_PMC_PROVIDER_STATUS, _ ("new"),
                                     AG_PMC_PROVIDER_STATUS_COLOR, "blue",
                                     AG_PMC_PROVIDER_ENABLED, true,
                                     AG_PMC_PROVIDER_SENSITIVE, false,
                                     AG_PMC_PROVIDER_NOT_SENSITIVE, true,
                                     -1);
  gtk_entry_set_text (entry,
                      "");
}


/**
 * FIXME.
 */
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
  json_t *args;

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
  args = json_object ();
  if (gtk_tree_model_get_iter_first (tm,
                                     &iter))
    do {
      gchar *url;
      gboolean enabled;

      gtk_tree_model_get (tm,
                          &iter,
                          AG_PMC_PROVIDER_URL, &url,
                          AG_PMC_PROVIDER_ENABLED, &enabled,
                          -1);
      GNUNET_assert (0 ==
                     json_object_set_new (
                       args,
                       url,
                       GNUNET_JSON_PACK (
                         GNUNET_JSON_pack_bool ("disabled",
                                                ! enabled))));
      g_free (url);
    }
    while (gtk_tree_model_iter_next (tm,
                                     &iter));
  gtk_widget_destroy (GTK_WIDGET (dialog));
  g_object_unref (G_OBJECT (builder));
  AG_freeze ();
  AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                  "add_provider",
                                  args,
                                  &AG_action_cb,
                                  NULL);
  json_decref (args);
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
      struct TALER_Amount ll;
      bool disabled = false;
      struct GNUNET_JSON_Specification spec[] = {
        GNUNET_JSON_spec_mark_optional (
          GNUNET_JSON_spec_uint32 ("http_status",
                                   &http_code)),
        GNUNET_JSON_spec_mark_optional (
          GNUNET_JSON_spec_bool ("disabled",
                                 &disabled)),
        GNUNET_JSON_spec_mark_optional (
          TALER_JSON_spec_amount_any ("liability_limit",
                                      &ll)),
        GNUNET_JSON_spec_mark_optional (
          GNUNET_JSON_spec_uint32 ("error_code",
                                   &ec)),
        GNUNET_JSON_spec_end ()
      };
      char *status;
      const char *color;
      bool sensitive = false;
      const char *ll_s = NULL;

      memset (&ll,
              0,
              sizeof (ll));
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
      if ( (MHD_HTTP_OK == http_code) &&
           (! disabled) )
      {
        status = GNUNET_strdup (_ ("available"));
        color = "green";
        sensitive = true;
        if (GNUNET_OK ==
            TALER_amount_is_valid (&ll))
          ll_s = TALER_amount2s (&ll);
        else
          GNUNET_break (0);
      }
      else if ( (0 == http_code) &&
                (! disabled) )
      {
        GNUNET_asprintf (&status,
                         _ ("Network failure: %s (#%u)"),
                         TALER_ErrorCode_get_hint (ec),
                         (unsigned int) ec);
        color = "red";
      }
      else if (disabled)
      {
        GNUNET_asprintf (&status,
                         _ ("disabled"));
        color = "blue";
        sensitive = true;
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
      gtk_list_store_insert_with_values (
        ls,
        NULL,
        -1,
        AG_PMC_PROVIDER_URL, url,
        AG_PMC_PROVIDER_STATUS, status,
        AG_PMC_PROVIDER_STATUS_COLOR, color,
        AG_PMC_PROVIDER_LIABILITY_LIMIT, ll_s,
        AG_PMC_PROVIDER_ENABLED, ! disabled,
        AG_PMC_PROVIDER_SENSITIVE, sensitive,
        AG_PMC_PROVIDER_NOT_SENSITIVE, ! sensitive,
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
