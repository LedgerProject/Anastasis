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

import {
  AcceptWithdrawalResponse, addPaytoQueryParams, Amounts, canonicalizeBaseUrl, codecForBankWithdrawalOperationPostResponse,
  codecForReserveStatus,
  codecForWithdrawOperationStatusResponse, CreateReserveRequest,
  CreateReserveResponse, Duration,
  durationMax,
  durationMin, encodeCrock, getRandomBytes, getTimestampNow, Logger, NotificationType, randomBytes, ReserveTransactionType,
  TalerErrorCode, TalerErrorDetails, URL
} from "@gnu-taler/taler-util";
import { InternalWalletState } from "../common.js";
import {
  ReserveBankInfo,
  ReserveRecord, ReserveRecordStatus, WalletStoresV1, WithdrawalGroupRecord
} from "../db.js";
import { guardOperationException, OperationFailedError } from "../errors.js";
import { assertUnreachable } from "../util/assertUnreachable.js";
import {
  readSuccessResponseJsonOrErrorCode,
  readSuccessResponseJsonOrThrow,
  throwUnexpectedRequestError
} from "../util/http.js";
import { GetReadOnlyAccess } from "../util/query.js";
import {
  getRetryDuration, initRetryInfo, updateRetryInfoTimeout
} from "../util/retries.js";
import {
  getExchangeDetails, getExchangePaytoUri, getExchangeTrust, updateExchangeFromUrl
} from "./exchanges.js";
import {
  denomSelectionInfoToState, getBankWithdrawalInfo, getCandidateWithdrawalDenoms, processWithdrawGroup, selectWithdrawalDenominations, updateWithdrawalDenoms
} from "./withdraw.js";

const logger = new Logger("reserves.ts");

async function resetReserveRetry(
  ws: InternalWalletState,
  reservePub: string,
): Promise<void> {
  await ws.db
    .mktx((x) => ({
      reserves: x.reserves,
    }))
    .runReadWrite(async (tx) => {
      const x = await tx.reserves.get(reservePub);
      if (x) {
        x.retryInfo = initRetryInfo();
        await tx.reserves.put(x);
      }
    });
}

/**
 * Create a reserve, but do not flag it as confirmed yet.
 *
 * Adds the corresponding exchange as a trusted exchange if it is neither
 * audited nor trusted already.
 */
export async function createReserve(
  ws: InternalWalletState,
  req: CreateReserveRequest,
): Promise<CreateReserveResponse> {
  const keypair = await ws.cryptoApi.createEddsaKeypair();
  const now = getTimestampNow();
  const canonExchange = canonicalizeBaseUrl(req.exchange);

  let reserveStatus;
  if (req.bankWithdrawStatusUrl) {
    reserveStatus = ReserveRecordStatus.REGISTERING_BANK;
  } else {
    reserveStatus = ReserveRecordStatus.QUERYING_STATUS;
  }

  let bankInfo: ReserveBankInfo | undefined;

  if (req.bankWithdrawStatusUrl) {
    if (!req.exchangePaytoUri) {
      throw Error(
        "Exchange payto URI must be specified for a bank-integrated withdrawal",
      );
    }
    bankInfo = {
      statusUrl: req.bankWithdrawStatusUrl,
      exchangePaytoUri: req.exchangePaytoUri,
    };
  }

  const initialWithdrawalGroupId = encodeCrock(getRandomBytes(32));

  await updateWithdrawalDenoms(ws, canonExchange);
  const denoms = await getCandidateWithdrawalDenoms(ws, canonExchange);
  const denomSelInfo = selectWithdrawalDenominations(req.amount, denoms);
  const initialDenomSel = denomSelectionInfoToState(denomSelInfo);

  const reserveRecord: ReserveRecord = {
    instructedAmount: req.amount,
    initialWithdrawalGroupId,
    initialDenomSel,
    initialWithdrawalStarted: false,
    timestampCreated: now,
    exchangeBaseUrl: canonExchange,
    reservePriv: keypair.priv,
    reservePub: keypair.pub,
    senderWire: req.senderWire,
    timestampBankConfirmed: undefined,
    timestampReserveInfoPosted: undefined,
    bankInfo,
    reserveStatus,
    lastSuccessfulStatusQuery: undefined,
    retryInfo: initRetryInfo(),
    lastError: undefined,
    currency: req.amount.currency,
    requestedQuery: false,
  };

  const exchangeInfo = await updateExchangeFromUrl(ws, req.exchange);
  const exchangeDetails = exchangeInfo.exchangeDetails;
  if (!exchangeDetails) {
    logger.trace(exchangeDetails);
    throw Error("exchange not updated");
  }
  const { isAudited, isTrusted } = await getExchangeTrust(
    ws,
    exchangeInfo.exchange,
  );

  const resp = await ws.db
    .mktx((x) => ({
      exchangeTrust: x.exchangeTrust,
      reserves: x.reserves,
      bankWithdrawUris: x.bankWithdrawUris,
    }))
    .runReadWrite(async (tx) => {
      // Check if we have already created a reserve for that bankWithdrawStatusUrl
      if (reserveRecord.bankInfo?.statusUrl) {
        const bwi = await tx.bankWithdrawUris.get(
          reserveRecord.bankInfo.statusUrl,
        );
        if (bwi) {
          const otherReserve = await tx.reserves.get(bwi.reservePub);
          if (otherReserve) {
            logger.trace(
              "returning existing reserve for bankWithdrawStatusUri",
            );
            return {
              exchange: otherReserve.exchangeBaseUrl,
              reservePub: otherReserve.reservePub,
            };
          }
        }
        await tx.bankWithdrawUris.put({
          reservePub: reserveRecord.reservePub,
          talerWithdrawUri: reserveRecord.bankInfo.statusUrl,
        });
      }
      if (!isAudited && !isTrusted) {
        await tx.exchangeTrust.put({
          currency: reserveRecord.currency,
          exchangeBaseUrl: reserveRecord.exchangeBaseUrl,
          exchangeMasterPub: exchangeDetails.masterPublicKey,
          uids: [encodeCrock(getRandomBytes(32))],
        });
      }
      await tx.reserves.put(reserveRecord);
      const r: CreateReserveResponse = {
        exchange: canonExchange,
        reservePub: keypair.pub,
      };
      return r;
    });

  if (reserveRecord.reservePub === resp.reservePub) {
    // Only emit notification when a new reserve was created.
    ws.notify({
      type: NotificationType.ReserveCreated,
      reservePub: reserveRecord.reservePub,
    });
  }

  // Asynchronously process the reserve, but return
  // to the caller already.
  processReserve(ws, resp.reservePub, true).catch((e) => {
    logger.error("Processing reserve (after createReserve) failed:", e);
  });

  return resp;
}

/**
 * Re-query the status of a reserve.
 */
export async function forceQueryReserve(
  ws: InternalWalletState,
  reservePub: string,
): Promise<void> {
  await ws.db
    .mktx((x) => ({
      reserves: x.reserves,
    }))
    .runReadWrite(async (tx) => {
      const reserve = await tx.reserves.get(reservePub);
      if (!reserve) {
        return;
      }
      // Only force status query where it makes sense
      switch (reserve.reserveStatus) {
        case ReserveRecordStatus.DORMANT:
          reserve.reserveStatus = ReserveRecordStatus.QUERYING_STATUS;
          break;
        default:
          reserve.requestedQuery = true;
          break;
      }
      reserve.retryInfo = initRetryInfo();
      await tx.reserves.put(reserve);
    });
  await processReserve(ws, reservePub, true);
}

/**
 * First fetch information required to withdraw from the reserve,
 * then deplete the reserve, withdrawing coins until it is empty.
 *
 * The returned promise resolves once the reserve is set to the
 * state DORMANT.
 */
export async function processReserve(
  ws: InternalWalletState,
  reservePub: string,
  forceNow = false,
): Promise<void> {
  return ws.memoProcessReserve.memo(reservePub, async () => {
    const onOpError = (err: TalerErrorDetails): Promise<void> =>
      incrementReserveRetry(ws, reservePub, err);
    await guardOperationException(
      () => processReserveImpl(ws, reservePub, forceNow),
      onOpError,
    );
  });
}

async function registerReserveWithBank(
  ws: InternalWalletState,
  reservePub: string,
): Promise<void> {
  const reserve = await ws.db
    .mktx((x) => ({
      reserves: x.reserves,
    }))
    .runReadOnly(async (tx) => {
      return await tx.reserves.get(reservePub);
    });
  switch (reserve?.reserveStatus) {
    case ReserveRecordStatus.WAIT_CONFIRM_BANK:
    case ReserveRecordStatus.REGISTERING_BANK:
      break;
    default:
      return;
  }
  const bankInfo = reserve.bankInfo;
  if (!bankInfo) {
    return;
  }
  const bankStatusUrl = bankInfo.statusUrl;
  const httpResp = await ws.http.postJson(
    bankStatusUrl,
    {
      reserve_pub: reservePub,
      selected_exchange: bankInfo.exchangePaytoUri,
    },
    {
      timeout: getReserveRequestTimeout(reserve),
    },
  );
  await readSuccessResponseJsonOrThrow(
    httpResp,
    codecForBankWithdrawalOperationPostResponse(),
  );
  await ws.db
    .mktx((x) => ({
      reserves: x.reserves,
    }))
    .runReadWrite(async (tx) => {
      const r = await tx.reserves.get(reservePub);
      if (!r) {
        return;
      }
      switch (r.reserveStatus) {
        case ReserveRecordStatus.REGISTERING_BANK:
        case ReserveRecordStatus.WAIT_CONFIRM_BANK:
          break;
        default:
          return;
      }
      r.timestampReserveInfoPosted = getTimestampNow();
      r.reserveStatus = ReserveRecordStatus.WAIT_CONFIRM_BANK;
      if (!r.bankInfo) {
        throw Error("invariant failed");
      }
      r.retryInfo = initRetryInfo();
      await tx.reserves.put(r);
    });
  ws.notify({ type: NotificationType.ReserveRegisteredWithBank });
  return processReserveBankStatus(ws, reservePub);
}

async function processReserveBankStatus(
  ws: InternalWalletState,
  reservePub: string,
): Promise<void> {
  const onOpError = (err: TalerErrorDetails): Promise<void> =>
    incrementReserveRetry(ws, reservePub, err);
  await guardOperationException(
    () => processReserveBankStatusImpl(ws, reservePub),
    onOpError,
  );
}

export function getReserveRequestTimeout(r: ReserveRecord): Duration {
  return durationMax(
    { d_ms: 60000 },
    durationMin({ d_ms: 5000 }, getRetryDuration(r.retryInfo)),
  );
}

async function processReserveBankStatusImpl(
  ws: InternalWalletState,
  reservePub: string,
): Promise<void> {
  const reserve = await ws.db
    .mktx((x) => ({
      reserves: x.reserves,
    }))
    .runReadOnly(async (tx) => {
      return tx.reserves.get(reservePub);
    });
  switch (reserve?.reserveStatus) {
    case ReserveRecordStatus.WAIT_CONFIRM_BANK:
    case ReserveRecordStatus.REGISTERING_BANK:
      break;
    default:
      return;
  }
  const bankStatusUrl = reserve.bankInfo?.statusUrl;
  if (!bankStatusUrl) {
    return;
  }

  const statusResp = await ws.http.get(bankStatusUrl, {
    timeout: getReserveRequestTimeout(reserve),
  });
  const status = await readSuccessResponseJsonOrThrow(
    statusResp,
    codecForWithdrawOperationStatusResponse(),
  );

  if (status.aborted) {
    logger.trace("bank aborted the withdrawal");
    await ws.db
      .mktx((x) => ({
        reserves: x.reserves,
      }))
      .runReadWrite(async (tx) => {
        const r = await tx.reserves.get(reservePub);
        if (!r) {
          return;
        }
        switch (r.reserveStatus) {
          case ReserveRecordStatus.REGISTERING_BANK:
          case ReserveRecordStatus.WAIT_CONFIRM_BANK:
            break;
          default:
            return;
        }
        const now = getTimestampNow();
        r.timestampBankConfirmed = now;
        r.reserveStatus = ReserveRecordStatus.BANK_ABORTED;
        r.retryInfo = initRetryInfo();
        await tx.reserves.put(r);
      });
    return;
  }

  if (status.selection_done) {
    if (reserve.reserveStatus === ReserveRecordStatus.REGISTERING_BANK) {
      await registerReserveWithBank(ws, reservePub);
      return await processReserveBankStatus(ws, reservePub);
    }
  } else {
    await registerReserveWithBank(ws, reservePub);
    return await processReserveBankStatus(ws, reservePub);
  }

  await ws.db
    .mktx((x) => ({
      reserves: x.reserves,
    }))
    .runReadWrite(async (tx) => {
      const r = await tx.reserves.get(reservePub);
      if (!r) {
        return;
      }
      if (status.transfer_done) {
        switch (r.reserveStatus) {
          case ReserveRecordStatus.REGISTERING_BANK:
          case ReserveRecordStatus.WAIT_CONFIRM_BANK:
            break;
          default:
            return;
        }
        const now = getTimestampNow();
        r.timestampBankConfirmed = now;
        r.reserveStatus = ReserveRecordStatus.QUERYING_STATUS;
        r.retryInfo = initRetryInfo();
      } else {
        switch (r.reserveStatus) {
          case ReserveRecordStatus.WAIT_CONFIRM_BANK:
            break;
          default:
            return;
        }
        if (r.bankInfo) {
          r.bankInfo.confirmUrl = status.confirm_transfer_url;
        }
      }
      await tx.reserves.put(r);
    });
}

async function incrementReserveRetry(
  ws: InternalWalletState,
  reservePub: string,
  err: TalerErrorDetails | undefined,
): Promise<void> {
  await ws.db
    .mktx((x) => ({
      reserves: x.reserves,
    }))
    .runReadWrite(async (tx) => {
      const r = await tx.reserves.get(reservePub);
      if (!r) {
        return;
      }
      if (!r.retryInfo) {
        return;
      }
      r.retryInfo.retryCounter++;
      updateRetryInfoTimeout(r.retryInfo);
      r.lastError = err;
      await tx.reserves.put(r);
    });
  if (err) {
    ws.notify({
      type: NotificationType.ReserveOperationError,
      error: err,
    });
  }
}

/**
 * Update the information about a reserve that is stored in the wallet
 * by querying the reserve's exchange.
 *
 * If the reserve have funds that are not allocated in a withdrawal group yet
 * and are big enough to withdraw with available denominations,
 * create a new withdrawal group for the remaining amount.
 */
async function updateReserve(
  ws: InternalWalletState,
  reservePub: string,
): Promise<{ ready: boolean }> {
  const reserve = await ws.db
    .mktx((x) => ({
      reserves: x.reserves,
    }))
    .runReadOnly(async (tx) => {
      return tx.reserves.get(reservePub);
    });
  if (!reserve) {
    throw Error("reserve not in db");
  }

  if (reserve.reserveStatus !== ReserveRecordStatus.QUERYING_STATUS) {
    return { ready: true };
  }

  const resp = await ws.http.get(
    new URL(`reserves/${reservePub}`, reserve.exchangeBaseUrl).href,
    {
      timeout: getReserveRequestTimeout(reserve),
    },
  );

  const result = await readSuccessResponseJsonOrErrorCode(
    resp,
    codecForReserveStatus(),
  );
  if (result.isError) {
    if (
      resp.status === 404 &&
      result.talerErrorResponse.code ===
      TalerErrorCode.EXCHANGE_RESERVES_GET_STATUS_UNKNOWN
    ) {
      ws.notify({
        type: NotificationType.ReserveNotYetFound,
        reservePub,
      });
      await incrementReserveRetry(ws, reservePub, undefined);
      return { ready: false };
    } else {
      throwUnexpectedRequestError(resp, result.talerErrorResponse);
    }
  }

  const reserveInfo = result.response;
  const balance = Amounts.parseOrThrow(reserveInfo.balance);
  const currency = balance.currency;

  await updateWithdrawalDenoms(ws, reserve.exchangeBaseUrl);
  const denoms = await getCandidateWithdrawalDenoms(
    ws,
    reserve.exchangeBaseUrl,
  );

  const newWithdrawalGroup = await ws.db
    .mktx((x) => ({
      coins: x.coins,
      planchets: x.planchets,
      withdrawalGroups: x.withdrawalGroups,
      reserves: x.reserves,
    }))
    .runReadWrite(async (tx) => {
      const newReserve = await tx.reserves.get(reserve.reservePub);
      if (!newReserve) {
        return;
      }
      let amountReservePlus = Amounts.getZero(currency);
      let amountReserveMinus = Amounts.getZero(currency);

      // Subtract withdrawal groups for this reserve from the available amount.
      await tx.withdrawalGroups.indexes.byReservePub
        .iter(reservePub)
        .forEach((wg) => {
          const cost = wg.denomsSel.totalWithdrawCost;
          amountReserveMinus = Amounts.add(amountReserveMinus, cost).amount;
        });

      for (const entry of reserveInfo.history) {
        switch (entry.type) {
          case ReserveTransactionType.Credit:
            amountReservePlus = Amounts.add(
              amountReservePlus,
              Amounts.parseOrThrow(entry.amount),
            ).amount;
            break;
          case ReserveTransactionType.Recoup:
            amountReservePlus = Amounts.add(
              amountReservePlus,
              Amounts.parseOrThrow(entry.amount),
            ).amount;
            break;
          case ReserveTransactionType.Closing:
            amountReserveMinus = Amounts.add(
              amountReserveMinus,
              Amounts.parseOrThrow(entry.amount),
            ).amount;
            break;
          case ReserveTransactionType.Withdraw: {
            // Now we check if the withdrawal transaction
            // is part of any withdrawal known to this wallet.
            const planchet = await tx.planchets.indexes.byCoinEvHash.get(
              entry.h_coin_envelope,
            );
            if (planchet) {
              // Amount is already accounted in some withdrawal session
              break;
            }
            const coin = await tx.coins.indexes.byCoinEvHash.get(
              entry.h_coin_envelope,
            );
            if (coin) {
              // Amount is already accounted in some withdrawal session
              break;
            }
            // Amount has been claimed by some withdrawal we don't know about
            amountReserveMinus = Amounts.add(
              amountReserveMinus,
              Amounts.parseOrThrow(entry.amount),
            ).amount;
            break;
          }
        }
      }

      const remainingAmount = Amounts.sub(amountReservePlus, amountReserveMinus)
        .amount;
      const denomSelInfo = selectWithdrawalDenominations(
        remainingAmount,
        denoms,
      );

      logger.trace(
        `Remaining unclaimed amount in reseve is ${Amounts.stringify(
          remainingAmount,
        )} and can be withdrawn with ${denomSelInfo.selectedDenoms.length
        } coins`,
      );

      if (denomSelInfo.selectedDenoms.length === 0) {
        newReserve.reserveStatus = ReserveRecordStatus.DORMANT;
        newReserve.lastError = undefined;
        newReserve.retryInfo = initRetryInfo();
        await tx.reserves.put(newReserve);
        return;
      }

      let withdrawalGroupId: string;

      if (!newReserve.initialWithdrawalStarted) {
        withdrawalGroupId = newReserve.initialWithdrawalGroupId;
        newReserve.initialWithdrawalStarted = true;
      } else {
        withdrawalGroupId = encodeCrock(randomBytes(32));
      }

      const withdrawalRecord: WithdrawalGroupRecord = {
        withdrawalGroupId: withdrawalGroupId,
        exchangeBaseUrl: reserve.exchangeBaseUrl,
        reservePub: reserve.reservePub,
        rawWithdrawalAmount: remainingAmount,
        timestampStart: getTimestampNow(),
        retryInfo: initRetryInfo(),
        lastError: undefined,
        denomsSel: denomSelectionInfoToState(denomSelInfo),
        secretSeed: encodeCrock(getRandomBytes(64)),
        denomSelUid: encodeCrock(getRandomBytes(32)),
      };

      newReserve.lastError = undefined;
      newReserve.retryInfo = initRetryInfo();
      newReserve.reserveStatus = ReserveRecordStatus.DORMANT;

      await tx.reserves.put(newReserve);
      await tx.withdrawalGroups.put(withdrawalRecord);
      return withdrawalRecord;
    });

  if (newWithdrawalGroup) {
    logger.trace("processing new withdraw group");
    ws.notify({
      type: NotificationType.WithdrawGroupCreated,
      withdrawalGroupId: newWithdrawalGroup.withdrawalGroupId,
    });
    await processWithdrawGroup(ws, newWithdrawalGroup.withdrawalGroupId);
  }

  return { ready: true };
}

async function processReserveImpl(
  ws: InternalWalletState,
  reservePub: string,
  forceNow = false,
): Promise<void> {
  const reserve = await ws.db
    .mktx((x) => ({
      reserves: x.reserves,
    }))
    .runReadOnly(async (tx) => {
      return tx.reserves.get(reservePub);
    });
  if (!reserve) {
    logger.trace("not processing reserve: reserve does not exist");
    return;
  }
  if (!forceNow) {
    const now = getTimestampNow();
    if (reserve.retryInfo.nextRetry.t_ms > now.t_ms) {
      logger.trace("processReserve retry not due yet");
      return;
    }
  } else {
    await resetReserveRetry(ws, reservePub);
  }
  logger.trace(
    `Processing reserve ${reservePub} with status ${reserve.reserveStatus}`,
  );
  switch (reserve.reserveStatus) {
    case ReserveRecordStatus.REGISTERING_BANK:
      await processReserveBankStatus(ws, reservePub);
      return await processReserveImpl(ws, reservePub, true);
    case ReserveRecordStatus.QUERYING_STATUS:
      const res = await updateReserve(ws, reservePub);
      if (res.ready) {
        return await processReserveImpl(ws, reservePub, true);
      }
      break;
    case ReserveRecordStatus.DORMANT:
      // nothing to do
      break;
    case ReserveRecordStatus.WAIT_CONFIRM_BANK:
      await processReserveBankStatus(ws, reservePub);
      break;
    case ReserveRecordStatus.BANK_ABORTED:
      break;
    default:
      console.warn("unknown reserve record status:", reserve.reserveStatus);
      assertUnreachable(reserve.reserveStatus);
      break;
  }
}
export async function createTalerWithdrawReserve(
  ws: InternalWalletState,
  talerWithdrawUri: string,
  selectedExchange: string,
): Promise<AcceptWithdrawalResponse> {
  await updateExchangeFromUrl(ws, selectedExchange);
  const withdrawInfo = await getBankWithdrawalInfo(ws, talerWithdrawUri);
  const exchangePaytoUri = await getExchangePaytoUri(
    ws,
    selectedExchange,
    withdrawInfo.wireTypes,
  );
  const reserve = await createReserve(ws, {
    amount: withdrawInfo.amount,
    bankWithdrawStatusUrl: withdrawInfo.extractedStatusUrl,
    exchange: selectedExchange,
    senderWire: withdrawInfo.senderWire,
    exchangePaytoUri: exchangePaytoUri,
  });
  // We do this here, as the reserve should be registered before we return,
  // so that we can redirect the user to the bank's status page.
  await processReserveBankStatus(ws, reserve.reservePub);
  const processedReserve = await ws.db
    .mktx((x) => ({
      reserves: x.reserves,
    }))
    .runReadOnly(async (tx) => {
      return tx.reserves.get(reserve.reservePub);
    });
  if (processedReserve?.reserveStatus === ReserveRecordStatus.BANK_ABORTED) {
    throw OperationFailedError.fromCode(
      TalerErrorCode.WALLET_WITHDRAWAL_OPERATION_ABORTED_BY_BANK,
      "withdrawal aborted by bank",
      {},
    );
  }
  return {
    reservePub: reserve.reservePub,
    confirmTransferUrl: withdrawInfo.confirmTransferUrl,
  };
}

/**
 * Get payto URIs needed to fund a reserve.
 */
export async function getFundingPaytoUris(
  tx: GetReadOnlyAccess<{
    reserves: typeof WalletStoresV1.reserves;
    exchanges: typeof WalletStoresV1.exchanges;
    exchangeDetails: typeof WalletStoresV1.exchangeDetails;
  }>,
  reservePub: string,
): Promise<string[]> {
  const r = await tx.reserves.get(reservePub);
  if (!r) {
    logger.error(`reserve ${reservePub} not found (DB corrupted?)`);
    return [];
  }
  const exchangeDetails = await getExchangeDetails(tx, r.exchangeBaseUrl);
  if (!exchangeDetails) {
    logger.error(`exchange ${r.exchangeBaseUrl} not found (DB corrupted?)`);
    return [];
  }
  const plainPaytoUris =
    exchangeDetails.wireInfo?.accounts.map((x) => x.payto_uri) ?? [];
  if (!plainPaytoUris) {
    logger.error(`exchange ${r.exchangeBaseUrl} has no wire info`);
    return [];
  }
  return plainPaytoUris.map((x) =>
    addPaytoQueryParams(x, {
      amount: Amounts.stringify(r.instructedAmount),
      message: `Taler Withdrawal ${r.reservePub}`,
    }),
  );
}
