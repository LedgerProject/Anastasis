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
 * @file src/anastasis/anastasis-gtk_pe-delete-policy.c
 * @brief Handle request to delete policy
 * @author Christian Grothoff
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_helper.h"
#include "anastasis-gtk_pe.h"
#include <jansson.h>


void
AG_delete_policy (guint pindex)
{
  json_t *args;

  args = GNUNET_JSON_PACK (
    GNUNET_JSON_pack_uint64 ("policy_index",
                             (json_int_t) pindex));
  AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                  "delete_policy",
                                  args,
                                  &AG_action_cb,
                                  NULL);
  json_decref (args);
}
