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
 * @file src/anastasis/anastasis-gtk_dispatch.h
 * @brief Generic state dispatcher
 * @author Christian Grothoff
 * @author Dennis Neufeld
 */
#ifndef ANASTASIS_GTK_DISPATCH_H
#define ANASTASIS_GTK_DISPATCH_H

/**
 * Dispatch table item.
 */
struct DispatchItem
{
  /**
   * State in which to run @a action.
   */
  const char *state;

  /**
   * The action function to execute.
   */
  void (*action)(void);
};


/**
 * Run actions as per the given dispatch table based on the
 * current #AG_redux_state.
 *
 * @param dt dispatching table
 * @return #GNUNET_OK if an action was run from @a dt
 */
int
AG_dispatch (const struct DispatchItem *dt);

#endif
