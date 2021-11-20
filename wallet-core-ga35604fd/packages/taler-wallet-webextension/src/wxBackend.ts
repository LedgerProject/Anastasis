/*
 This file is part of TALER
 (C) 2016 GNUnet e.V.

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
 * Messaging for the WebExtensions wallet.  Should contain
 * parts that are specific for WebExtensions, but as little business
 * logic as possible.
 */

/**
 * Imports.
 */
import { isFirefox, getPermissionsApi } from "./compat";
import { extendedPermissions } from "./permissions";
import {
  OpenedPromise,
  openPromise,
  openTalerDatabase,
  makeErrorDetails,
  deleteTalerDatabase,
  DbAccess,
  WalletStoresV1,
  Wallet,
} from "@gnu-taler/taler-wallet-core";
import {
  classifyTalerUri,
  CoreApiResponse,
  CoreApiResponseSuccess,
  NotificationType,
  TalerErrorCode,
  TalerUriType,
  WalletDiagnostics,
} from "@gnu-taler/taler-util";
import { BrowserHttpLib } from "./browserHttpLib";
import { BrowserCryptoWorkerFactory } from "./browserCryptoWorkerFactory";

/**
 * Currently active wallet instance.  Might be unloaded and
 * re-instantiated when the database is reset.
 *
 * FIXME:  Maybe move the wallet resetting into the Wallet class?
 */
let currentWallet: Wallet | undefined;

let currentDatabase: DbAccess<typeof WalletStoresV1> | undefined;

/**
 * Last version if an outdated DB, if applicable.
 */
let outdatedDbVersion: number | undefined;

const walletInit: OpenedPromise<void> = openPromise<void>();

const notificationPorts: chrome.runtime.Port[] = [];

async function getDiagnostics(): Promise<WalletDiagnostics> {
  const manifestData = chrome.runtime.getManifest();
  const errors: string[] = [];
  let firefoxIdbProblem = false;
  let dbOutdated = false;
  try {
    await walletInit.promise;
  } catch (e) {
    errors.push("Error during wallet initialization: " + e);
    if (
      currentDatabase === undefined &&
      outdatedDbVersion === undefined &&
      isFirefox()
    ) {
      firefoxIdbProblem = true;
    }
  }
  if (!currentWallet) {
    errors.push("Could not create wallet backend.");
  }
  if (!currentDatabase) {
    errors.push("Could not open database");
  }
  if (outdatedDbVersion !== undefined) {
    errors.push(`Outdated DB version: ${outdatedDbVersion}`);
    dbOutdated = true;
  }
  const diagnostics: WalletDiagnostics = {
    walletManifestDisplayVersion: manifestData.version_name || "(undefined)",
    walletManifestVersion: manifestData.version,
    errors,
    firefoxIdbProblem,
    dbOutdated,
  };
  return diagnostics;
}

async function dispatch(
  req: any,
  sender: any,
  sendResponse: any,
): Promise<void> {
  let r: CoreApiResponse;

  const wrapResponse = (result: unknown): CoreApiResponseSuccess => {
    return {
      type: "response",
      id: req.id,
      operation: req.operation,
      result,
    };
  };

  switch (req.operation) {
    case "wxGetDiagnostics": {
      r = wrapResponse(await getDiagnostics());
      break;
    }
    case "reset-db": {
      await deleteTalerDatabase(indexedDB);
      r = wrapResponse(await reinitWallet());
      break;
    }
    case "wxGetExtendedPermissions": {
      const res = await new Promise((resolve, reject) => {
        getPermissionsApi().contains(extendedPermissions, (result: boolean) => {
          resolve(result);
        });
      });
      r = wrapResponse({ newValue: res });
      break;
    }
    case "wxSetExtendedPermissions": {
      const newVal = req.payload.value;
      console.log("new extended permissions value", newVal);
      if (newVal) {
        setupHeaderListener();
        r = wrapResponse({ newValue: true });
      } else {
        await new Promise<void>((resolve, reject) => {
          getPermissionsApi().remove(extendedPermissions, (rem) => {
            console.log("permissions removed:", rem);
            resolve();
          });
        });
        r = wrapResponse({ newVal: false });
      }
      break;
    }
    default: {
      const w = currentWallet;
      if (!w) {
        r = {
          type: "error",
          id: req.id,
          operation: req.operation,
          error: makeErrorDetails(
            TalerErrorCode.WALLET_CORE_NOT_AVAILABLE,
            "wallet core not available",
            {},
          ),
        };
        break;
      }
      r = await w.handleCoreApiRequest(req.operation, req.id, req.payload);
      break;
    }
  }

  try {
    sendResponse(r);
  } catch (e) {
    // might fail if tab disconnected
  }
}

function getTab(tabId: number): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab: chrome.tabs.Tab) => resolve(tab));
  });
}

function setBadgeText(options: chrome.browserAction.BadgeTextDetails): void {
  // not supported by all browsers ...
  if (chrome && chrome.browserAction && chrome.browserAction.setBadgeText) {
    chrome.browserAction.setBadgeText(options);
  } else {
    console.warn("can't set badge text, not supported", options);
  }
}

function waitMs(timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const bgPage = chrome.extension.getBackgroundPage();
    if (!bgPage) {
      reject("fatal: no background page");
      return;
    }
    bgPage.setTimeout(() => resolve(), timeoutMs);
  });
}

function makeSyncWalletRedirect(
  url: string,
  tabId: number,
  oldUrl: string,
  params?: { [name: string]: string | undefined },
): Record<string, unknown> {
  const innerUrl = new URL(chrome.extension.getURL(url));
  if (params) {
    const hParams = Object.keys(params)
      .map((k) => `${k}=${params[k]}`)
      .join("&");
    innerUrl.hash = innerUrl.hash + "?" + hParams;
  }
  if (isFirefox()) {
    // Some platforms don't support the sync redirect (yet), so fall back to
    // async redirect after a timeout.
    const doit = async (): Promise<void> => {
      await waitMs(150);
      const tab = await getTab(tabId);
      if (tab.url === oldUrl) {
        chrome.tabs.update(tabId, { url: innerUrl.href });
      }
    };
    doit();
  }
  console.log("redirecting to", innerUrl.href);
  chrome.tabs.update(tabId, { url: innerUrl.href });
  return { redirectUrl: innerUrl.href };
}

export type MessageFromBackend = {
  type: NotificationType
}

async function reinitWallet(): Promise<void> {
  if (currentWallet) {
    currentWallet.stop();
    currentWallet = undefined;
  }
  currentDatabase = undefined;
  setBadgeText({ text: "" });
  try {
    currentDatabase = await openTalerDatabase(indexedDB, reinitWallet);
  } catch (e) {
    console.error("could not open database", e);
    walletInit.reject(e);
    return;
  }
  const http = new BrowserHttpLib();
  console.log("setting wallet");
  const wallet = await Wallet.create(
    currentDatabase,
    http,
    new BrowserCryptoWorkerFactory(),
  );
  try {
    await wallet.handleCoreApiRequest("initWallet", "native-init", {});
  } catch (e) {
    console.error("could not initialize wallet", e);
    walletInit.reject(e);
    return;
  }
  wallet.addNotificationListener((x) => {
    for (const notif of notificationPorts) {
      const message: MessageFromBackend = { type: x.type };
      try {
        notif.postMessage(message);
      } catch (e) {
        console.error(e);
      }
    }
  });
  wallet.runTaskLoop().catch((e) => {
    console.log("error during wallet task loop", e);
  });
  // Useful for debugging in the background page.
  (window as any).talerWallet = wallet;
  currentWallet = wallet;
  walletInit.resolve();
}

try {
  // This needs to be outside of main, as Firefox won't fire the event if
  // the listener isn't created synchronously on loading the backend.
  chrome.runtime.onInstalled.addListener((details) => {
    console.log("onInstalled with reason", details.reason);
    if (details.reason === "install") {
      const url = chrome.extension.getURL("/static/wallet.html#/welcome");
      chrome.tabs.create({ active: true, url: url });
    }
  });
} catch (e) {
  console.error(e);
}

function headerListener(
  details: chrome.webRequest.WebResponseHeadersDetails,
): chrome.webRequest.BlockingResponse | undefined {
  console.log("header listener");
  if (chrome.runtime.lastError) {
    console.error(chrome.runtime.lastError);
    return;
  }
  const wallet = currentWallet;
  if (!wallet) {
    console.warn("wallet not available while handling header");
    return;
  }
  console.log("in header listener");
  if (
    details.statusCode === 402 ||
    details.statusCode === 202 ||
    details.statusCode === 200
  ) {
    console.log(`got 402/202 from ${details.url}`);
    for (const header of details.responseHeaders || []) {
      if (header.name.toLowerCase() === "taler") {
        const talerUri = header.value || "";
        const uriType = classifyTalerUri(talerUri);
        switch (uriType) {
          case TalerUriType.TalerWithdraw:
            return makeSyncWalletRedirect(
              "/static/wallet.html#/withdraw",
              details.tabId,
              details.url,
              {
                talerWithdrawUri: talerUri,
              },
            );
          case TalerUriType.TalerPay:
            return makeSyncWalletRedirect(
              "/static/wallet.html#/pay",
              details.tabId,
              details.url,
              {
                talerPayUri: talerUri,
              },
            );
          case TalerUriType.TalerTip:
            return makeSyncWalletRedirect(
              "/static/wallet.html#/tip",
              details.tabId,
              details.url,
              {
                talerTipUri: talerUri,
              },
            );
          case TalerUriType.TalerRefund:
            return makeSyncWalletRedirect(
              "/static/wallet.html#/refund",
              details.tabId,
              details.url,
              {
                talerRefundUri: talerUri,
              },
            );
          case TalerUriType.TalerNotifyReserve:
            Promise.resolve().then(() => {
              const w = currentWallet;
              if (!w) {
                return;
              }
              // FIXME:  Is this still useful?
              // handleNotifyReserve(w);
            });
            break;
          default:
            console.warn(
              "Response with HTTP 402 has Taler header, but header value is not a taler:// URI.",
            );
            break;
        }
      }
    }
  }
  return;
}

function setupHeaderListener(): void {
  console.log("setting up header listener");
  // Handlers for catching HTTP requests
  getPermissionsApi().contains(extendedPermissions, (result: boolean) => {
    if (
      "webRequest" in chrome &&
      "onHeadersReceived" in chrome.webRequest &&
      chrome.webRequest.onHeadersReceived.hasListener(headerListener)
    ) {
      chrome.webRequest.onHeadersReceived.removeListener(headerListener);
    }
    if (result) {
      console.log("actually adding listener");
      chrome.webRequest.onHeadersReceived.addListener(
        headerListener,
        { urls: ["<all_urls>"] },
        ["responseHeaders", "blocking"],
      );
    }
    if ("webRequest" in chrome) {
      chrome.webRequest.handlerBehaviorChanged(() => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
        }
      });
    }
  });
}

/**
 * Main function to run for the WebExtension backend.
 *
 * Sets up all event handlers and other machinery.
 */
export async function wxMain(): Promise<void> {
  // Explicitly unload the extension page as soon as an update is available,
  // so the update gets installed as soon as possible.
  chrome.runtime.onUpdateAvailable.addListener((details) => {
    console.log("update available:", details);
    chrome.runtime.reload();
  });
  reinitWallet();

  // Handlers for messages coming directly from the content
  // script on the page
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    dispatch(req, sender, sendResponse);
    return true;
  });

  chrome.runtime.onConnect.addListener((port) => {
    notificationPorts.push(port);
    port.onDisconnect.addListener((discoPort) => {
      const idx = notificationPorts.indexOf(discoPort);
      if (idx >= 0) {
        notificationPorts.splice(idx, 1);
      }
    });
  });

  try {
    setupHeaderListener();
  } catch (e) {
    console.log(e);
  }

  // On platforms that support it, also listen to external
  // modification of permissions.
  getPermissionsApi().addPermissionsListener((perm) => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
      return;
    }
    setupHeaderListener();
  });
}
