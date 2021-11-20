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
import { valueToKey } from "./valueToKey";

// http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-for-extracting-a-key-from-a-value-using-a-key-path
export const extractKey = (keyPath: IDBKeyPath | IDBKeyPath[], value: any) => {
  if (Array.isArray(keyPath)) {
    const result: IDBValidKey[] = [];

    for (let item of keyPath) {
      // This doesn't make sense to me based on the spec, but it is needed to pass the W3C KeyPath tests (see same
      // comment in validateKeyPath)
      if (
        item !== undefined &&
        item !== null &&
        typeof item !== "string" &&
        (item as any).toString
      ) {
        item = (item as any).toString();
      }
      result.push(valueToKey(extractKey(item, value)));
    }

    return result;
  }

  if (keyPath === "") {
    return value;
  }

  let remainingKeyPath: string | null = keyPath;
  let object = value;

  while (remainingKeyPath !== null) {
    let identifier;

    const i = remainingKeyPath.indexOf(".");
    if (i >= 0) {
      identifier = remainingKeyPath.slice(0, i);
      remainingKeyPath = remainingKeyPath.slice(i + 1);
    } else {
      identifier = remainingKeyPath;
      remainingKeyPath = null;
    }

    if (!object.hasOwnProperty(identifier)) {
      return;
    }

    object = object[identifier];
  }

  return object;
};
