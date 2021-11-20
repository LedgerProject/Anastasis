/*
 This file is part of TALER
 (C) 2017 INRIA

 TALER is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 TALER is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 TALER; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

/**
 * Compatibility helpers needed for browsers that don't implement
 * WebExtension APIs consistently.
 */

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

export function isFirefox(): boolean {
  const rt = chrome.runtime as any;
  if (typeof rt.getBrowserInfo === "function") {
    return true;
  }
  return false;
}

/**
 * Check if we are running under nodejs.
 */
export function isNode(): boolean {
  return typeof process !== "undefined" && process.release.name === "node";
}

/**
 * Compatibility API that works on multiple browsers.
 */
export interface CrossBrowserPermissionsApi {
  contains(
    permissions: chrome.permissions.Permissions,
    callback: (result: boolean) => void,
  ): void;

  addPermissionsListener(
    callback: (permissions: chrome.permissions.Permissions) => void,
  ): void;

  request(
    permissions: chrome.permissions.Permissions,
    callback?: (granted: boolean) => void,
  ): void;

  remove(
    permissions: chrome.permissions.Permissions,
    callback?: (removed: boolean) => void,
  ): void;
}

export function getPermissionsApi(): CrossBrowserPermissionsApi {
  const myBrowser = (globalThis as any).browser;
  if (
    typeof myBrowser === "object" &&
    typeof myBrowser.permissions === "object"
  ) {
    return {
      addPermissionsListener: () => {
        // Not supported yet.
      },
      contains: myBrowser.permissions.contains,
      request: myBrowser.permissions.request,
      remove: myBrowser.permissions.remove,
    };
  } else {
    return {
      addPermissionsListener: chrome.permissions.onAdded.addListener.bind(
        chrome.permissions.onAdded,
      ),
      contains: chrome.permissions.contains,
      request: chrome.permissions.request,
      remove: chrome.permissions.remove,
    };
  }
}
