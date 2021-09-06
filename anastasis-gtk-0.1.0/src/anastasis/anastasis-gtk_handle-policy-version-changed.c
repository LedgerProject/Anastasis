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
 * @file src/anastasis/anastasis-gtk_handle-policy-version-changed.c
 * @brief
 * @author Christian Grothoff
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_helper.h"
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_attributes.h"
#include "anastasis-gtk_handle-identity-changed.h"
#include <jansson.h>


/**
 * Function called with the results of #ANASTASIS_redux_action.
 *
 * @param cls closure
 * @param error_code Error code
 * @param response new state as result or config information of a provider
 */
static void
change_action_cb (void *cls,
                  enum TALER_ErrorCode error_code,
                  json_t *response)
{
  (void) cls;
  AG_ra = NULL;
  if (TALER_EC_NONE != error_code)
  {
    AG_error ("Error: %s (%d)\n",
              TALER_ErrorCode_get_hint (error_code),
              error_code);
    AG_insensitive ("anastasis_gtk_main_window_forward_button");
    return;
  }
  AG_action_cb (NULL,
                TALER_EC_NONE,
                response);
}


/**
 * The version or provider URL was edited by the user. Try to
 * download the specified version from the specified provider.
 */
static void
update_policy (void)
{
  GtkSpinButton *sb;
  GtkEntry *ge;
  gint version;
  const char *provider_url;
  GtkWidget *toplevel;

  if (AG_in_action)
    return;
  toplevel = gtk_widget_get_toplevel (
    GTK_WIDGET (GCG_get_main_window_object (
                  "anastasis_gtk_main_window")));
  if (NULL != AG_ra)
  {
    ANASTASIS_redux_action_cancel (AG_ra);
    AG_ra = NULL;
  }

  if (NULL !=
      json_object_get (AG_redux_state,
                       "challenge_feedback"))
  {
    GtkWidget *diag;
    gint ret;

    diag = gtk_message_dialog_new (
      GTK_WINDOW (toplevel),
      GTK_DIALOG_MODAL,
      GTK_MESSAGE_QUESTION,
      GTK_BUTTONS_OK_CANCEL,
      _ ("This action will reset all of your challenge solving progress!"));
    ret = gtk_dialog_run (GTK_DIALOG (diag));
    gtk_widget_destroy (diag);
    switch (ret)
    {
    case GTK_RESPONSE_OK:
      break;
    default:
      {
        /* call action to reset view */
        json_t *cp = json_incref (AG_redux_state);

        AG_action_cb (NULL,
                      TALER_EC_NONE,
                      cp);
        json_decref (cp);
      }
      /* user aborted */
      return;
    }
  }

  sb = GTK_SPIN_BUTTON (GCG_get_main_window_object (
                          "anastasis_gtk_policy_version_spin_button"));
  ge = GTK_ENTRY (GCG_get_main_window_object (
                    "anastasis_gtk_provider_url_entry"));
  provider_url = gtk_entry_get_text (ge);
  if (! ( ( (0 == strncasecmp (provider_url,
                               "https://",
                               strlen ("https://"))) &&
            (strlen (provider_url) >= strlen ("https://X/")) ) ||
          ( (0 == strncasecmp (provider_url,
                               "http://",
                               strlen ("http://"))) &&
            (strlen (provider_url) >= strlen ("http://X/")) ) ) )
  {
    AG_error ("Notice: URL must begin with 'http://' or 'https://'.");
    AG_insensitive ("anastasis_gtk_main_window_forward_button");
    return;
  }
  if ( (0 == strlen (provider_url)) ||
       ('/' != provider_url[strlen (provider_url) - 1]) )
  {
    AG_error ("Notice: URL must end with '/'.");
    AG_insensitive ("anastasis_gtk_main_window_forward_button");
    return;
  }
  version = gtk_spin_button_get_value_as_int (sb);

  {
    json_t *args;

    args = GNUNET_JSON_PACK (
      GNUNET_JSON_pack_uint64 ("version",
                               version),
      GNUNET_JSON_pack_string ("provider_url",
                               provider_url));
    AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                    "change_version",
                                    args,
                                    &change_action_cb,
                                    NULL);
    json_decref (args);
  }
}


void
anastasis_gtk_policy_version_spin_button_changed_cb (GtkEditable *entry,
                                                     gpointer user_data)
{
  update_policy ();
}


void
anastasis_gtk_provider_url_entry_changed_cb (GtkEditable *entry,
                                             gpointer user_data)
{
  update_policy ();
}
