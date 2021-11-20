"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPermissionsApi = exports.isNode = exports.isFirefox = void 0;
/**
 * Compatibility helpers needed for browsers that don't implement
 * WebExtension APIs consistently.
 */
function isFirefox() {
  const rt = chrome.runtime;
  if (typeof rt.getBrowserInfo === "function") {
    return true;
  }
  return false;
}
exports.isFirefox = isFirefox;
/**
 * Check if we are running under nodejs.
 */
function isNode() {
  return typeof process !== "undefined" && process.release.name === "node";
}
exports.isNode = isNode;
function getPermissionsApi() {
  const myBrowser = globalThis.browser;
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
exports.getPermissionsApi = getPermissionsApi;
//# sourceMappingURL=compat.js.map
