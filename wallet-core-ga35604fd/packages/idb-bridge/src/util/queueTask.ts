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

export function queueTask(fn: () => void) {
  let called = false;
  const callFirst = () => {
    if (called) {
      return;
    }
    called = true;
    fn();
  };
  // We must schedule both of these,
  // since on node, there is no guarantee
  // that a setImmediate function that is registered
  // before a setTimeout function is called first.
  setImmediate(callFirst);
  setTimeout(callFirst, 0);
}

export default queueTask;
