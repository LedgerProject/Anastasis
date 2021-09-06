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
 * @file src/anastasis/anastasis-gtk_handle-clear-secret-clicked.c
 * @brief Handle user clicking a 'clear' button in the enter secret dialog
 * @author Christian Grothoff
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_helper.h"
#include <jansson.h>


/**
 * Callback invoked if the the "backup"-button is clicked.
 *
 * @param object
 * @param user_data unused
 */
void
anastasis_gtk_secret_clear_button_clicked_cb (GObject *object,
                                              gpointer user_data)
{
  AG_freeze ();
  AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                  "clear_secret",
                                  NULL,
                                  &AG_action_cb,
                                  NULL);
}
