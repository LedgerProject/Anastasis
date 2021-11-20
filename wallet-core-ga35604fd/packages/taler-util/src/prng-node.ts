/*
 This file is part of GNU Taler
 (C) 2021 Taler Systems S.A.

 GNU Taler is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 GNU Taler is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 GNU Taler; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

import { setPRNG } from "./nacl-fast.js";
import cr from "crypto";

export function initNodePrng() {
  // Initialize PRNG if environment provides CSPRNG.
  // If not, methods calling randombytes will throw.
  if (cr && cr.randomBytes) {
    setPRNG(function (x: Uint8Array, n: number) {
      const v = cr.randomBytes(n);
      for (let i = 0; i < n; i++) x[i] = v[i];
      for (let i = 0; i < v.length; i++) v[i] = 0;
    });
  }
}
