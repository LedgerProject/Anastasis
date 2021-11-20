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
 * @file src/anastasis/anastasis-gtk_handle-recovery-button-clicked.c
 * @brief Main function of anastasis-gtk
 * @author Christian Grothoff
 * @author Dennis Neufeld
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_helper.h"
#include <jansson.h>


/**
 * Callback invoked if the "recovery"-button is clicked.
 *
 * @param object
 * @param user_data unused
 */
void
anastasis_gtk_recovery_button_clicked_cb (GObject *object,
					  gpointer user_data)
{
  json_t *j;

  AG_freeze ();
  j = ANASTASIS_recovery_start (AG_cfg);
  AG_action_cb (NULL,
                TALER_EC_NONE,
                j);
  json_decref (j);
}
