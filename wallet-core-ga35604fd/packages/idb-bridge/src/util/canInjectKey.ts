/*
 Copyright 2017 Jeremy Scheff
 Copyright 20201 Taler Systems SA

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

import { IDBKeyPath } from "../idbtypes";

/**
 * Check that a key could be injected into a value.
 *
 * https://www.w3.org/TR/IndexedDB/#check-that-a-key-could-be-injected-into-a-value
 */
export function canInjectKey(
  keyPath: IDBKeyPath | IDBKeyPath[],
  value: any,
): boolean {
  if (Array.isArray(keyPath)) {
    throw new Error(
      "The key paths used in this section are always strings and never sequences, since it is not possible to create a object store which has a key generator and also has a key path that is a sequence.",
    );
  }

  const identifiers = keyPath.split(".");
  if (identifiers.length === 0) {
    throw new Error("Assert: identifiers is not empty");
  }
  identifiers.pop();

  for (const identifier of identifiers) {
    if (
      value === null ||
      (typeof value !== "object" && !Array.isArray(value))
    ) {
      return false;
    }

    const hop = value.hasOwnProperty(identifier);
    if (!hop) {
      return true;
    }

    value = value[identifier];
  }

  return value !== null && (typeof value === "object" || Array.isArray(value));
}
