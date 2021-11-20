/*
 Copyright 2017 Jeremy Scheff
 Copyright 2019 Florian Dold

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 or implied. See the License for the specific language governing
 permissions and limitations under the License.
*/

import test from "ava";
import { getIndexKeys } from "./getIndexKeys";

test("basics", (t) => {
  t.deepEqual(getIndexKeys({ foo: 42 }, "foo", false), [42]);
  t.deepEqual(getIndexKeys({ foo: { bar: 42 } }, "foo.bar", false), [42]);
  t.deepEqual(getIndexKeys({ foo: [42, 43] }, "foo.0", false), [42]);
  t.deepEqual(getIndexKeys({ foo: [42, 43] }, "foo.1", false), [43]);

  t.deepEqual(getIndexKeys([1, 2, 3], "", false), [[1, 2, 3]]);

  t.throws(() => {
    getIndexKeys({ foo: 42 }, "foo.bar", false);
  });

  t.deepEqual(getIndexKeys({ foo: 42 }, "foo", true), [42]);
  t.deepEqual(getIndexKeys({ foo: 42, bar: 10 }, ["foo", "bar"], true), [
    42,
    10,
  ]);
  t.deepEqual(getIndexKeys({ foo: 42, bar: 10 }, ["foo", "bar"], false), [
    [42, 10],
  ]);
  t.deepEqual(
    getIndexKeys({ foo: 42, bar: 10 }, ["foo", "bar", "spam"], true),
    [42, 10],
  );

  t.throws(() => {
    getIndexKeys({ foo: 42, bar: 10 }, ["foo", "bar", "spam"], false);
  });
});
