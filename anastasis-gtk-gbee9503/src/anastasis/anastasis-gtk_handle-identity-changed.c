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
 * @file src/anastasis/anastasis-gtk_handle-identity-changed.c
 * @brief
 * @author Christian Grothoff
 * @author Dennis Neufeld
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
 * @param response new state as result or config information of provider
 */
static void
test_ok_cb (void *cls,
            enum TALER_ErrorCode error_code,
            json_t *response)
{
  bool *result = cls;

  if (TALER_EC_NONE == error_code)
    *result = true;
}


/**
 * Function to ckeck if required attributes are set.
 *
 * @return true if user-provided attributes satisfy the constraints
 */
static bool
check_attributes_fullfilled (void)
{
  struct ANASTASIS_ReduxAction *ta;
  json_t *args;
  bool result;

  args = AG_collect_attributes (false);
  if (NULL == args)
    return false;
  result = false;
  ta = ANASTASIS_redux_action (AG_redux_state,
                               "enter_user_attributes",
                               args,
                               &test_ok_cb,
                               &result);
  if (NULL != ta)
  {
    result = true;
    ANASTASIS_redux_action_cancel (ta);
  }
  json_decref (args);
  return result;
}


void
AG_identity_changed (void)
{
  if (check_attributes_fullfilled ())
    AG_sensitive ("anastasis_gtk_main_window_forward_button");
  else
    AG_insensitive ("anastasis_gtk_main_window_forward_button");
}
