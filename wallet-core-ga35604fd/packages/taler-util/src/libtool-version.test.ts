/*
 This file is part of TALER
 (C) 2017 GNUnet e.V.

 TALER is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 TALER is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 TALER; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

import * as LibtoolVersion from "./libtool-version.js";

import test from "ava";

test("version comparison", (t) => {
  t.deepEqual(LibtoolVersion.compare("0:0:0", "0:0:0"), {
    compatible: true,
    currentCmp: 0,
  });
  t.deepEqual(LibtoolVersion.compare("0:0:0", ""), undefined);
  t.deepEqual(LibtoolVersion.compare("foo", "0:0:0"), undefined);
  t.deepEqual(LibtoolVersion.compare("0:0:0", "1:0:1"), {
    compatible: true,
    currentCmp: -1,
  });
  t.deepEqual(LibtoolVersion.compare("0:0:0", "1:5:1"), {
    compatible: true,
    currentCmp: -1,
  });
  t.deepEqual(LibtoolVersion.compare("0:0:0", "1:5:0"), {
    compatible: false,
    currentCmp: -1,
  });
  t.deepEqual(LibtoolVersion.compare("1:0:0", "0:5:0"), {
    compatible: false,
    currentCmp: 1,
  });
  t.deepEqual(LibtoolVersion.compare("1:0:1", "1:5:1"), {
    compatible: true,
    currentCmp: 0,
  });
});
