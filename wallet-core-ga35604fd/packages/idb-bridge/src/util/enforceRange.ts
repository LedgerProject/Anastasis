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

// https://heycam.github.io/webidl/#EnforceRange

export const enforceRange = (
  num: number,
  type: "MAX_SAFE_INTEGER" | "unsigned long",
) => {
  const min = 0;
  const max = type === "unsigned long" ? 4294967295 : 9007199254740991;

  if (isNaN(num) || num < min || num > max) {
    throw new TypeError();
  }
  if (num >= 0) {
    return Math.floor(num);
  }
};
