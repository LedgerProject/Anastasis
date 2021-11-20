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
#ifndef ANASTASIS_GTK_HANDLE_IDENTITY_CHANGED_H
#define ANASTASIS_GTK_HANDLE_IDENTITY_CHANGED_H

/**
 * Function called when the user changed anything about its identity.
 * Check whether the current input is valid and enables/disables the
 * 'forward' button accordingly.
 */
void
AG_identity_changed (void);

#endif
