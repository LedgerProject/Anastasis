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

import { IDBKeyPath, IDBValidKey } from "../idbtypes";
import { extractKey } from "./extractKey";
import { valueToKey } from "./valueToKey";

export function getIndexKeys(
  value: any,
  keyPath: IDBKeyPath | IDBKeyPath[],
  multiEntry: boolean,
): IDBValidKey[] {
  if (multiEntry && Array.isArray(keyPath)) {
    const keys = [];
    for (const subkeyPath of keyPath) {
      const key = extractKey(subkeyPath, value);
      try {
        const k = valueToKey(key);
        keys.push(k);
      } catch {
        // Ignore invalid subkeys
      }
    }
    return keys;
  } else if (typeof keyPath === "string" || Array.isArray(keyPath)) {
    let key = extractKey(keyPath, value);
    return [valueToKey(key)];
  } else {
    throw Error(`unsupported key path: ${typeof keyPath}`);
  }
}
