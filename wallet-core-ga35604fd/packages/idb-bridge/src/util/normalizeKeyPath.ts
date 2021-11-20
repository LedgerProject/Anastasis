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

import { IDBKeyPath } from "../idbtypes";

export function normalizeKeyPath(
  keyPath: IDBKeyPath | IDBKeyPath[],
): string | string[] {
  if (Array.isArray(keyPath)) {
    const path: string[] = [];
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
      path.push(item);
    }
    return path;
  }
  return keyPath;
}
