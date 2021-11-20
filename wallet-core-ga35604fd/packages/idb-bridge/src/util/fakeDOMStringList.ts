/*
 * Copyright 2017 Jeremy Scheff
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

import { DOMStringList } from "../idbtypes";

/** @public */
export interface FakeDOMStringList extends Array<string> {
  contains: (value: string) => boolean;
  item: (i: number) => string | null;
}

// Would be nicer to sublcass Array, but I'd have to sacrifice Node 4 support to do that.

export const fakeDOMStringList = (arr: string[]): FakeDOMStringList => {
  const arr2 = arr.slice();

  Object.defineProperty(arr2, "contains", {
    value: (value: string) => arr2.indexOf(value) >= 0,
  });

  Object.defineProperty(arr2, "item", {
    value: (i: number) => {
      if (i < 0 || i >= arr2.length) {
        return null;
      }
      return arr2[i];
    },
  });

  return arr2 as FakeDOMStringList;
};
