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
 * Protocol version spoken with the exchange.
 *
 * Uses libtool's current:revision:age versioning.
 */
export const WALLET_EXCHANGE_PROTOCOL_VERSION = "10:0:0";

/**
 * Protocol version spoken with the merchant.
 *
 * Uses libtool's current:revision:age versioning.
 */
export const WALLET_MERCHANT_PROTOCOL_VERSION = "1:0:0";

/**
 * Protocol version spoken with the merchant.
 *
 * Uses libtool's current:revision:age versioning.
 */
export const WALLET_BANK_INTEGRATION_PROTOCOL_VERSION = "0:0:0";

/**
 * Cache breaker that is appended to queries such as /keys and /wire
 * to break through caching, if it has been accidentally/badly configured
 * by the exchange.
 *
 * This is only a temporary measure.
 */
export const WALLET_CACHE_BREAKER_CLIENT_VERSION = "3";
