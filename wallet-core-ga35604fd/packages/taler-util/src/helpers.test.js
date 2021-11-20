/*
 This file is part of TALER
 (C) 2017 Inria and GNUnet e.V.

 TALER is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 TALER is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 TALER; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */
import test from "ava";
import * as helpers from "./helpers";
test("URL canonicalization", (t) => {
  // converts to relative, adds https
  t.is(
    "https://alice.example.com/exchange/",
    helpers.canonicalizeBaseUrl("alice.example.com/exchange"),
  );
  // keeps http, adds trailing slash
  t.is(
    "http://alice.example.com/exchange/",
    helpers.canonicalizeBaseUrl("http://alice.example.com/exchange"),
  );
  // keeps http, adds trailing slash
  t.is(
    "http://alice.example.com/exchange/",
    helpers.canonicalizeBaseUrl("http://alice.example.com/exchange#foobar"),
  );
  // Remove search component
  t.is(
    "http://alice.example.com/exchange/",
    helpers.canonicalizeBaseUrl("http://alice.example.com/exchange?foo=bar"),
  );
  t.pass();
});
//# sourceMappingURL=helpers.test.js.map
