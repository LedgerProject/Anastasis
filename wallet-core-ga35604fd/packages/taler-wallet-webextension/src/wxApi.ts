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
 * Interface to the wallet through WebExtension messaging.
 */

/**
 * Imports.
 */
import {
  AcceptExchangeTosRequest,
  AcceptManualWithdrawalResult, AcceptTipRequest, AcceptWithdrawalResponse,
  AddExchangeRequest, ApplyRefundResponse, BalancesResponse, ConfirmPayResult,
  CoreApiResponse, DeleteTransactionRequest, ExchangesListRespose,
  GetExchangeTosResult, GetExchangeWithdrawalInfo,
  GetWithdrawalDetailsForUriRequest, NotificationType, PreparePayResult, PrepareTipRequest,
  PrepareTipResult, RetryTransactionRequest,
  SetWalletDeviceIdRequest, TransactionsResponse, WalletDiagnostics, WithdrawUriInfoResponse
} from "@gnu-taler/taler-util";
import {
  AddBackupProviderRequest, BackupInfo, OperationFailedError,
  RemoveBackupProviderRequest
} from "@gnu-taler/taler-wallet-core";
import { ExchangeWithdrawDetails } from "@gnu-taler/taler-wallet-core/src/operations/withdraw";
import { MessageFromBackend } from "./wxBackend.js";

export interface ExtendedPermissionsResponse {
  newValue: boolean;
}

/**
 * Response with information about available version upgrades.
 */
export interface UpgradeResponse {
  /**
   * Is a reset required because of a new DB version
   * that can't be automatically upgraded?
   */
  dbResetRequired: boolean;

  /**
   * Current database version.
   */
  currentDbVersion: string;

  /**
   * Old db version (if applicable).
   */
  oldDbVersion: string;
}

async function callBackend(operation: string, payload: any): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    // eslint-disable-next-line no-undef
    chrome.runtime.sendMessage({ operation, payload, id: "(none)" }, (resp) => {
      // eslint-disable-next-line no-undef
      if (chrome.runtime.lastError) {
        console.log("Error calling backend");
        reject(
          new Error(
            `Error contacting backend: chrome.runtime.lastError.message`,
          ),
        );
      }
      console.log("got response", resp);
      const r = resp as CoreApiResponse;
      if (r.type === "error") {
        reject(new OperationFailedError(r.error));
        return;
      }
      resolve(r.result);
    });
  });
}

/**
 * Start refreshing a coin.
 */
export function refresh(coinPub: string): Promise<void> {
  return callBackend("refresh-coin", { coinPub });
}

/**
 * Pay for a proposal.
 */
export function confirmPay(
  proposalId: string,
  sessionId: string | undefined,
): Promise<ConfirmPayResult> {
  return callBackend("confirmPay", { proposalId, sessionId });
}

/**
 * Check upgrade information
 */
export function checkUpgrade(): Promise<UpgradeResponse> {
  return callBackend("check-upgrade", {});
}

/**
 * Reset database
 */
export function resetDb(): Promise<void> {
  return callBackend("reset-db", {});
}

/**
 * Get balances for all currencies/exchanges.
 */
export function getBalance(): Promise<BalancesResponse> {
  return callBackend("getBalances", {});
}

/**
 * Retrieve the full event history for this wallet.
 */
export function getTransactions(): Promise<TransactionsResponse> {
  return callBackend("getTransactions", {});
}

interface CurrencyInfo {
  name: string;
  baseUrl: string;
  pub: string;
}
interface ListOfKnownCurrencies {
  auditors: CurrencyInfo[];
  exchanges: CurrencyInfo[];
}

/**
 * Get a list of currencies from known auditors and exchanges
 */
export function listKnownCurrencies(): Promise<ListOfKnownCurrencies> {
  return callBackend("listCurrencies", {}).then((result) => {
    console.log("result list", result);
    const auditors = result.trustedAuditors.map(
      (a: Record<string, string>) => ({
        name: a.currency,
        baseUrl: a.auditorBaseUrl,
        pub: a.auditorPub,
      }),
    );
    const exchanges = result.trustedExchanges.map(
      (a: Record<string, string>) => ({
        name: a.currency,
        baseUrl: a.exchangeBaseUrl,
        pub: a.exchangeMasterPub,
      }),
    );
    return { auditors, exchanges };
  });
}

export function listExchanges(): Promise<ExchangesListRespose> {
  return callBackend("listExchanges", {});
}

/**
 * Get information about the current state of wallet backups.
 */
export function getBackupInfo(): Promise<BackupInfo> {
  return callBackend("getBackupInfo", {});
}

/**
 * Add a backup provider and activate it
 */
export function addBackupProvider(
  backupProviderBaseUrl: string,
  name: string,
): Promise<void> {
  return callBackend("addBackupProvider", {
    backupProviderBaseUrl,
    activate: true,
    name,
  } as AddBackupProviderRequest);
}

export function setWalletDeviceId(walletDeviceId: string): Promise<void> {
  return callBackend("setWalletDeviceId", {
    walletDeviceId,
  } as SetWalletDeviceIdRequest);
}

export function syncAllProviders(): Promise<void> {
  return callBackend("runBackupCycle", {});
}

export function syncOneProvider(url: string): Promise<void> {
  return callBackend("runBackupCycle", { providers: [url] });
}
export function removeProvider(url: string): Promise<void> {
  return callBackend("removeBackupProvider", {
    provider: url,
  } as RemoveBackupProviderRequest);
}
export function extendedProvider(url: string): Promise<void> {
  return callBackend("extendBackupProvider", { provider: url });
}

/**
 * Retry a transaction
 * @param transactionId
 * @returns
 */
export function retryTransaction(transactionId: string): Promise<void> {
  return callBackend("retryTransaction", {
    transactionId,
  } as RetryTransactionRequest);
}

/**
 * Permanently delete a transaction from the transaction list
 */
export function deleteTransaction(transactionId: string): Promise<void> {
  return callBackend("deleteTransaction", {
    transactionId,
  } as DeleteTransactionRequest);
}

/**
 * Download a refund and accept it.
 */
export function applyRefund(
  talerRefundUri: string,
): Promise<ApplyRefundResponse> {
  return callBackend("applyRefund", { talerRefundUri });
}

/**
 * Get details about a pay operation.
 */
export function preparePay(talerPayUri: string): Promise<PreparePayResult> {
  return callBackend("preparePay", { talerPayUri });
}

/**
 * Get details about a withdraw operation.
 */
export function acceptWithdrawal(
  talerWithdrawUri: string,
  selectedExchange: string,
): Promise<AcceptWithdrawalResponse> {
  return callBackend("acceptBankIntegratedWithdrawal", {
    talerWithdrawUri,
    exchangeBaseUrl: selectedExchange,
  });
}

/**
 * Create a reserve into the exchange that expect the amount indicated
 * @param exchangeBaseUrl
 * @param amount
 * @returns
 */
export function acceptManualWithdrawal(
  exchangeBaseUrl: string,
  amount: string,
): Promise<AcceptManualWithdrawalResult> {
  return callBackend("acceptManualWithdrawal", {
    amount,
    exchangeBaseUrl,
  });
}

export function setExchangeTosAccepted(
  exchangeBaseUrl: string,
  etag: string | undefined,
): Promise<void> {
  return callBackend("setExchangeTosAccepted", {
    exchangeBaseUrl,
    etag,
  } as AcceptExchangeTosRequest);
}

/**
 * Get diagnostics information
 */
export function getDiagnostics(): Promise<WalletDiagnostics> {
  return callBackend("wxGetDiagnostics", {});
}

/**
 * Get diagnostics information
 */
export function setExtendedPermissions(
  value: boolean,
): Promise<ExtendedPermissionsResponse> {
  return callBackend("wxSetExtendedPermissions", { value });
}

/**
 * Get diagnostics information
 */
export function getExtendedPermissions(): Promise<ExtendedPermissionsResponse> {
  return callBackend("wxGetExtendedPermissions", {});
}

/**
 * Get diagnostics information
 */
export function getWithdrawalDetailsForUri(
  req: GetWithdrawalDetailsForUriRequest,
): Promise<WithdrawUriInfoResponse> {
  return callBackend("getWithdrawalDetailsForUri", req);
}

/**
 * Get diagnostics information
 */
export function getExchangeWithdrawalInfo(
  req: GetExchangeWithdrawalInfo,
): Promise<ExchangeWithdrawDetails> {
  return callBackend("getExchangeWithdrawalInfo", req);
}
export function getExchangeTos(
  exchangeBaseUrl: string,
  acceptedFormat: string[],
): Promise<GetExchangeTosResult> {
  return callBackend("getExchangeTos", {
    exchangeBaseUrl,
    acceptedFormat,
  });
}

export function addExchange(req: AddExchangeRequest): Promise<void> {
  return callBackend("addExchange", req);
}

export function prepareTip(req: PrepareTipRequest): Promise<PrepareTipResult> {
  return callBackend("prepareTip", req);
}

export function acceptTip(req: AcceptTipRequest): Promise<void> {
  return callBackend("acceptTip", req);
}

export function onUpdateNotification(messageType: Array<NotificationType>, doCallback: () => void): () => void {
  // eslint-disable-next-line no-undef
  const port = chrome.runtime.connect({ name: "notifications" });
  const listener = (message: MessageFromBackend): void => {
    if (messageType.includes(message.type)) {
      doCallback();
    }
  };
  port.onMessage.addListener(listener);
  return () => {
    port.onMessage.removeListener(listener);
  };
}
