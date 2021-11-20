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
 * @file src/anastasis/anastasis-gtk_handle-method-sms.c
 * @brief Handle dialogs for security sms
 * @author Christian Grothoff
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_helper.h"
#include "anastasis-gtk_handle-identity-changed.h"
#include <jansson.h>


/**
 * Return obfuscated variant of a phone number.
 *
 * @param number input address
 * @return obfuscated version, NULL on errors
 */
static char *
mask_number (const char *number)
{
  char *at;
  size_t nlen;
  char *result;

  result = GNUNET_strdup (number);
  at = strchr (result, '+');
  if ( (NULL != at) &&
       (result != at) )
  {
    GNUNET_break (0);
    GNUNET_free (result);
    return NULL;
  }
  nlen = strlen (number);
  if (NULL != at)
  {
    if (strlen (at) < 3)
    {
      GNUNET_break (0);
      GNUNET_free (result);
      return NULL;
    }
    at += 3;
    nlen -= 3;
  }
  else
  {
    at = result;
  }
  switch (nlen)
  {
  case 0:
    GNUNET_break (0);
    GNUNET_free (result);
    return NULL;
  case 1:
    at[0] = '?';
    break;
  case 2:
  case 3:
  case 4:
    at[0] = '?';
    at[1] = '?';
    break;
  default:
    for (unsigned int i = 1; i<nlen - 3; i++)
      at[i] = '?';
    break;
  }

  /* shorten multiple consecutive "?" to "*" */
  {
    bool star = false;
    bool qmark = false;
    size_t woff = 0;

    for (unsigned int i = 0; i<strlen (result); i++)
    {
      result[woff++] = result[i];
      if ('?' == result[i])
      {
        if (star)
        {
          /* more than two "??" in a row */
          woff--;
          continue;
        }
        if (qmark)
        {
          /* two "??", combine to "*" */
          result[--woff - 1] = '*';
          star = true;
          continue;
        }
        /* first qmark */
        qmark = true;
      }
      else
      {
        star = false;
        qmark = false;
      }
    }
    result[woff] = '\0';
  }
  return result;
}


/**
 * Function called from the security-sms dialog upon completion.
 *
 * @param dialog the pseudonym selection dialog
 * @param response_id response code from the dialog
 * @param user_data the builder of the dialog
 */
void
anastasis_gtk_b_sms_dialog_response_cb (GtkDialog *dialog,
                                        gint response_id,
                                        gpointer user_data)
{
  GtkBuilder *builder = GTK_BUILDER (user_data);
  GtkEntry *q;
  const char *qs;
  json_t *args;
  char *mn;
  char *ins;

  if (GTK_RESPONSE_OK != response_id)
  {
    gtk_widget_destroy (GTK_WIDGET (dialog));
    g_object_unref (G_OBJECT (builder));
    return;
  }
  q = GTK_ENTRY (gtk_builder_get_object (builder,
                                         "anastasis_gtk_b_sms_dialog_phonenumber_entry"));
  qs = gtk_entry_get_text (q);
  mn = mask_number (qs);
  GNUNET_asprintf (&ins,
                   _ ("phone number %s"),
                   mn);
  GNUNET_free (mn);
  args = json_pack ("{ s:{s:s, s:o, s:s}}",
                    "authentication_method",
                    "type",
                    "sms",
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
anastasis_gtk_b_sms_dialog_phonenumber_entry_changed_cb (GtkEntry *entry,
                                                         gpointer user_data)
{
  GtkBuilder *builder = GTK_BUILDER (user_data);
  GtkEntry *q;
  const char *qs;
  regex_t regex;
  int regex_result;
  const char *regexp = "^\\+?[0-9]+$";

  regex_result = regcomp (&regex,
                          regexp,
                          REG_EXTENDED);
  if (0 < regex_result)
  {
    GNUNET_break (0);
    return;
  }
  q = GTK_ENTRY (gtk_builder_get_object (builder,
                                         "anastasis_gtk_b_sms_dialog_phonenumber_entry"));
  qs = gtk_entry_get_text (q);
  regex_result = regexec (&regex,
                          qs,
                          0,
                          NULL,
                          0);
  regfree (&regex);
  gtk_widget_set_sensitive (
    GTK_WIDGET (gtk_builder_get_object (builder,
                                        "anastasis_gtk_b_sms_dialog_btn_ok")),
    0 == regex_result);
}


/**
 * Callback invoked if the the "secure sms"-button is clicked.
 *
 * @param object
 * @param user_data unused
 */
void
anastasis_gtk_btn_add_auth_sms_clicked_cb (GObject *object,
                                           gpointer user_data)
{
  GtkWidget *ad;
  GtkBuilder *builder;

  builder = GNUNET_GTK_get_new_builder ("anastasis_gtk_auth_add_sms.glade",
                                        NULL);
  if (NULL == builder)
  {
    GNUNET_break (0);
    return;
  }
  ad = GTK_WIDGET (gtk_builder_get_object (builder,
                                           "anastasis_gtk_b_sms_dialog"));
  {
    GtkWidget *toplevel;

    toplevel = gtk_widget_get_toplevel (GTK_WIDGET (object));
    gtk_window_set_transient_for (GTK_WINDOW (ad),
                                  GTK_WINDOW (toplevel));
    gtk_window_present (GTK_WINDOW (ad));
  }
}
