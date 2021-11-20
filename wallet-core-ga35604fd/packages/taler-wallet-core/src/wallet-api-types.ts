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
 * Type declarations for the high-level interface to wallet-core.
 */

/**
 * Imports.
 */
import {
  AbortPayWithRefundRequest,
  AcceptBankIntegratedWithdrawalRequest,
  AcceptExchangeTosRequest,
  AcceptManualWithdrawalRequest,
  AcceptManualWithdrawalResult,
  AcceptTipRequest,
  AcceptWithdrawalResponse,
  AddExchangeRequest,
  ApplyRefundRequest,
  ApplyRefundResponse,
  BackupRecovery,
  BalancesResponse,
  CoinDumpJson,
  ConfirmPayRequest,
  ConfirmPayResult,
  CreateDepositGroupRequest,
  CreateDepositGroupResponse,
  DeleteTransactionRequest,
  ExchangesListRespose,
  ForceRefreshRequest,
  GetExchangeTosRequest,
  GetExchangeTosResult,
  GetWithdrawalDetailsForAmountRequest,
  GetWithdrawalDetailsForUriRequest,
  IntegrationTestArgs,
  ManualWithdrawalDetails,
  PreparePayRequest,
  PreparePayResult,
  PrepareTipRequest,
  PrepareTipResult,
  RecoveryLoadRequest,
  RetryTransactionRequest,
  SetCoinSuspendedRequest,
  SetWalletDeviceIdRequest,
  TestPayArgs,
  TrackDepositGroupRequest,
  TrackDepositGroupResponse,
  TransactionsRequest,
  TransactionsResponse,
  WalletBackupContentV1,
  WalletCurrencyInfo,
  WithdrawFakebankRequest,
  WithdrawTestBalanceRequest,
  WithdrawUriInfoResponse,
} from "@gnu-taler/taler-util";
import {
  AddBackupProviderRequest,
  BackupInfo,
} from "./operations/backup/index.js";
import { PendingOperationsResponse } from "./pending-types.js";

export enum WalletApiOperation {
  InitWallet = "initWallet",
  WithdrawTestkudos = "withdrawTestkudos",
  WithdrawTestBalance = "withdrawTestBalance",
  PreparePayForUri = "preparePayForUri",
  RunIntegrationTest = "runIntegrationTest",
  TestPay = "testPay",
  AddExchange = "addExchange",
  GetTransactions = "getTransactions",
  ListExchanges = "listExchanges",
  GetWithdrawalDetailsForUri = "getWithdrawalDetailsForUri",
  GetWithdrawalDetailsForAmount = "getWithdrawalDetailsForAmount",
  AcceptManualWithdrawal = "acceptManualWithdrawal",
  GetBalances = "getBalances",
  GetPendingOperations = "getPendingOperations",
  SetExchangeTosAccepted = "setExchangeTosAccepted",
  ApplyRefund = "applyRefund",
  AcceptBankIntegratedWithdrawal = "acceptBankIntegratedWithdrawal",
  GetExchangeTos = "getExchangeTos",
  RetryPendingNow = "retryPendingNow",
  AbortFailedPayWithRefund = "abortFailedPayWithRefund",
  ConfirmPay = "confirmPay",
  DumpCoins = "dumpCoins",
  SetCoinSuspended = "setCoinSuspended",
  ForceRefresh = "forceRefresh",
  PrepareTip = "prepareTip",
  AcceptTip = "acceptTip",
  ExportBackup = "exportBackup",
  AddBackupProvider = "addBackupProvider",
  RunBackupCycle = "runBackupCycle",
  ExportBackupRecovery = "exportBackupRecovery",
  ImportBackupRecovery = "importBackupRecovery",
  GetBackupInfo = "getBackupInfo",
  TrackDepositGroup = "trackDepositGroup",
  DeleteTransaction = "deleteTransaction",
  RetryTransaction = "retryTransaction",
  GetCoins = "getCoins",
  ListCurrencies = "listCurrencies",
  CreateDepositGroup = "createDepositGroup",
  SetWalletDeviceId = "setWalletDeviceId",
  ExportBackupPlain = "exportBackupPlain",
  WithdrawFakebank = "withdrawFakebank",
}

export type WalletOperations = {
  [WalletApiOperation.InitWallet]: {
    request: {};
    response: {};
  };
  [WalletApiOperation.WithdrawFakebank]: {
    request: WithdrawFakebankRequest;
    response: {};
  };
  [WalletApiOperation.PreparePayForUri]: {
    request: PreparePayRequest;
    response: PreparePayResult;
  };
  [WalletApiOperation.WithdrawTestkudos]: {
    request: {};
    response: {};
  };
  [WalletApiOperation.ConfirmPay]: {
    request: ConfirmPayRequest;
    response: ConfirmPayResult;
  };
  [WalletApiOperation.AbortFailedPayWithRefund]: {
    request: AbortPayWithRefundRequest;
    response: {};
  };
  [WalletApiOperation.GetBalances]: {
    request: {};
    response: BalancesResponse;
  };
  [WalletApiOperation.GetTransactions]: {
    request: TransactionsRequest;
    response: TransactionsResponse;
  };
  [WalletApiOperation.GetPendingOperations]: {
    request: {};
    response: PendingOperationsResponse;
  };
  [WalletApiOperation.DumpCoins]: {
    request: {};
    response: CoinDumpJson;
  };
  [WalletApiOperation.SetCoinSuspended]: {
    request: SetCoinSuspendedRequest;
    response: {};
  };
  [WalletApiOperation.ForceRefresh]: {
    request: ForceRefreshRequest;
    response: {};
  };
  [WalletApiOperation.DeleteTransaction]: {
    request: DeleteTransactionRequest;
    response: {};
  };
  [WalletApiOperation.RetryTransaction]: {
    request: RetryTransactionRequest;
    response: {};
  };
  [WalletApiOperation.PrepareTip]: {
    request: PrepareTipRequest;
    response: PrepareTipResult;
  };
  [WalletApiOperation.AcceptTip]: {
    request: AcceptTipRequest;
    response: {};
  };
  [WalletApiOperation.ApplyRefund]: {
    request: ApplyRefundRequest;
    response: ApplyRefundResponse;
  };
  [WalletApiOperation.ListCurrencies]: {
    request: {};
    response: WalletCurrencyInfo;
  };
  [WalletApiOperation.GetWithdrawalDetailsForAmount]: {
    request: GetWithdrawalDetailsForAmountRequest;
    response: ManualWithdrawalDetails;
  };
  [WalletApiOperation.GetWithdrawalDetailsForUri]: {
    request: GetWithdrawalDetailsForUriRequest;
    response: WithdrawUriInfoResponse;
  };
  [WalletApiOperation.AcceptBankIntegratedWithdrawal]: {
    request: AcceptBankIntegratedWithdrawalRequest;
    response: AcceptWithdrawalResponse;
  };
  [WalletApiOperation.AcceptManualWithdrawal]: {
    request: AcceptManualWithdrawalRequest;
    response: AcceptManualWithdrawalResult;
  };
  [WalletApiOperation.ListExchanges]: {
    request: {};
    response: ExchangesListRespose;
  };
  [WalletApiOperation.AddExchange]: {
    request: AddExchangeRequest;
    response: {};
  };
  [WalletApiOperation.SetExchangeTosAccepted]: {
    request: AcceptExchangeTosRequest;
    response: {};
  };
  [WalletApiOperation.GetExchangeTos]: {
    request: GetExchangeTosRequest;
    response: GetExchangeTosResult;
  };
  [WalletApiOperation.TrackDepositGroup]: {
    request: TrackDepositGroupRequest;
    response: TrackDepositGroupResponse;
  };
  [WalletApiOperation.CreateDepositGroup]: {
    request: CreateDepositGroupRequest;
    response: CreateDepositGroupResponse;
  };
  [WalletApiOperation.SetWalletDeviceId]: {
    request: SetWalletDeviceIdRequest;
    response: {};
  };
  [WalletApiOperation.ExportBackupPlain]: {
    request: {};
    response: WalletBackupContentV1;
  };
  [WalletApiOperation.ExportBackupRecovery]: {
    request: {};
    response: BackupRecovery;
  };
  [WalletApiOperation.ImportBackupRecovery]: {
    request: RecoveryLoadRequest;
    response: {};
  };
  [WalletApiOperation.RunBackupCycle]: {
    request: {};
    response: {};
  };
  [WalletApiOperation.AddBackupProvider]: {
    request: AddBackupProviderRequest;
    response: {};
  };
  [WalletApiOperation.GetBackupInfo]: {
    request: {};
    response: BackupInfo;
  };
  [WalletApiOperation.RunIntegrationTest]: {
    request: IntegrationTestArgs;
    response: {};
  };
  [WalletApiOperation.WithdrawTestBalance]: {
    request: WithdrawTestBalanceRequest;
    response: {};
  };
  [WalletApiOperation.TestPay]: {
    request: TestPayArgs;
    response: {};
  };
};

export type RequestType<
  Op extends WalletApiOperation & keyof WalletOperations
> = WalletOperations[Op] extends { request: infer T } ? T : never;

export type ResponseType<
  Op extends WalletApiOperation & keyof WalletOperations
> = WalletOperations[Op] extends { response: infer T } ? T : never;

export interface WalletCoreApiClient {
  call<Op extends WalletApiOperation & keyof WalletOperations>(
    operation: Op,
    payload: RequestType<Op>,
  ): Promise<ResponseType<Op>>;
}
