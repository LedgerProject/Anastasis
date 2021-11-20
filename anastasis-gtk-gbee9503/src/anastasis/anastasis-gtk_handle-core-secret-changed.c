/*
     This file is part of anastasis-gtk.
     Copyright (C) 2020-2021 Anastasis SARL

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
 * @file src/anastasis/anastasis-gtk_handle-core-secret.c
 * @brief
 * @author Christian Grothoff
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_helper.h"
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_attributes.h"
#include "anastasis-gtk_handle-identity-changed.h"
#include "anastasis-gtk_handle-expiration-change.h"
#include <jansson.h>


void
anastasis_gtk_enter_secret_entry_changed_cb (GtkEditable *entry,
                                             gpointer user_data)
{
  GtkEntry *e = GTK_ENTRY (entry);
  const char *text = gtk_entry_get_text (e);
  json_t *arguments;
  struct GNUNET_TIME_Absolute expiration;

  if (AG_in_action)
    return;
  AG_in_secret_editing = true;
  expiration = AG_get_desired_expiration ();
  if (0 == expiration.abs_value_us)
    return;   /* failured */
  if ( (NULL == text) ||
       (0 == strlen (text)) )
  {
    AG_freeze ();
    AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                    "clear_secret",
                                    NULL,
                                    &AG_action_cb,
                                    NULL);
    AG_focus ("anastasis_gtk_enter_secret_entry");
    return;
  }
  arguments = json_pack ("{s:{s:s,s:s},s:o}",
                         "secret",
                         "text",
                         text,
                         "mime",
                         "text/plain",
                         "expiration",
                         GNUNET_JSON_from_time_abs (expiration));
  GNUNET_assert (NULL != arguments);
  AG_freeze ();
  AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                  "enter_secret",
                                  arguments,
                                  &AG_action_cb,
                                  NULL);
  json_decref (arguments);
  AG_focus ("anastasis_gtk_enter_secret_entry");
  AG_in_secret_editing = false;
}
