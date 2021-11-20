/*
 This file is part of GNU Taler
 (C) 2019 Taler Systems S.A.

 GNU Taler is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 GNU Taler is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 GNU Taler; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

/**
 * @author Florian Dold <dold@taler.net>
 */

/**
 * Imports.
 */
import {
  codecForString,
  buildCodecForObject,
  codecForList,
  Codec,
} from "./codec.js";
import { AmountString } from "./talerTypes.js";
import {
  ReserveTransaction,
  codecForReserveTransaction,
} from "./ReserveTransaction.js";

/**
 * Status of a reserve.
 *
 * Schema type for the exchange's response to "/reserve/status".
 */
export interface ReserveStatus {
  /**
   * Balance left in the reserve.
   */
  balance: AmountString;

  /**
   * Transaction history for the reserve.
   */
  history: ReserveTransaction[];
}

export const codecForReserveStatus = (): Codec<ReserveStatus> =>
  buildCodecForObject<ReserveStatus>()
    .property("balance", codecForString())
    .property("history", codecForList(codecForReserveTransaction()))
    .build("ReserveStatus");
