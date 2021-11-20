/*
 This file is part of GNU Taler
 (C) 2020 Taler Systems S.A.

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
 * Imports
 */
import test from "ava";
import { pathsub, Configuration } from "./talerconfig.js";

test("pathsub", (t) => {
  t.assert("foo" === pathsub("foo", () => undefined));

  t.assert("fo${bla}o" === pathsub("fo${bla}o", () => undefined));

  const d: Record<string, string> = {
    w: "world",
    f: "foo",
    "1foo": "x",
    foo_bar: "quux",
  };

  t.is(
    pathsub("hello ${w}!", (v) => d[v]),
    "hello world!",
  );

  t.is(
    pathsub("hello ${w} ${w}!", (v) => d[v]),
    "hello world world!",
  );

  t.is(
    pathsub("hello ${x:-blabla}!", (v) => d[v]),
    "hello blabla!",
  );

  // No braces
  t.is(
    pathsub("hello $w!", (v) => d[v]),
    "hello world!",
  );
  t.is(
    pathsub("hello $foo!", (v) => d[v]),
    "hello $foo!",
  );
  t.is(
    pathsub("hello $1foo!", (v) => d[v]),
    "hello $1foo!",
  );
  t.is(
    pathsub("hello $$ world!", (v) => d[v]),
    "hello $$ world!",
  );
  t.is(
    pathsub("hello $$ world!", (v) => d[v]),
    "hello $$ world!",
  );

  t.is(
    pathsub("hello $foo_bar!", (v) => d[v]),
    "hello quux!",
  );

  // Recursive lookup in default
  t.is(
    pathsub("hello ${x:-${w}}!", (v) => d[v]),
    "hello world!",
  );

  // No variables in variable name part
  t.is(
    pathsub("hello ${${w}:-x}!", (v) => d[v]),
    "hello ${${w}:-x}!",
  );

  // Missing closing brace
  t.is(
    pathsub("hello ${w!", (v) => d[v]),
    "hello ${w!",
  );
});

test("path expansion", (t) => {
  const config = new Configuration();
  config.setString("paths", "taler_home", "foo/bar");
  config.setString(
    "paths",
    "taler_data_home",
    "$TALER_HOME/.local/share/taler/",
  );
  config.setString(
    "exchange",
    "master_priv_file",
    "${TALER_DATA_HOME}/exchange/offline-keys/master.priv",
  );
  t.is(
    config.getPath("exchange", "MaStER_priv_file").required(),
    "foo/bar/.local/share/taler//exchange/offline-keys/master.priv",
  );
});

test("recursive path resolution", (t) => {
  console.log("recursive test");
  const config = new Configuration();
  config.setString("paths", "a", "x${b}");
  config.setString("paths", "b", "y${a}");
  config.setString("foo", "x", "z${a}");
  t.throws(() => {
    config.getPath("foo", "a").required();
  });
});
