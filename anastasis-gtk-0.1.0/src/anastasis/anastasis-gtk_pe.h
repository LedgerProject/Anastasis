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
 * @file src/anastasis/anastasis-gtk_pe.h
 * @brief Subsystem to handle policy editing
 * @author Christian Grothoff
 */
#ifndef ANASTASIS_GTK_PE_H
#define ANASTASIS_GTK_PE_H

/**
 * Delete a challenge at @a mindex in the policy
 * at @a pindex.
 *
 * @param pindex policy to edit
 * @param mindex challenge index to remove
 */
void
AG_delete_challenge (guint pindex,
                     guint mindex);


/**
 * Delete a policy at @a pindex.
 *
 * @param pindex index of policy to remove
 */
void
AG_delete_policy (guint pindex);


/**
 * Edit policy at @a pindex.
 *
 * @param pindex index of policy to edit
 */
void
AG_edit_policy (guint pindex);


/**
 * Add a new policy.
 */
void
AG_add_policy (void);


#endif
