/*
 This file is part of GNU Taler
 (C) 2020 Taler Systems S.A.

 GNU Taler is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 GNU Taler is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 GNU Taler; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

interface URL {
  hash: string;
  host: string;
  hostname: string;
  href: string;
  toString(): string;
  readonly origin: string;
  password: string;
  pathname: string;
  port: string;
  protocol: string;
  search: string;
  readonly searchParams: URLSearchParams;
  username: string;
  toJSON(): string;
}

interface URLSearchParams {
  append(name: string, value: string): void;
  delete(name: string): void;
  get(name: string): string | null;
  getAll(name: string): string[];
  has(name: string): boolean;
  set(name: string, value: string): void;
  sort(): void;
  toString(): string;
  forEach(
    callbackfn: (value: string, key: string, parent: URLSearchParams) => void,
    thisArg?: any,
  ): void;
}

export interface URLSearchParamsCtor {
  new (
    init?: string[][] | Record<string, string> | string | URLSearchParams,
  ): URLSearchParams;
}

export interface URLCtor {
  new (url: string, base?: string | URL): URL;
}

// globalThis polyfill, see https://mathiasbynens.be/notes/globalthis
(function () {
  if (typeof globalThis === "object") return;
  Object.defineProperty(Object.prototype, "__magic__", {
    get: function () {
      return this;
    },
    configurable: true, // This makes it possible to `delete` the getter later.
  });
  // @ts-ignore: polyfill magic
  __magic__.globalThis = __magic__; // lolwat
  // @ts-ignore: polyfill magic
  delete Object.prototype.__magic__;
})();

// @ts-ignore
const _URL = globalThis.URL;
if (!_URL) {
  throw Error("FATAL: URL not available");
}

export const URL: URLCtor = _URL;

// @ts-ignore
const _URLSearchParams = globalThis.URLSearchParams;

if (!_URLSearchParams) {
  throw Error("FATAL: URLSearchParams not available");
}

export const URLSearchParams: URLSearchParamsCtor = _URLSearchParams;
