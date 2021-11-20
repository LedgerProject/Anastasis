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

import { IDBValidKey } from "..";
import { DataError } from "./errors";

// https://www.w3.org/TR/IndexedDB-2/#convert-a-value-to-a-key
export function valueToKey(
  input: any,
  seen?: Set<object>,
): IDBValidKey | IDBValidKey[] {
  if (typeof input === "number") {
    if (isNaN(input)) {
      throw new DataError();
    }
    return input;
  } else if (input instanceof Date) {
    const ms = input.valueOf();
    if (isNaN(ms)) {
      throw new DataError();
    }
    return new Date(ms);
  } else if (typeof input === "string") {
    return input;
  } else if (
    input instanceof ArrayBuffer ||
    (typeof ArrayBuffer !== "undefined" &&
      ArrayBuffer.isView &&
      ArrayBuffer.isView(input))
  ) {
    if (input instanceof ArrayBuffer) {
      return new Uint8Array(input).buffer;
    }
    return new Uint8Array(input.buffer).buffer;
  } else if (Array.isArray(input)) {
    if (seen === undefined) {
      seen = new Set();
    } else if (seen.has(input)) {
      throw new DataError();
    }
    seen.add(input);

    const keys = [];
    for (let i = 0; i < input.length; i++) {
      const hop = input.hasOwnProperty(i);
      if (!hop) {
        throw new DataError();
      }
      const entry = input[i];
      const key = valueToKey(entry, seen);
      keys.push(key);
    }
    return keys;
  } else {
    throw new DataError();
  }
}
