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
 * @file src/anastasis/anastasis-gtk_handle-expiration-change.c
 * @brief
 * @author Christian Grothoff
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_helper.h"
#include "anastasis-gtk_action.h"
#include <jansson.h>


struct GNUNET_TIME_Absolute
AG_get_desired_expiration ()
{
  GtkSpinButton *spin_button;
  gint value;
  struct GNUNET_TIME_Absolute res;
  struct GNUNET_TIME_Absolute exp_time;
  struct GNUNET_JSON_Specification spec[] = {
    GNUNET_JSON_spec_absolute_time ("expiration",
                                    &exp_time),
    GNUNET_JSON_spec_end ()
  };
  struct tm tv;

  if (GNUNET_OK !=
      GNUNET_JSON_parse (AG_redux_state,
                         spec,
                         NULL, NULL))
  {
    GNUNET_break (0);
    AG_error ("State did not parse correctly: lacks expiration");
    return GNUNET_TIME_UNIT_ZERO_ABS;
  }

  {
    time_t t;

    t = exp_time.abs_value_us / GNUNET_TIME_UNIT_SECONDS.rel_value_us;
    GNUNET_assert (NULL !=
                   localtime_r (&t,
                                &tv));
  }

  spin_button = GTK_SPIN_BUTTON (GCG_get_main_window_object (
                                   "expiration_year_spin_button"));
  value = gtk_spin_button_get_value_as_int (spin_button);
  tv.tm_year = value - 1900;
  {
    time_t t = mktime (&tv);

    res.abs_value_us = t * GNUNET_TIME_UNIT_SECONDS.rel_value_us;
  }
  return res;
}


/**
 * Callback invoked if the user changed when the
 * backup may expire. Update cost.
 *
 * @param spin_button the spin button that changed
 * @param user_data NULL
 */
void
expiration_year_spin_button_value_changed_cb (
  GtkSpinButton *spin_button,
  gpointer user_data)
{
  json_t *arg;
  struct GNUNET_TIME_Absolute expiration;

  if (AG_in_action)
    return;
  expiration = AG_get_desired_expiration ();
  if (0 == expiration.abs_value_us)
    return; /* failured */
  (void) GNUNET_TIME_round_abs (&expiration);
  arg = GNUNET_JSON_PACK (
    GNUNET_JSON_pack_time_abs ("expiration",
                               (expiration)));
  AG_freeze ();
  AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                  "update_expiration",
                                  arg,
                                  &AG_action_cb,
                                  NULL);
  json_decref (arg);
}
