/*
 This file is part of GNU Taler
 (C) 2019 GNUnet e.V.

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
 * Type and schema definitions for pending tasks in the wallet.
 *
 * These are only used internally, and are not part of the stable public
 * interface to the wallet.
 */

/**
 * Imports.
 */
import {
  TalerErrorDetails,
  BalancesResponse,
  Timestamp,
} from "@gnu-taler/taler-util";
import { ReserveRecordStatus } from "./db.js";
import { RetryInfo } from "./util/retries.js";

export enum PendingTaskType {
  ExchangeUpdate = "exchange-update",
  ExchangeCheckRefresh = "exchange-check-refresh",
  Pay = "pay",
  ProposalChoice = "proposal-choice",
  ProposalDownload = "proposal-download",
  Refresh = "refresh",
  Reserve = "reserve",
  Recoup = "recoup",
  RefundQuery = "refund-query",
  TipPickup = "tip-pickup",
  Withdraw = "withdraw",
  Deposit = "deposit",
  Backup = "backup",
}

/**
 * Information about a pending operation.
 */
export type PendingTaskInfo = PendingTaskInfoCommon &
  (
    | PendingExchangeUpdateTask
    | PendingExchangeCheckRefreshTask
    | PendingPayTask
    | PendingProposalDownloadTask
    | PendingRefreshTask
    | PendingRefundQueryTask
    | PendingReserveTask
    | PendingTipPickupTask
    | PendingWithdrawTask
    | PendingRecoupTask
    | PendingDepositTask
    | PendingBackupTask
  );

export interface PendingBackupTask {
  type: PendingTaskType.Backup;
  backupProviderBaseUrl: string;
  lastError: TalerErrorDetails | undefined;
}

/**
 * The wallet is currently updating information about an exchange.
 */
export interface PendingExchangeUpdateTask {
  type: PendingTaskType.ExchangeUpdate;
  exchangeBaseUrl: string;
  lastError: TalerErrorDetails | undefined;
}

/**
 * The wallet should check whether coins from this exchange
 * need to be auto-refreshed.
 */
export interface PendingExchangeCheckRefreshTask {
  type: PendingTaskType.ExchangeCheckRefresh;
  exchangeBaseUrl: string;
}

export enum ReserveType {
  /**
   * Manually created.
   */
  Manual = "manual",
  /**
   * Withdrawn from a bank that has "tight" Taler integration
   */
  TalerBankWithdraw = "taler-bank-withdraw",
}

/**
 * Status of processing a reserve.
 *
 * Does *not* include the withdrawal operation that might result
 * from this.
 */
export interface PendingReserveTask {
  type: PendingTaskType.Reserve;
  retryInfo: RetryInfo | undefined;
  stage: ReserveRecordStatus;
  timestampCreated: Timestamp;
  reserveType: ReserveType;
  reservePub: string;
  bankWithdrawConfirmUrl?: string;
}

/**
 * Status of an ongoing withdrawal operation.
 */
export interface PendingRefreshTask {
  type: PendingTaskType.Refresh;
  lastError?: TalerErrorDetails;
  refreshGroupId: string;
  finishedPerCoin: boolean[];
  retryInfo: RetryInfo;
}

/**
 * Status of downloading signed contract terms from a merchant.
 */
export interface PendingProposalDownloadTask {
  type: PendingTaskType.ProposalDownload;
  merchantBaseUrl: string;
  proposalTimestamp: Timestamp;
  proposalId: string;
  orderId: string;
  lastError?: TalerErrorDetails;
  retryInfo?: RetryInfo;
}

/**
 * User must choose whether to accept or reject the merchant's
 * proposed contract terms.
 */
export interface PendingProposalChoiceOperation {
  type: PendingTaskType.ProposalChoice;
  merchantBaseUrl: string;
  proposalTimestamp: Timestamp;
  proposalId: string;
}

/**
 * The wallet is picking up a tip that the user has accepted.
 */
export interface PendingTipPickupTask {
  type: PendingTaskType.TipPickup;
  tipId: string;
  merchantBaseUrl: string;
  merchantTipId: string;
}

/**
 * The wallet is signing coins and then sending them to
 * the merchant.
 */
export interface PendingPayTask {
  type: PendingTaskType.Pay;
  proposalId: string;
  isReplay: boolean;
  retryInfo?: RetryInfo;
  lastError: TalerErrorDetails | undefined;
}

/**
 * The wallet is querying the merchant about whether any refund
 * permissions are available for a purchase.
 */
export interface PendingRefundQueryTask {
  type: PendingTaskType.RefundQuery;
  proposalId: string;
  retryInfo: RetryInfo;
  lastError: TalerErrorDetails | undefined;
}

export interface PendingRecoupTask {
  type: PendingTaskType.Recoup;
  recoupGroupId: string;
  retryInfo: RetryInfo;
  lastError: TalerErrorDetails | undefined;
}

/**
 * Status of an ongoing withdrawal operation.
 */
export interface PendingWithdrawTask {
  type: PendingTaskType.Withdraw;
  lastError: TalerErrorDetails | undefined;
  retryInfo: RetryInfo;
  withdrawalGroupId: string;
}

/**
 * Status of an ongoing deposit operation.
 */
export interface PendingDepositTask {
  type: PendingTaskType.Deposit;
  lastError: TalerErrorDetails | undefined;
  retryInfo: RetryInfo | undefined;
  depositGroupId: string;
}

/**
 * Fields that are present in every pending operation.
 */
export interface PendingTaskInfoCommon {
  /**
   * Type of the pending operation.
   */
  type: PendingTaskType;

  /**
   * Set to true if the operation indicates that something is really in progress,
   * as opposed to some regular scheduled operation that can be tried later.
   */
  givesLifeness: boolean;

  /**
   * Timestamp when the pending operation should be executed next.
   */
  timestampDue: Timestamp;

  /**
   * Retry info.  Currently used to stop the wallet after any operation
   * exceeds a number of retries.
   */
  retryInfo?: RetryInfo;
}

/**
 * Response returned from the pending operations API.
 */
export interface PendingOperationsResponse {
  /**
   * List of pending operations.
   */
  pendingOperations: PendingTaskInfo[];

  /**
   * Current wallet balance, including pending balances.
   */
  walletBalance: BalancesResponse;
}
