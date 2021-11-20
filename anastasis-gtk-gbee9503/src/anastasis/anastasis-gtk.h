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
 * @file src/include/anastasis-gtk_helper.h
 * @brief Definition of helpers.
 * @author Christian Grothoff
 * @author Dennis Neufeld
 */
#ifndef ANASTASIS_GTK_H
#define ANASTASIS_GTK_H
#include <gnunet-gtk/gnunet_gtk.h>
#include <gtk/gtk.h>
#include <anastasis/anastasis_service.h>
#include <anastasis/anastasis_redux.h>

/**
 * Handle to our main loop.
 */
extern struct GNUNET_GTK_MainLoop *AG_ml;

/**
 * Our configuration.
 */
extern const struct GNUNET_CONFIGURATION_Handle *AG_cfg;

/**
 * Hash map from UUID hashes to GtkWidgets.
 */
extern struct GNUNET_CONTAINER_MultiHashMap *AG_entry_attributes;

/**
 * Actual state.
 */
extern json_t *AG_redux_state;

/**
 * Handle to an ongoing action.
 */
extern struct ANASTASIS_ReduxAction *AG_ra;

/**
 * Handle to an ongoing background action.
 */
extern struct ANASTASIS_ReduxAction *AG_long_action;

/**
 * Handle to task to reschedule #AG_long_action.
 */
extern struct GNUNET_SCHEDULER_Task *AG_long_task;


/**
 * Stop long polling action in the background.
 * Should be called whenever we leave the
 * challenge-selecting state.
 */
void
AG_stop_long_action (void);


/**
 * Load #AG_redux_state from @a filename.
 *
 * @param filename to load
 */
void
AG_load (const char *filename);

#endif
