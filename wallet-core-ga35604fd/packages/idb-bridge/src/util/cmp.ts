/*
 Copyright 2017 Jeremy Scheff

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

import { DataError } from "./errors";
import { valueToKey } from "./valueToKey";

const getType = (x: any) => {
  if (typeof x === "number") {
    return "Number";
  }
  if (x instanceof Date) {
    return "Date";
  }
  if (Array.isArray(x)) {
    return "Array";
  }
  if (typeof x === "string") {
    return "String";
  }
  if (x instanceof ArrayBuffer) {
    return "Binary";
  }

  throw new DataError();
};

// https://w3c.github.io/IndexedDB/#compare-two-keys
export const compareKeys = (first: any, second: any): -1 | 0 | 1 => {
  if (second === undefined) {
    throw new TypeError();
  }

  first = valueToKey(first);
  second = valueToKey(second);

  const t1 = getType(first);
  const t2 = getType(second);

  if (t1 !== t2) {
    if (t1 === "Array") {
      return 1;
    }
    if (
      t1 === "Binary" &&
      (t2 === "String" || t2 === "Date" || t2 === "Number")
    ) {
      return 1;
    }
    if (t1 === "String" && (t2 === "Date" || t2 === "Number")) {
      return 1;
    }
    if (t1 === "Date" && t2 === "Number") {
      return 1;
    }
    return -1;
  }

  if (t1 === "Binary") {
    first = new Uint8Array(first);
    second = new Uint8Array(second);
  }

  if (t1 === "Array" || t1 === "Binary") {
    const length = Math.min(first.length, second.length);
    for (let i = 0; i < length; i++) {
      const result = compareKeys(first[i], second[i]);

      if (result !== 0) {
        return result;
      }
    }

    if (first.length > second.length) {
      return 1;
    }
    if (first.length < second.length) {
      return -1;
    }
    return 0;
  }

  if (t1 === "Date") {
    if (first.getTime() === second.getTime()) {
      return 0;
    }
  } else {
    if (first === second) {
      return 0;
    }
  }

  return first > second ? 1 : -1;
};
