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
 * @file src/anastasis/anastasis-gtk_handle-core-secret-name-changed.c
 * @brief The user changed the name of the core secret. Update state.
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
anastasis_gtk_enter_secret_name_entry_changed_cb (GtkEditable *entry,
                                                  gpointer user_data)
{
  GtkEntry *ne = GTK_ENTRY (entry);
  const char *name = gtk_entry_get_text (ne);
  json_t *arguments;

  if (AG_in_action)
    return;
  arguments = GNUNET_JSON_PACK (
    GNUNET_JSON_pack_string ("name",
                             name));
  AG_freeze ();
  AG_in_secret_name_editing = true;
  AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                  "enter_secret_name",
                                  arguments,
                                  &AG_action_cb,
                                  NULL);
  GNUNET_break (NULL == AG_ra);
  AG_focus ("anastasis_gtk_secret_name_entry");
  AG_in_secret_name_editing = false;
  json_decref (arguments);
}
