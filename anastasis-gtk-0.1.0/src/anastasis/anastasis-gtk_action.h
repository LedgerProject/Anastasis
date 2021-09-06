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
 * @file src/include/anastasis-gtk_action.h
 * @brief Definition of redux action result handler
 * @author Christian Grothoff
 * @author Dennis Neufeld
 */
#ifndef ANASTASIS_GTK_ACTION_H
#define ANASTASIS_GTK_ACTION_H
#include <gnunet-gtk/gnunet_gtk.h>
#include <gtk/gtk.h>
#include <anastasis/anastasis_service.h>
#include <anastasis/anastasis_redux.h>


/**
 * Are we currently processing an action?
 */
extern bool AG_in_action;

/**
 * Are we currently editing the secret?
 */
extern bool AG_in_secret_editing;

/**
 * Are we currently editing the secret name?
 */
extern bool AG_in_secret_name_editing;

/**
 * Function called with the results of #ANASTASIS_redux_action.
 *
 * @param cls closure
 * @param error_code Error code
 * @param response new state as result or config information of provider
 */
void
AG_action_cb (void *cls,
              enum TALER_ErrorCode error_code,
              json_t *response);


#endif
