/*
 This file is part of GNU Taler
 (C) 2019 GNUnet e.V.

 GNU Taler is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 GNU Taler is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 GNU Taler; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

import test from "ava";

import { parsePaytoUri } from "./payto.js";

test("basic payto parsing", (t) => {
  const r1 = parsePaytoUri("https://example.com/");
  t.is(r1, undefined);

  const r2 = parsePaytoUri("payto:blabla");
  t.is(r2, undefined);

  const r3 = parsePaytoUri("payto://x-taler-bank/123");
  t.is(r3?.targetType, "x-taler-bank");
  t.is(r3?.targetPath, "123");
});
