/*
  This file is part of Anastasis
  Copyright (C) 2021 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU Lesser General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with
  Anastasis; see the file COPYING.GPL.  If not, see <http://www.gnu.org/licenses/>
*/
/**
 * @file iban.h
 * @brief data structures for wire transfer notification
 * @author Christian Grothoff
 */
#include "platform.h"
#include <taler/taler_dbevents.h>

#ifndef IBAN_H
#define IBAN_H

GNUNET_NETWORK_STRUCT_BEGIN

/**
 * Structure describing an IBAN event in the database.
 */
struct IbanEventP
{
  /**
   * Header of type #TALER_DBEVENT_ANASTASIS_AUTH_IBAN_TRANSFER.
   */
  struct GNUNET_DB_EventHeaderP header;

  /**
   * Zero.
   */
  uint32_t reserved GNUNET_PACKED;

  /**
   * Code to be included in the wire transfer subject.
   */
  uint64_t code GNUNET_PACKED;

  /**
   * Hash of the debit account of the transaction.
   */
  struct GNUNET_HashCode debit_iban_hash;
};


GNUNET_NETWORK_STRUCT_END

#endif
