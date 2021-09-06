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
 * @file src/anastasis/anastasis-gtk_handle-main-window-back-clicked.c
 * @brief
 * @author Christian Grothoff
 * @author Dennis Neufeld
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_helper.h"
#include <jansson.h>


/**
 * Start interaction from the beginning.
 */
static void
fresh_start (void)
{
  AG_hide_all_frames ();
  json_decref (AG_redux_state);
  AG_redux_state = NULL;
  AG_hide ("anastasis_gtk_progress_vbox");
  AG_hide ("anastasis_gtk_backup_progress_scrolled_window");
  AG_hide ("anastasis_gtk_recovery_progress_scrolled_window");
  AG_hide ("anastasis_gtk_restart_button");
  AG_hide ("anastasis_gtk_main_control_vbox");
  AG_show ("anastasis_gtk_start_frame");
}


/**
 * Callback invoked if the "back"-button is clicked.
 *
 * @param object
 * @param user_data unused
 */
void
anastasis_gtk_main_window_back_clicked (GObject *object,
                                        gpointer user_data)
{
  const char *state;

  (void) object;
  (void) user_data;
  if (NULL != AG_ra)
  {
    /* This happens if we were long polling for payment */
    ANASTASIS_redux_action_cancel (AG_ra);
    AG_ra = NULL;
  }
  state = json_string_value (json_object_get (AG_redux_state,
                                              "recovery_state"));
  if (NULL == state)
    state = json_string_value (json_object_get (AG_redux_state,
                                                "backup_state"));

  if ( (0 == strcasecmp (state,
                         "CONTINENT_SELECTING")) ||
       (0 == strcasecmp (state,
                         "COUNTRY_SELECTING")) )
  {
    AG_hide ("anastasis_gtk_country_selection_image");
    AG_hide ("anastasis_gtk_continent_frame");
    AG_hide ("anastasis_gtk_continent_selection_image");
    AG_hide ("anastasis_gtk_country_selection_image");
    fresh_start ();
    return;
  }
  AG_freeze ();
  AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                  "back",
                                  NULL,
                                  &AG_action_cb,
                                  NULL);
}


/**
 * Callback invoked if the "restart"-button is clicked.
 *
 * @param object
 * @param user_data unused
 */
void
anastasis_gtk_restart_button_clicked_cb (GObject *object,
                                         gpointer user_data)
{
  (void) object;
  (void) user_data;
  AG_hide ("anastasis_gtk_restart_button");
  fresh_start ();
}
