/*
 This file is part of GNU Taler
 (C) 2021 Taler Systems S.A.

 GNU Taler is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 GNU Taler is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 GNU Taler; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

/**
 *
 * @author Sebastian Javier Marchano (sebasjm)
 */

import { StateUpdater, useState } from "preact/hooks";

export function useLocalStorage(
  key: string,
  initialValue?: string,
): [string | undefined, StateUpdater<string | undefined>] {
  const [storedValue, setStoredValue] = useState<string | undefined>(():
    | string
    | undefined => {
    return typeof window !== "undefined"
      ? window.localStorage.getItem(key) || initialValue
      : initialValue;
  });

  const setValue = (
    value?: string | ((val?: string) => string | undefined),
  ) => {
    setStoredValue((p) => {
      const toStore = value instanceof Function ? value(p) : value;
      if (typeof window !== "undefined") {
        if (!toStore) {
          window.localStorage.removeItem(key);
        } else {
          window.localStorage.setItem(key, toStore);
        }
      }
      return toStore;
    });
  };

  return [storedValue, setValue];
}

//TODO: merge with the above function
export function useNotNullLocalStorage(
  key: string,
  initialValue: string,
): [string, StateUpdater<string>] {
  const [storedValue, setStoredValue] = useState<string>((): string => {
    return typeof window !== "undefined"
      ? window.localStorage.getItem(key) || initialValue
      : initialValue;
  });

  const setValue = (value: string | ((val: string) => string)) => {
    const valueToStore = value instanceof Function ? value(storedValue) : value;
    setStoredValue(valueToStore);
    if (typeof window !== "undefined") {
      if (!valueToStore) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, valueToStore);
      }
    }
  };

  return [storedValue, setValue];
}
