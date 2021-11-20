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

export function openPromise<T>(): {
  promise: Promise<T>;
  resolve: (v?: T | PromiseLike<T>) => void;
  reject: (err?: any) => void;
} {
  let resolve;
  let reject;
  const promise = new Promise<T>((resolve2, reject2) => {
    resolve = resolve2;
    reject = reject2;
  });
  if (!resolve) {
    throw Error("broken invariant");
  }
  if (!reject) {
    throw Error("broken invariant");
  }

  return { promise, resolve, reject };
}
