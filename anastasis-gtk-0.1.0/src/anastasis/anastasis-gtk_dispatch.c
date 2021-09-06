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
 * @file src/anastasis/anastasis-gtk_dispatch.c
 * @brief Generic state dispatcher
 * @author Christian Grothoff
 */
#include <gnunet/platform.h>
#include "anastasis-gtk_helper.h"
#include "anastasis-gtk_dispatch.h"


int
AG_dispatch (const struct DispatchItem *dt)
{
  for (unsigned int i = 0; NULL != dt[i].state; i++)
  {
    if (! AG_check_state (AG_redux_state,
                          dt[i].state))
      continue;
    dt[i].action ();
    return GNUNET_OK;
  }
  return GNUNET_SYSERR;
}
