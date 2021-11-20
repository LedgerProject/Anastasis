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
 * Common interface of the internal wallet state.  This object is passed
 * to the various operations (exchange management, withdrawal, refresh, reserve
 * management, etc.).
 *
 * Some operations can be accessed via this state object.  This allows mutual
 * recursion between operations, without having cycling dependencies between
 * the respective TypeScript files.
 *
 * (You can think of this as a "header file" for the wallet implementation.)
 */

/**
 * Imports.
 */
import { WalletNotification, BalancesResponse } from "@gnu-taler/taler-util";
import { CryptoApi } from "./crypto/workers/cryptoApi.js";
import { ExchangeDetailsRecord, ExchangeRecord, WalletStoresV1 } from "./db.js";
import { PendingOperationsResponse } from "./pending-types.js";
import { AsyncOpMemoMap, AsyncOpMemoSingle } from "./util/asyncMemo.js";
import { HttpRequestLibrary } from "./util/http.js";
import { AsyncCondition } from "./util/promiseUtils.js";
import {
  DbAccess,
  GetReadOnlyAccess,
  GetReadWriteAccess,
} from "./util/query.js";
import { TimerGroup } from "./util/timer.js";

export const EXCHANGE_COINS_LOCK = "exchange-coins-lock";
export const EXCHANGE_RESERVES_LOCK = "exchange-reserves-lock";

export interface TrustInfo {
  isTrusted: boolean;
  isAudited: boolean;
}

/**
 * Interface for exchange-related operations.
 */
export interface ExchangeOperations {
  // FIXME:  Should other operations maybe always use
  // updateExchangeFromUrl?
  getExchangeDetails(
    tx: GetReadOnlyAccess<{
      exchanges: typeof WalletStoresV1.exchanges;
      exchangeDetails: typeof WalletStoresV1.exchangeDetails;
    }>,
    exchangeBaseUrl: string,
  ): Promise<ExchangeDetailsRecord | undefined>;
  getExchangeTrust(
    ws: InternalWalletState,
    exchangeInfo: ExchangeRecord,
  ): Promise<TrustInfo>;
  updateExchangeFromUrl(
    ws: InternalWalletState,
    baseUrl: string,
    acceptedFormat?: string[],
    forceNow?: boolean,
  ): Promise<{
    exchange: ExchangeRecord;
    exchangeDetails: ExchangeDetailsRecord;
  }>;
}

export interface RecoupOperations {
  createRecoupGroup(
    ws: InternalWalletState,
    tx: GetReadWriteAccess<{
      recoupGroups: typeof WalletStoresV1.recoupGroups;
      denominations: typeof WalletStoresV1.denominations;
      refreshGroups: typeof WalletStoresV1.refreshGroups;
      coins: typeof WalletStoresV1.coins;
    }>,
    coinPubs: string[],
  ): Promise<string>;
  processRecoupGroup(
    ws: InternalWalletState,
    recoupGroupId: string,
    forceNow?: boolean,
  ): Promise<void>;
}

export type NotificationListener = (n: WalletNotification) => void;

/**
 * Internal, shard wallet state that is used by the implementation
 * of wallet operations.
 *
 * FIXME:  This should not be exported anywhere from the taler-wallet-core package,
 * as it's an opaque implementation detail.
 */
export interface InternalWalletState {
  memoProcessReserve: AsyncOpMemoMap<void>;
  memoMakePlanchet: AsyncOpMemoMap<void>;
  memoGetPending: AsyncOpMemoSingle<PendingOperationsResponse>;
  memoGetBalance: AsyncOpMemoSingle<BalancesResponse>;
  memoProcessRefresh: AsyncOpMemoMap<void>;
  memoProcessRecoup: AsyncOpMemoMap<void>;
  memoProcessDeposit: AsyncOpMemoMap<void>;
  cryptoApi: CryptoApi;

  timerGroup: TimerGroup;
  stopped: boolean;

  /**
   * Asynchronous condition to interrupt the sleep of the
   * retry loop.
   *
   * Used to allow processing of new work faster.
   */
  latch: AsyncCondition;

  listeners: NotificationListener[];

  initCalled: boolean;

  exchangeOps: ExchangeOperations;
  recoupOps: RecoupOperations;

  db: DbAccess<typeof WalletStoresV1>;
  http: HttpRequestLibrary;

  notify(n: WalletNotification): void;

  addNotificationListener(f: (n: WalletNotification) => void): void;

  /**
   * Stop ongoing processing.
   */
  stop(): void;

  /**
   * Run an async function after acquiring a list of locks, identified
   * by string tokens.
   */
  runSequentialized<T>(tokens: string[], f: () => Promise<T>): Promise<T>;

  runUntilDone(req?: { maxRetries?: number }): Promise<void>;
}
