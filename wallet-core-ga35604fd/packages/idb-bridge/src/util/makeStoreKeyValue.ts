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

import { extractKey } from "./extractKey";
import { DataCloneError, DataError } from "./errors";
import { valueToKey } from "./valueToKey";
import { structuredClone } from "./structuredClone";
import { IDBKeyPath, IDBValidKey } from "../idbtypes";

export interface StoreKeyResult {
  updatedKeyGenerator: number;
  key: IDBValidKey;
  value: any;
}

function injectKey(
  keyPath: IDBKeyPath | IDBKeyPath[],
  value: any,
  key: IDBValidKey,
): any {
  if (Array.isArray(keyPath)) {
    throw new Error(
      "The key paths used in this section are always strings and never sequences, since it is not possible to create a object store which has a key generator and also has a key path that is a sequence.",
    );
  }

  const newValue = structuredClone(value);

  // Position inside the new value where we'll place the key eventually.
  let ptr = newValue;

  const identifiers = keyPath.split(".");
  if (identifiers.length === 0) {
    throw new Error("Assert: identifiers is not empty");
  }

  const lastIdentifier = identifiers.pop();

  if (lastIdentifier === null || lastIdentifier === undefined) {
    throw Error();
  }

  for (const identifier of identifiers) {
    if (typeof ptr !== "object" && !Array.isArray(ptr)) {
      throw new Error("can't inject key");
    }

    const hop = value.hasOwnProperty(identifier);
    if (!hop) {
      ptr[identifier] = {};
    }

    ptr = ptr[identifier];
  }

  if (!(typeof ptr === "object" || Array.isArray(ptr))) {
    throw new Error("can't inject key");
  }

  ptr[lastIdentifier] = structuredClone(key);

  return newValue;
}

export function makeStoreKeyValue(
  value: any,
  key: IDBValidKey | undefined,
  currentKeyGenerator: number,
  autoIncrement: boolean,
  keyPath: IDBKeyPath | IDBKeyPath[] | null,
): StoreKeyResult {
  const haveKey = key !== null && key !== undefined;
  const haveKeyPath = keyPath !== null && keyPath !== undefined;

  // This models a decision table on (haveKey, haveKeyPath, autoIncrement)

  try {
    value = structuredClone(value);
  } catch (e) {
    throw new DataCloneError();
  }

  if (haveKey) {
    if (haveKeyPath) {
      // (yes, yes, no)
      // (yes, yes, yes)
      throw new DataError();
    } else {
      if (autoIncrement) {
        // (yes, no, yes)
        key = valueToKey(key)!;
        let updatedKeyGenerator: number;
        if (typeof key !== "number") {
          updatedKeyGenerator = currentKeyGenerator;
        } else {
          updatedKeyGenerator = key;
        }
        return {
          key: key!,
          value: value,
          updatedKeyGenerator,
        };
      } else {
        // (yes, no, no)
        return {
          key: key!,
          value: value,
          updatedKeyGenerator: currentKeyGenerator,
        };
      }
    }
  } else {
    if (haveKeyPath) {
      if (autoIncrement) {
        // (no, yes, yes)

        let updatedKeyGenerator: number;
        const maybeInlineKey = extractKey(keyPath!, value);
        if (maybeInlineKey === undefined) {
          value = injectKey(keyPath!, value, currentKeyGenerator);
          key = currentKeyGenerator;
          updatedKeyGenerator = currentKeyGenerator + 1;
        } else if (typeof maybeInlineKey === "number") {
          key = maybeInlineKey;
          if (maybeInlineKey >= currentKeyGenerator) {
            updatedKeyGenerator = maybeInlineKey + 1;
          } else {
            updatedKeyGenerator = currentKeyGenerator;
          }
        } else {
          key = maybeInlineKey;
          updatedKeyGenerator = currentKeyGenerator;
        }
        return {
          key: key!,
          value: value,
          updatedKeyGenerator,
        };
      } else {
        // (no, yes, no)
        key = extractKey(keyPath!, value);
        key = valueToKey(key);
        return {
          key: key!,
          value: value,
          updatedKeyGenerator: currentKeyGenerator,
        };
      }
    } else {
      if (autoIncrement) {
        // (no, no, yes)
        return {
          key: currentKeyGenerator,
          value: value,
          updatedKeyGenerator: currentKeyGenerator + 1,
        };
      } else {
        // (no, no, no)
        throw new DataError();
      }
    }
  }
}
