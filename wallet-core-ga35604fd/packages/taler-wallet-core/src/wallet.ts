/*
 This file is part of GNU Taler
 (C) 2015-2019 GNUnet e.V.

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
 * High-level wallet operations that should be indepentent from the underlying
 * browser extension interface.
 */

/**
 * Imports.
 */
import {
  BalancesResponse,
  codecForAny,
  codecForDeleteTransactionRequest,
  codecForRetryTransactionRequest,
  codecForSetWalletDeviceIdRequest,
  codecForGetExchangeWithdrawalInfo,
  durationFromSpec,
  durationMin,
  getDurationRemaining,
  isTimestampExpired,
  j2s,
  TalerErrorCode,
  Timestamp,
  timestampMin,
  WalletNotification,
  codecForWithdrawFakebankRequest,
  URL,
  parsePaytoUri,
} from "@gnu-taler/taler-util";
import {
  addBackupProvider,
  codecForAddBackupProviderRequest,
  codecForRemoveBackupProvider,
  codecForRunBackupCycle,
  getBackupInfo,
  getBackupRecovery,
  loadBackupRecovery,
  processBackupForProvider,
  removeBackupProvider,
  runBackupCycle,
} from "./operations/backup/index.js";
import { exportBackup } from "./operations/backup/export.js";
import { getBalances } from "./operations/balance.js";
import {
  createDepositGroup,
  processDepositGroup,
  trackDepositGroup,
} from "./operations/deposits.js";
import {
  makeErrorDetails,
  OperationFailedAndReportedError,
  OperationFailedError,
} from "./errors.js";
import {
  acceptExchangeTermsOfService,
  getExchangeDetails,
  getExchangeTrust,
  updateExchangeFromUrl,
} from "./operations/exchanges.js";
import {
  confirmPay,
  preparePayForUri,
  processDownloadProposal,
  processPurchasePay,
} from "./operations/pay.js";
import { getPendingOperations } from "./operations/pending.js";
import { createRecoupGroup, processRecoupGroup } from "./operations/recoup.js";
import {
  autoRefresh,
  createRefreshGroup,
  processRefreshGroup,
} from "./operations/refresh.js";
import {
  abortFailedPayWithRefund,
  applyRefund,
  processPurchaseQueryRefund,
} from "./operations/refund.js";
import {
  createReserve,
  createTalerWithdrawReserve,
  getFundingPaytoUris,
  processReserve,
} from "./operations/reserves.js";
import {
  ExchangeOperations,
  InternalWalletState,
  NotificationListener,
  RecoupOperations,
} from "./common.js";
import {
  runIntegrationTest,
  testPay,
  withdrawTestBalance,
} from "./operations/testing.js";
import { acceptTip, prepareTip, processTip } from "./operations/tip.js";
import {
  deleteTransaction,
  getTransactions,
  retryTransaction,
} from "./operations/transactions.js";
import {
  getExchangeWithdrawalInfo,
  getWithdrawalDetailsForUri,
  processWithdrawGroup,
} from "./operations/withdraw.js";
import {
  AuditorTrustRecord,
  CoinSourceType,
  ReserveRecordStatus,
  WalletStoresV1,
} from "./db.js";
import { NotificationType } from "@gnu-taler/taler-util";
import {
  PendingTaskInfo,
  PendingOperationsResponse,
  PendingTaskType,
} from "./pending-types.js";
import { CoinDumpJson } from "@gnu-taler/taler-util";
import { codecForTransactionsRequest } from "@gnu-taler/taler-util";
import {
  AcceptManualWithdrawalResult,
  AcceptWithdrawalResponse,
  codecForAbortPayWithRefundRequest,
  codecForAcceptBankIntegratedWithdrawalRequest,
  codecForAcceptExchangeTosRequest,
  codecForAcceptManualWithdrawalRequet,
  codecForAcceptTipRequest,
  codecForAddExchangeRequest,
  codecForApplyRefundRequest,
  codecForConfirmPayRequest,
  codecForCreateDepositGroupRequest,
  codecForForceRefreshRequest,
  codecForGetExchangeTosRequest,
  codecForGetWithdrawalDetailsForAmountRequest,
  codecForGetWithdrawalDetailsForUri,
  codecForIntegrationTestArgs,
  codecForPreparePayRequest,
  codecForPrepareTipRequest,
  codecForSetCoinSuspendedRequest,
  codecForTestPayArgs,
  codecForTrackDepositGroupRequest,
  codecForWithdrawTestBalance,
  CoreApiResponse,
  ExchangeListItem,
  ExchangesListRespose,
  GetExchangeTosResult,
  ManualWithdrawalDetails,
  RefreshReason,
} from "@gnu-taler/taler-util";
import { AmountJson, Amounts } from "@gnu-taler/taler-util";
import { assertUnreachable } from "./util/assertUnreachable.js";
import { Logger } from "@gnu-taler/taler-util";
import { setWalletDeviceId } from "./operations/backup/state.js";
import { WalletCoreApiClient } from "./wallet-api-types.js";
import { AsyncOpMemoMap, AsyncOpMemoSingle } from "./util/asyncMemo.js";
import { CryptoApi, CryptoWorkerFactory } from "./crypto/workers/cryptoApi.js";
import { TimerGroup } from "./util/timer.js";
import {
  AsyncCondition,
  OpenedPromise,
  openPromise,
} from "./util/promiseUtils.js";
import { DbAccess } from "./util/query.js";
import {
  HttpRequestLibrary,
  readSuccessResponseJsonOrThrow,
} from "./util/http.js";

const builtinAuditors: AuditorTrustRecord[] = [
  {
    currency: "KUDOS",
    auditorPub: "BW9DC48PHQY4NH011SHHX36DZZ3Q22Y6X7FZ1VD1CMZ2PTFZ6PN0",
    auditorBaseUrl: "https://auditor.demo.taler.net/",
    uids: ["5P25XF8TVQP9AW6VYGY2KV47WT5Y3ZXFSJAA570GJPX5SVJXKBVG"],
  },
];

const logger = new Logger("wallet.ts");

async function getWithdrawalDetailsForAmount(
  ws: InternalWalletState,
  exchangeBaseUrl: string,
  amount: AmountJson,
): Promise<ManualWithdrawalDetails> {
  const wi = await getExchangeWithdrawalInfo(ws, exchangeBaseUrl, amount);
  const paytoUris = wi.exchangeDetails.wireInfo.accounts.map(
    (x) => x.payto_uri,
  );
  if (!paytoUris) {
    throw Error("exchange is in invalid state");
  }
  return {
    amountRaw: Amounts.stringify(amount),
    amountEffective: Amounts.stringify(wi.selectedDenoms.totalCoinValue),
    paytoUris,
    tosAccepted: wi.termsOfServiceAccepted,
  };
}

/**
 * Execute one operation based on the pending operation info record.
 */
async function processOnePendingOperation(
  ws: InternalWalletState,
  pending: PendingTaskInfo,
  forceNow = false,
): Promise<void> {
  logger.trace(`running pending ${JSON.stringify(pending, undefined, 2)}`);
  switch (pending.type) {
    case PendingTaskType.ExchangeUpdate:
      await updateExchangeFromUrl(
        ws,
        pending.exchangeBaseUrl,
        undefined,
        forceNow,
      );
      break;
    case PendingTaskType.Refresh:
      await processRefreshGroup(ws, pending.refreshGroupId, forceNow);
      break;
    case PendingTaskType.Reserve:
      await processReserve(ws, pending.reservePub, forceNow);
      break;
    case PendingTaskType.Withdraw:
      await processWithdrawGroup(ws, pending.withdrawalGroupId, forceNow);
      break;
    case PendingTaskType.ProposalDownload:
      await processDownloadProposal(ws, pending.proposalId, forceNow);
      break;
    case PendingTaskType.TipPickup:
      await processTip(ws, pending.tipId, forceNow);
      break;
    case PendingTaskType.Pay:
      await processPurchasePay(ws, pending.proposalId, forceNow);
      break;
    case PendingTaskType.RefundQuery:
      await processPurchaseQueryRefund(ws, pending.proposalId, forceNow);
      break;
    case PendingTaskType.Recoup:
      await processRecoupGroup(ws, pending.recoupGroupId, forceNow);
      break;
    case PendingTaskType.ExchangeCheckRefresh:
      await autoRefresh(ws, pending.exchangeBaseUrl);
      break;
    case PendingTaskType.Deposit:
      await processDepositGroup(ws, pending.depositGroupId);
      break;
    case PendingTaskType.Backup:
      await processBackupForProvider(ws, pending.backupProviderBaseUrl);
      break;
    default:
      assertUnreachable(pending);
  }
}

/**
 * Process pending operations.
 */
export async function runPending(
  ws: InternalWalletState,
  forceNow = false,
): Promise<void> {
  const pendingOpsResponse = await getPendingOperations(ws);
  for (const p of pendingOpsResponse.pendingOperations) {
    if (!forceNow && !isTimestampExpired(p.timestampDue)) {
      continue;
    }
    try {
      await processOnePendingOperation(ws, p, forceNow);
    } catch (e) {
      if (e instanceof OperationFailedAndReportedError) {
        console.error(
          "Operation failed:",
          JSON.stringify(e.operationError, undefined, 2),
        );
      } else {
        console.error(e);
      }
    }
  }
}

export interface RetryLoopOpts {
  /**
   * Stop when the number of retries is exceeded for any pending
   * operation.
   */
  maxRetries?: number;

  /**
   * Stop the retry loop when all lifeness-giving pending operations
   * are done.
   *
   * Defaults to false.
   */
  stopWhenDone?: boolean;
}

/**
 * Main retry loop of the wallet.
 *
 * Looks up pending operations from the wallet, runs them, repeat.
 */
async function runTaskLoop(
  ws: InternalWalletState,
  opts: RetryLoopOpts = {},
): Promise<void> {
  for (let iteration = 0; !ws.stopped; iteration++) {
    const pending = await getPendingOperations(ws);
    logger.trace(`pending operations: ${j2s(pending)}`);
    let numGivingLiveness = 0;
    let numDue = 0;
    let minDue: Timestamp = { t_ms: "never" };
    for (const p of pending.pendingOperations) {
      minDue = timestampMin(minDue, p.timestampDue);
      if (isTimestampExpired(p.timestampDue)) {
        numDue++;
      }
      if (p.givesLifeness) {
        numGivingLiveness++;
      }

      const maxRetries = opts.maxRetries;

      if (maxRetries && p.retryInfo && p.retryInfo.retryCounter > maxRetries) {
        logger.warn(
          `stopping, as ${maxRetries} retries are exceeded in an operation of type ${p.type}`,
        );
        return;
      }
    }

    if (opts.stopWhenDone && numGivingLiveness === 0 && iteration !== 0) {
      logger.warn(`stopping, as no pending operations have lifeness`);
      return;
    }

    // Make sure that we run tasks that don't give lifeness at least
    // one time.
    if (iteration !== 0 && numDue === 0) {
      // We've executed pending, due operations at least one.
      // Now we don't have any more operations available,
      // and need to wait.

      // Wait for at most 5 seconds to the next check.
      const dt = durationMin(
        durationFromSpec({
          seconds: 5,
        }),
        getDurationRemaining(minDue),
      );
      logger.trace(`waiting for at most ${dt.d_ms} ms`);
      const timeout = ws.timerGroup.resolveAfter(dt);
      ws.notify({
        type: NotificationType.WaitingForRetry,
        numGivingLiveness,
        numPending: pending.pendingOperations.length,
      });
      // Wait until either the timeout, or we are notified (via the latch)
      // that more work might be available.
      await Promise.race([timeout, ws.latch.wait()]);
    } else {
      logger.trace(
        `running ${pending.pendingOperations.length} pending operations`,
      );
      for (const p of pending.pendingOperations) {
        if (!isTimestampExpired(p.timestampDue)) {
          continue;
        }
        try {
          await processOnePendingOperation(ws, p);
        } catch (e) {
          if (e instanceof OperationFailedAndReportedError) {
            logger.warn("operation processed resulted in reported error");
            logger.warn(`reporred error was: ${j2s(e.operationError)}`);
          } else {
            logger.error("Uncaught exception", e);
            ws.notify({
              type: NotificationType.InternalError,
              message: "uncaught exception",
              exception: e,
            });
          }
        }
        ws.notify({
          type: NotificationType.PendingOperationProcessed,
        });
      }
    }
  }
  logger.trace("exiting wallet retry loop");
}

/**
 * Insert the hard-coded defaults for exchanges, coins and
 * auditors into the database, unless these defaults have
 * already been applied.
 */
async function fillDefaults(ws: InternalWalletState): Promise<void> {
  await ws.db
    .mktx((x) => ({ config: x.config, auditorTrustStore: x.auditorTrust }))
    .runReadWrite(async (tx) => {
      let applied = false;
      await tx.config.iter().forEach((x) => {
        if (x.key == "currencyDefaultsApplied" && x.value == true) {
          applied = true;
        }
      });
      if (!applied) {
        for (const c of builtinAuditors) {
          await tx.auditorTrustStore.put(c);
        }
      }
    });
}

/**
 * Create a reserve for a manual withdrawal.
 *
 * Adds the corresponding exchange as a trusted exchange if it is neither
 * audited nor trusted already.
 */
async function acceptManualWithdrawal(
  ws: InternalWalletState,
  exchangeBaseUrl: string,
  amount: AmountJson,
): Promise<AcceptManualWithdrawalResult> {
  try {
    const resp = await createReserve(ws, {
      amount,
      exchange: exchangeBaseUrl,
    });
    const exchangePaytoUris = await ws.db
      .mktx((x) => ({
        exchanges: x.exchanges,
        exchangeDetails: x.exchangeDetails,
        reserves: x.reserves,
      }))
      .runReadWrite((tx) => getFundingPaytoUris(tx, resp.reservePub));
    return {
      reservePub: resp.reservePub,
      exchangePaytoUris,
    };
  } finally {
    ws.latch.trigger();
  }
}

async function getExchangeTos(
  ws: InternalWalletState,
  exchangeBaseUrl: string,
  acceptedFormat?: string[],
): Promise<GetExchangeTosResult> {
  const { exchangeDetails } = await updateExchangeFromUrl(
    ws,
    exchangeBaseUrl,
    acceptedFormat,
  );
  const content = exchangeDetails.termsOfServiceText;
  const currentEtag = exchangeDetails.termsOfServiceLastEtag;
  const contentType = exchangeDetails.termsOfServiceContentType;
  if (
    content === undefined ||
    currentEtag === undefined ||
    contentType === undefined
  ) {
    throw Error("exchange is in invalid state");
  }
  return {
    acceptedEtag: exchangeDetails.termsOfServiceAcceptedEtag,
    currentEtag,
    content,
    contentType,
  };
}

async function getExchanges(
  ws: InternalWalletState,
): Promise<ExchangesListRespose> {
  const exchanges: ExchangeListItem[] = [];
  await ws.db
    .mktx((x) => ({
      exchanges: x.exchanges,
      exchangeDetails: x.exchangeDetails,
    }))
    .runReadOnly(async (tx) => {
      const exchangeRecords = await tx.exchanges.iter().toArray();
      for (const r of exchangeRecords) {
        const dp = r.detailsPointer;
        if (!dp) {
          continue;
        }
        const { currency } = dp;
        const exchangeDetails = await getExchangeDetails(tx, r.baseUrl);
        if (!exchangeDetails) {
          continue;
        }
        exchanges.push({
          exchangeBaseUrl: r.baseUrl,
          currency,
          paytoUris: exchangeDetails.wireInfo.accounts.map((x) => x.payto_uri),
        });
      }
    });
  return { exchanges };
}

async function acceptWithdrawal(
  ws: InternalWalletState,
  talerWithdrawUri: string,
  selectedExchange: string,
): Promise<AcceptWithdrawalResponse> {
  try {
    return createTalerWithdrawReserve(ws, talerWithdrawUri, selectedExchange);
  } finally {
    ws.latch.trigger();
  }
}

/**
 * Inform the wallet that the status of a reserve has changed (e.g. due to a
 * confirmation from the bank.).
 */
export async function handleNotifyReserve(
  ws: InternalWalletState,
): Promise<void> {
  const reserves = await ws.db
    .mktx((x) => ({
      reserves: x.reserves,
    }))
    .runReadOnly(async (tx) => {
      return tx.reserves.iter().toArray();
    });
  for (const r of reserves) {
    if (r.reserveStatus === ReserveRecordStatus.WAIT_CONFIRM_BANK) {
      try {
        processReserve(ws, r.reservePub);
      } catch (e) {
        console.error(e);
      }
    }
  }
}

async function setCoinSuspended(
  ws: InternalWalletState,
  coinPub: string,
  suspended: boolean,
): Promise<void> {
  await ws.db
    .mktx((x) => ({
      coins: x.coins,
    }))
    .runReadWrite(async (tx) => {
      const c = await tx.coins.get(coinPub);
      if (!c) {
        logger.warn(`coin ${coinPub} not found, won't suspend`);
        return;
      }
      c.suspended = suspended;
      await tx.coins.put(c);
    });
}

/**
 * Dump the public information of coins we have in an easy-to-process format.
 */
async function dumpCoins(ws: InternalWalletState): Promise<CoinDumpJson> {
  const coinsJson: CoinDumpJson = { coins: [] };
  await ws.db
    .mktx((x) => ({
      coins: x.coins,
      denominations: x.denominations,
      withdrawalGroups: x.withdrawalGroups,
    }))
    .runReadOnly(async (tx) => {
      const coins = await tx.coins.iter().toArray();
      for (const c of coins) {
        const denom = await tx.denominations.get([
          c.exchangeBaseUrl,
          c.denomPubHash,
        ]);
        if (!denom) {
          console.error("no denom session found for coin");
          continue;
        }
        const cs = c.coinSource;
        let refreshParentCoinPub: string | undefined;
        if (cs.type == CoinSourceType.Refresh) {
          refreshParentCoinPub = cs.oldCoinPub;
        }
        let withdrawalReservePub: string | undefined;
        if (cs.type == CoinSourceType.Withdraw) {
          const ws = await tx.withdrawalGroups.get(cs.withdrawalGroupId);
          if (!ws) {
            console.error("no withdrawal session found for coin");
            continue;
          }
          withdrawalReservePub = ws.reservePub;
        }
        coinsJson.coins.push({
          coin_pub: c.coinPub,
          denom_pub: c.denomPub,
          denom_pub_hash: c.denomPubHash,
          denom_value: Amounts.stringify(denom.value),
          exchange_base_url: c.exchangeBaseUrl,
          refresh_parent_coin_pub: refreshParentCoinPub,
          remaining_value: Amounts.stringify(c.currentAmount),
          withdrawal_reserve_pub: withdrawalReservePub,
          coin_suspended: c.suspended,
        });
      }
    });
  return coinsJson;
}

/**
 * Get an API client from an internal wallet state object.
 */
export async function getClientFromWalletState(
  ws: InternalWalletState,
): Promise<WalletCoreApiClient> {
  let id = 0;
  const client: WalletCoreApiClient = {
    async call(op, payload): Promise<any> {
      const res = await handleCoreApiRequest(ws, op, `${id++}`, payload);
      switch (res.type) {
        case "error":
          throw new OperationFailedError(res.error);
        case "response":
          return res.result;
      }
    },
  };
  return client;
}

/**
 * Implementation of the "wallet-core" API.
 */
async function dispatchRequestInternal(
  ws: InternalWalletState,
  operation: string,
  payload: unknown,
): Promise<Record<string, any>> {
  if (!ws.initCalled && operation !== "initWallet") {
    throw Error(
      `wallet must be initialized before running operation ${operation}`,
    );
  }
  switch (operation) {
    case "initWallet": {
      ws.initCalled = true;
      await fillDefaults(ws);
      return {};
    }
    case "withdrawTestkudos": {
      await withdrawTestBalance(
        ws,
        "TESTKUDOS:10",
        "https://bank.test.taler.net/",
        "https://exchange.test.taler.net/",
      );
      return {};
    }
    case "withdrawTestBalance": {
      const req = codecForWithdrawTestBalance().decode(payload);
      await withdrawTestBalance(
        ws,
        req.amount,
        req.bankBaseUrl,
        req.exchangeBaseUrl,
      );
      return {};
    }
    case "runIntegrationTest": {
      const req = codecForIntegrationTestArgs().decode(payload);
      await runIntegrationTest(ws, req);
      return {};
    }
    case "testPay": {
      const req = codecForTestPayArgs().decode(payload);
      await testPay(ws, req);
      return {};
    }
    case "getTransactions": {
      const req = codecForTransactionsRequest().decode(payload);
      return await getTransactions(ws, req);
    }
    case "addExchange": {
      const req = codecForAddExchangeRequest().decode(payload);
      await updateExchangeFromUrl(
        ws,
        req.exchangeBaseUrl,
        undefined,
        req.forceUpdate,
      );
      return {};
    }
    case "listExchanges": {
      return await getExchanges(ws);
    }
    case "getWithdrawalDetailsForUri": {
      const req = codecForGetWithdrawalDetailsForUri().decode(payload);
      return await getWithdrawalDetailsForUri(ws, req.talerWithdrawUri);
    }
    case "getExchangeWithdrawalInfo": {
      const req = codecForGetExchangeWithdrawalInfo().decode(payload);
      return await getExchangeWithdrawalInfo(
        ws,
        req.exchangeBaseUrl,
        req.amount,
      );
    }
    case "acceptManualWithdrawal": {
      const req = codecForAcceptManualWithdrawalRequet().decode(payload);
      const res = await acceptManualWithdrawal(
        ws,
        req.exchangeBaseUrl,
        Amounts.parseOrThrow(req.amount),
      );
      return res;
    }
    case "getWithdrawalDetailsForAmount": {
      const req = codecForGetWithdrawalDetailsForAmountRequest().decode(
        payload,
      );
      return await getWithdrawalDetailsForAmount(
        ws,
        req.exchangeBaseUrl,
        Amounts.parseOrThrow(req.amount),
      );
    }
    case "getBalances": {
      return await getBalances(ws);
    }
    case "getPendingOperations": {
      return await getPendingOperations(ws);
    }
    case "setExchangeTosAccepted": {
      const req = codecForAcceptExchangeTosRequest().decode(payload);
      await acceptExchangeTermsOfService(ws, req.exchangeBaseUrl, req.etag);
      return {};
    }
    case "applyRefund": {
      const req = codecForApplyRefundRequest().decode(payload);
      return await applyRefund(ws, req.talerRefundUri);
    }
    case "acceptBankIntegratedWithdrawal": {
      const req = codecForAcceptBankIntegratedWithdrawalRequest().decode(
        payload,
      );
      return await acceptWithdrawal(
        ws,
        req.talerWithdrawUri,
        req.exchangeBaseUrl,
      );
    }
    case "getExchangeTos": {
      const req = codecForGetExchangeTosRequest().decode(payload);
      return getExchangeTos(ws, req.exchangeBaseUrl, req.acceptedFormat);
    }
    case "retryPendingNow": {
      await runPending(ws, true);
      return {};
    }
    // FIXME: Deprecate one of the aliases!
    case "preparePayForUri":
    case "preparePay": {
      const req = codecForPreparePayRequest().decode(payload);
      return await preparePayForUri(ws, req.talerPayUri);
    }
    case "confirmPay": {
      const req = codecForConfirmPayRequest().decode(payload);
      return await confirmPay(ws, req.proposalId, req.sessionId);
    }
    case "abortFailedPayWithRefund": {
      const req = codecForAbortPayWithRefundRequest().decode(payload);
      await abortFailedPayWithRefund(ws, req.proposalId);
      return {};
    }
    case "dumpCoins": {
      return await dumpCoins(ws);
    }
    case "setCoinSuspended": {
      const req = codecForSetCoinSuspendedRequest().decode(payload);
      await setCoinSuspended(ws, req.coinPub, req.suspended);
      return {};
    }
    case "forceRefresh": {
      const req = codecForForceRefreshRequest().decode(payload);
      const coinPubs = req.coinPubList.map((x) => ({ coinPub: x }));
      const refreshGroupId = await ws.db
        .mktx((x) => ({
          refreshGroups: x.refreshGroups,
          denominations: x.denominations,
          coins: x.coins,
        }))
        .runReadWrite(async (tx) => {
          return await createRefreshGroup(
            ws,
            tx,
            coinPubs,
            RefreshReason.Manual,
          );
        });
      processRefreshGroup(ws, refreshGroupId.refreshGroupId, true).catch(
        (x) => {
          logger.error(x);
        },
      );
      return {
        refreshGroupId,
      };
    }
    case "prepareTip": {
      const req = codecForPrepareTipRequest().decode(payload);
      return await prepareTip(ws, req.talerTipUri);
    }
    case "acceptTip": {
      const req = codecForAcceptTipRequest().decode(payload);
      await acceptTip(ws, req.walletTipId);
      return {};
    }
    case "exportBackupPlain": {
      return exportBackup(ws);
    }
    case "addBackupProvider": {
      const req = codecForAddBackupProviderRequest().decode(payload);
      await addBackupProvider(ws, req);
      return {};
    }
    case "runBackupCycle": {
      const req = codecForRunBackupCycle().decode(payload);
      await runBackupCycle(ws, req);
      return {};
    }
    case "removeBackupProvider": {
      const req = codecForRemoveBackupProvider().decode(payload);
      await removeBackupProvider(ws, req);
      return {};
    }
    case "exportBackupRecovery": {
      const resp = await getBackupRecovery(ws);
      return resp;
    }
    case "importBackupRecovery": {
      const req = codecForAny().decode(payload);
      await loadBackupRecovery(ws, req);
      return {};
    }
    case "getBackupInfo": {
      const resp = await getBackupInfo(ws);
      return resp;
    }
    case "createDepositGroup": {
      const req = codecForCreateDepositGroupRequest().decode(payload);
      return await createDepositGroup(ws, req);
    }
    case "trackDepositGroup": {
      const req = codecForTrackDepositGroupRequest().decode(payload);
      return trackDepositGroup(ws, req);
    }
    case "deleteTransaction": {
      const req = codecForDeleteTransactionRequest().decode(payload);
      await deleteTransaction(ws, req.transactionId);
      return {};
    }
    case "retryTransaction": {
      const req = codecForRetryTransactionRequest().decode(payload);
      await retryTransaction(ws, req.transactionId);
      return {};
    }
    case "setWalletDeviceId": {
      const req = codecForSetWalletDeviceIdRequest().decode(payload);
      await setWalletDeviceId(ws, req.walletDeviceId);
      return {};
    }
    case "listCurrencies": {
      return await ws.db
        .mktx((x) => ({
          auditorTrust: x.auditorTrust,
          exchangeTrust: x.exchangeTrust,
        }))
        .runReadOnly(async (tx) => {
          const trustedAuditors = await tx.auditorTrust.iter().toArray();
          const trustedExchanges = await tx.exchangeTrust.iter().toArray();
          return {
            trustedAuditors: trustedAuditors.map((x) => ({
              currency: x.currency,
              auditorBaseUrl: x.auditorBaseUrl,
              auditorPub: x.auditorPub,
            })),
            trustedExchanges: trustedExchanges.map((x) => ({
              currency: x.currency,
              exchangeBaseUrl: x.exchangeBaseUrl,
              exchangeMasterPub: x.exchangeMasterPub,
            })),
          };
        });
    }
    case "withdrawFakebank": {
      const req = codecForWithdrawFakebankRequest().decode(payload);
      const amount = Amounts.parseOrThrow(req.amount);
      const details = await getWithdrawalDetailsForAmount(
        ws,
        req.exchange,
        amount,
      );
      const wres = await acceptManualWithdrawal(ws, req.exchange, amount);
      const paytoUri = details.paytoUris[0];
      const pt = parsePaytoUri(paytoUri);
      if (!pt) {
        throw Error("failed to parse payto URI");
      }
      const components = pt.targetPath.split("/");
      const creditorAcct = components[components.length - 1];
      logger.info(`making testbank transfer to '${creditorAcct}''`);
      const fbReq = await ws.http.postJson(
        new URL(`${creditorAcct}/admin/add-incoming`, req.bank).href,
        {
          amount: Amounts.stringify(amount),
          reserve_pub: wres.reservePub,
          debit_account: "payto://x-taler-bank/localhost/testdebtor",
        },
      );
      const fbResp = await readSuccessResponseJsonOrThrow(fbReq, codecForAny());
      logger.info(`started fakebank withdrawal: ${j2s(fbResp)}`);
      return {};
    }
  }
  throw OperationFailedError.fromCode(
    TalerErrorCode.WALLET_CORE_API_OPERATION_UNKNOWN,
    "unknown operation",
    {
      operation,
    },
  );
}

/**
 * Handle a request to the wallet-core API.
 */
export async function handleCoreApiRequest(
  ws: InternalWalletState,
  operation: string,
  id: string,
  payload: unknown,
): Promise<CoreApiResponse> {
  try {
    const result = await dispatchRequestInternal(ws, operation, payload);
    return {
      type: "response",
      operation,
      id,
      result,
    };
  } catch (e: any) {
    if (
      e instanceof OperationFailedError ||
      e instanceof OperationFailedAndReportedError
    ) {
      return {
        type: "error",
        operation,
        id,
        error: e.operationError,
      };
    } else {
      try {
        logger.error("Caught unexpected exception:");
        logger.error(e.stack);
      } catch (e) {}
      return {
        type: "error",
        operation,
        id,
        error: makeErrorDetails(
          TalerErrorCode.WALLET_UNEXPECTED_EXCEPTION,
          `unexpected exception: ${e}`,
          {},
        ),
      };
    }
  }
}

/**
 * Public handle to a running wallet.
 */
export class Wallet {
  private ws: InternalWalletState;
  private _client: WalletCoreApiClient;

  private constructor(
    db: DbAccess<typeof WalletStoresV1>,
    http: HttpRequestLibrary,
    cryptoWorkerFactory: CryptoWorkerFactory,
  ) {
    this.ws = new InternalWalletStateImpl(db, http, cryptoWorkerFactory);
  }

  get client() {
    return this._client;
  }

  static async create(
    db: DbAccess<typeof WalletStoresV1>,
    http: HttpRequestLibrary,
    cryptoWorkerFactory: CryptoWorkerFactory,
  ): Promise<Wallet> {
    const w = new Wallet(db, http, cryptoWorkerFactory);
    w._client = await getClientFromWalletState(w.ws);
    return w;
  }

  addNotificationListener(f: (n: WalletNotification) => void): void {
    return this.ws.addNotificationListener(f);
  }

  stop(): void {
    this.ws.stop();
  }

  runPending(forceNow: boolean = false) {
    return runPending(this.ws, forceNow);
  }

  runTaskLoop(opts?: RetryLoopOpts) {
    return runTaskLoop(this.ws, opts);
  }

  handleCoreApiRequest(
    operation: string,
    id: string,
    payload: unknown,
  ): Promise<CoreApiResponse> {
    return handleCoreApiRequest(this.ws, operation, id, payload);
  }
}

/**
 * Internal state of the wallet.
 *
 * This ties together all the operation implementations.
 */
class InternalWalletStateImpl implements InternalWalletState {
  memoProcessReserve: AsyncOpMemoMap<void> = new AsyncOpMemoMap();
  memoMakePlanchet: AsyncOpMemoMap<void> = new AsyncOpMemoMap();
  memoGetPending: AsyncOpMemoSingle<PendingOperationsResponse> = new AsyncOpMemoSingle();
  memoGetBalance: AsyncOpMemoSingle<BalancesResponse> = new AsyncOpMemoSingle();
  memoProcessRefresh: AsyncOpMemoMap<void> = new AsyncOpMemoMap();
  memoProcessRecoup: AsyncOpMemoMap<void> = new AsyncOpMemoMap();
  memoProcessDeposit: AsyncOpMemoMap<void> = new AsyncOpMemoMap();
  cryptoApi: CryptoApi;

  timerGroup: TimerGroup = new TimerGroup();
  latch = new AsyncCondition();
  stopped = false;

  listeners: NotificationListener[] = [];

  initCalled: boolean = false;

  exchangeOps: ExchangeOperations = {
    getExchangeDetails,
    getExchangeTrust,
    updateExchangeFromUrl,
  };

  recoupOps: RecoupOperations = {
    createRecoupGroup: createRecoupGroup,
    processRecoupGroup: processRecoupGroup,
  };

  /**
   * Promises that are waiting for a particular resource.
   */
  private resourceWaiters: Record<string, OpenedPromise<void>[]> = {};

  /**
   * Resources that are currently locked.
   */
  private resourceLocks: Set<string> = new Set();

  constructor(
    // FIXME: Make this a getter and make
    // the actual value nullable.
    // Check if we are in a DB migration / garbage collection
    // and throw an error in that case.
    public db: DbAccess<typeof WalletStoresV1>,
    public http: HttpRequestLibrary,
    cryptoWorkerFactory: CryptoWorkerFactory,
  ) {
    this.cryptoApi = new CryptoApi(cryptoWorkerFactory);
  }

  notify(n: WalletNotification): void {
    logger.trace("Notification", n);
    for (const l of this.listeners) {
      const nc = JSON.parse(JSON.stringify(n));
      setTimeout(() => {
        l(nc);
      }, 0);
    }
  }

  addNotificationListener(f: (n: WalletNotification) => void): void {
    this.listeners.push(f);
  }

  /**
   * Stop ongoing processing.
   */
  stop(): void {
    this.stopped = true;
    this.timerGroup.stopCurrentAndFutureTimers();
    this.cryptoApi.stop();
  }

  async runUntilDone(
    req: {
      maxRetries?: number;
    } = {},
  ): Promise<void> {
    await runTaskLoop(this, { ...req, stopWhenDone: true });
  }

  /**
   * Run an async function after acquiring a list of locks, identified
   * by string tokens.
   */
  async runSequentialized<T>(tokens: string[], f: () => Promise<T>) {
    // Make sure locks are always acquired in the same order
    tokens = [...tokens].sort();

    for (const token of tokens) {
      if (this.resourceLocks.has(token)) {
        const p = openPromise<void>();
        let waitList = this.resourceWaiters[token];
        if (!waitList) {
          waitList = this.resourceWaiters[token] = [];
        }
        waitList.push(p);
        await p.promise;
      }
      this.resourceLocks.add(token);
    }

    try {
      logger.trace(`begin exclusive execution on ${JSON.stringify(tokens)}`);
      const result = await f();
      logger.trace(`end exclusive execution on ${JSON.stringify(tokens)}`);
      return result;
    } finally {
      for (const token of tokens) {
        this.resourceLocks.delete(token);
        let waiter = (this.resourceWaiters[token] ?? []).shift();
        if (waiter) {
          waiter.resolve();
        }
      }
    }
  }
}
