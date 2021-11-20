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
export type ValueOrFunction<T> = T | ((p: T) => T);

const calculateRootPath = () => {
  const rootPath =
    typeof window !== undefined
      ? window.location.origin + window.location.pathname
      : "/";
  return rootPath;
};

export function useBackendURL(
  url?: string,
): [string, boolean, StateUpdater<string>, () => void] {
  const [value, setter] = useNotNullLocalStorage(
    "backend-url",
    url || calculateRootPath(),
  );
  const [triedToLog, setTriedToLog] = useLocalStorage("tried-login");

  const checkedSetter = (v: ValueOrFunction<string>) => {
    setTriedToLog("yes");
    return setter((p) => (v instanceof Function ? v(p) : v).replace(/\/$/, ""));
  };

  const resetBackend = () => {
    setTriedToLog(undefined);
  };
  return [value, !!triedToLog, checkedSetter, resetBackend];
}

export function useBackendDefaultToken(): [
  string | undefined,
  StateUpdater<string | undefined>,
] {
  return useLocalStorage("backend-token");
}

export function useBackendInstanceToken(
  id: string,
): [string | undefined, StateUpdater<string | undefined>] {
  const [token, setToken] = useLocalStorage(`backend-token-${id}`);
  const [defaultToken, defaultSetToken] = useBackendDefaultToken();

  // instance named 'default' use the default token
  if (id === "default") {
    return [defaultToken, defaultSetToken];
  }

  return [token, setToken];
}

export function useLang(initial?: string): [string, StateUpdater<string>] {
  const browserLang =
    typeof window !== "undefined"
      ? navigator.language || (navigator as any).userLanguage
      : undefined;
  const defaultLang = (browserLang || initial || "en").substring(0, 2);
  return useNotNullLocalStorage("lang-preference", defaultLang);
}

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
