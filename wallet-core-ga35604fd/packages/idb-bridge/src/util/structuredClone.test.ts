/*
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

import test, { ExecutionContext } from "ava";
import { structuredClone } from "./structuredClone";

function checkClone(t: ExecutionContext, x: any): void {
  t.deepEqual(structuredClone(x), x);
}

test("structured clone", (t) => {
  checkClone(t, "foo");
  checkClone(t, [1, 2]);
  checkClone(t, true);
  checkClone(t, false);
  checkClone(t, { x1: "foo" });
  checkClone(t, { x1: true, x2: false });
  checkClone(t, new Date());
  checkClone(t, [new Date()]);
  checkClone(t, undefined);
  checkClone(t, [undefined]);

  t.throws(() => {
    structuredClone({ foo: () => {} });
  });

  t.throws(() => {
    structuredClone(Promise);
  });

  t.throws(() => {
    structuredClone(Promise.resolve());
  });
});

test("structured clone (cycles)", (t) => {
  const obj1: any[] = [1, 2];
  obj1.push(obj1);
  const obj1Clone = structuredClone(obj1);
  t.is(obj1Clone, obj1Clone[2]);
});
