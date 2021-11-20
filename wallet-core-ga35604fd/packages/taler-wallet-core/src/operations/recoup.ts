/*
 This file is part of GNU Taler
 (C) 2019-2020 Taler Systems SA

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
 * Implementation of the recoup operation, which allows to recover the
 * value of coins held in a revoked denomination.
 *
 * @author Florian Dold <dold@taler.net>
 */

/**
 * Imports.
 */
import {
  Amounts,
  codecForRecoupConfirmation,
  getTimestampNow,
  NotificationType,
  RefreshReason,
  TalerErrorDetails,
} from "@gnu-taler/taler-util";
import { encodeCrock, getRandomBytes } from "@gnu-taler/taler-util";
import {
  CoinRecord,
  CoinSourceType,
  CoinStatus,
  RecoupGroupRecord,
  RefreshCoinSource,
  ReserveRecordStatus,
  WithdrawCoinSource,
  WalletStoresV1,
} from "../db.js";

import { readSuccessResponseJsonOrThrow } from "../util/http.js";
import { Logger, URL } from "@gnu-taler/taler-util";
import { initRetryInfo, updateRetryInfoTimeout } from "../util/retries.js";
import { guardOperationException } from "../errors.js";
import { createRefreshGroup, processRefreshGroup } from "./refresh.js";
import { getReserveRequestTimeout, processReserve } from "./reserves.js";
import { InternalWalletState } from "../common.js";
import { GetReadWriteAccess } from "../util/query.js";

const logger = new Logger("operations/recoup.ts");

async function incrementRecoupRetry(
  ws: InternalWalletState,
  recoupGroupId: string,
  err: TalerErrorDetails | undefined,
): Promise<void> {
  await ws.db
    .mktx((x) => ({
      recoupGroups: x.recoupGroups,
    }))
    .runReadWrite(async (tx) => {
      const r = await tx.recoupGroups.get(recoupGroupId);
      if (!r) {
        return;
      }
      if (!r.retryInfo) {
        return;
      }
      r.retryInfo.retryCounter++;
      updateRetryInfoTimeout(r.retryInfo);
      r.lastError = err;
      await tx.recoupGroups.put(r);
    });
  if (err) {
    ws.notify({ type: NotificationType.RecoupOperationError, error: err });
  }
}

async function putGroupAsFinished(
  ws: InternalWalletState,
  tx: GetReadWriteAccess<{
    recoupGroups: typeof WalletStoresV1.recoupGroups;
    denominations: typeof WalletStoresV1.denominations;
    refreshGroups: typeof WalletStoresV1.refreshGroups;
    coins: typeof WalletStoresV1.coins;
  }>,
  recoupGroup: RecoupGroupRecord,
  coinIdx: number,
): Promise<void> {
  logger.trace(
    `setting coin ${coinIdx} of ${recoupGroup.coinPubs.length} as finished`,
  );
  if (recoupGroup.timestampFinished) {
    return;
  }
  recoupGroup.recoupFinishedPerCoin[coinIdx] = true;
  let allFinished = true;
  for (const b of recoupGroup.recoupFinishedPerCoin) {
    if (!b) {
      allFinished = false;
    }
  }
  if (allFinished) {
    logger.trace("all recoups of recoup group are finished");
    recoupGroup.timestampFinished = getTimestampNow();
    recoupGroup.retryInfo = initRetryInfo();
    recoupGroup.lastError = undefined;
    if (recoupGroup.scheduleRefreshCoins.length > 0) {
      const refreshGroupId = await createRefreshGroup(
        ws,
        tx,
        recoupGroup.scheduleRefreshCoins.map((x) => ({ coinPub: x })),
        RefreshReason.Recoup,
      );
      processRefreshGroup(ws, refreshGroupId.refreshGroupId).then((e) => {
        console.error("error while refreshing after recoup", e);
      });
    }
  }
  await tx.recoupGroups.put(recoupGroup);
}

async function recoupTipCoin(
  ws: InternalWalletState,
  recoupGroupId: string,
  coinIdx: number,
  coin: CoinRecord,
): Promise<void> {
  // We can't really recoup a coin we got via tipping.
  // Thus we just put the coin to sleep.
  // FIXME: somehow report this to the user
  await ws.db
    .mktx((x) => ({
      recoupGroups: x.recoupGroups,
      denominations: WalletStoresV1.denominations,
      refreshGroups: WalletStoresV1.refreshGroups,
      coins: WalletStoresV1.coins,
    }))
    .runReadWrite(async (tx) => {
      const recoupGroup = await tx.recoupGroups.get(recoupGroupId);
      if (!recoupGroup) {
        return;
      }
      if (recoupGroup.recoupFinishedPerCoin[coinIdx]) {
        return;
      }
      await putGroupAsFinished(ws, tx, recoupGroup, coinIdx);
    });
}

async function recoupWithdrawCoin(
  ws: InternalWalletState,
  recoupGroupId: string,
  coinIdx: number,
  coin: CoinRecord,
  cs: WithdrawCoinSource,
): Promise<void> {
  const reservePub = cs.reservePub;
  const reserve = await ws.db
    .mktx((x) => ({
      reserves: x.reserves,
    }))
    .runReadOnly(async (tx) => {
      return tx.reserves.get(reservePub);
    });
  if (!reserve) {
    // FIXME:  We should at least emit some pending operation / warning for this?
    return;
  }

  ws.notify({
    type: NotificationType.RecoupStarted,
  });

  const recoupRequest = await ws.cryptoApi.createRecoupRequest(coin);
  const reqUrl = new URL(`/coins/${coin.coinPub}/recoup`, coin.exchangeBaseUrl);
  const resp = await ws.http.postJson(reqUrl.href, recoupRequest, {
    timeout: getReserveRequestTimeout(reserve),
  });
  const recoupConfirmation = await readSuccessResponseJsonOrThrow(
    resp,
    codecForRecoupConfirmation(),
  );

  if (recoupConfirmation.reserve_pub !== reservePub) {
    throw Error(`Coin's reserve doesn't match reserve on recoup`);
  }

  // FIXME: verify that our expectations about the amount match

  await ws.db
    .mktx((x) => ({
      coins: x.coins,
      denominations: x.denominations,
      reserves: x.reserves,
      recoupGroups: x.recoupGroups,
      refreshGroups: x.refreshGroups,
    }))
    .runReadWrite(async (tx) => {
      const recoupGroup = await tx.recoupGroups.get(recoupGroupId);
      if (!recoupGroup) {
        return;
      }
      if (recoupGroup.recoupFinishedPerCoin[coinIdx]) {
        return;
      }
      const updatedCoin = await tx.coins.get(coin.coinPub);
      if (!updatedCoin) {
        return;
      }
      const updatedReserve = await tx.reserves.get(reserve.reservePub);
      if (!updatedReserve) {
        return;
      }
      updatedCoin.status = CoinStatus.Dormant;
      const currency = updatedCoin.currentAmount.currency;
      updatedCoin.currentAmount = Amounts.getZero(currency);
      if (updatedReserve.reserveStatus === ReserveRecordStatus.DORMANT) {
        updatedReserve.reserveStatus = ReserveRecordStatus.QUERYING_STATUS;
        updatedReserve.retryInfo = initRetryInfo();
      } else {
        updatedReserve.requestedQuery = true;
        updatedReserve.retryInfo = initRetryInfo();
      }
      await tx.coins.put(updatedCoin);
      await tx.reserves.put(updatedReserve);
      await putGroupAsFinished(ws, tx, recoupGroup, coinIdx);
    });

  ws.notify({
    type: NotificationType.RecoupFinished,
  });
}

async function recoupRefreshCoin(
  ws: InternalWalletState,
  recoupGroupId: string,
  coinIdx: number,
  coin: CoinRecord,
  cs: RefreshCoinSource,
): Promise<void> {
  ws.notify({
    type: NotificationType.RecoupStarted,
  });

  const recoupRequest = await ws.cryptoApi.createRecoupRequest(coin);
  const reqUrl = new URL(`/coins/${coin.coinPub}/recoup`, coin.exchangeBaseUrl);
  logger.trace(`making recoup request for ${coin.coinPub}`);

  const resp = await ws.http.postJson(reqUrl.href, recoupRequest);
  const recoupConfirmation = await readSuccessResponseJsonOrThrow(
    resp,
    codecForRecoupConfirmation(),
  );

  if (recoupConfirmation.old_coin_pub != cs.oldCoinPub) {
    throw Error(`Coin's oldCoinPub doesn't match reserve on recoup`);
  }

  await ws.db
    .mktx((x) => ({
      coins: x.coins,
      denominations: x.denominations,
      reserves: x.reserves,
      recoupGroups: x.recoupGroups,
      refreshGroups: x.refreshGroups,
    }))
    .runReadWrite(async (tx) => {
      const recoupGroup = await tx.recoupGroups.get(recoupGroupId);
      if (!recoupGroup) {
        return;
      }
      if (recoupGroup.recoupFinishedPerCoin[coinIdx]) {
        return;
      }
      const oldCoin = await tx.coins.get(cs.oldCoinPub);
      const revokedCoin = await tx.coins.get(coin.coinPub);
      if (!revokedCoin) {
        logger.warn("revoked coin for recoup not found");
        return;
      }
      if (!oldCoin) {
        logger.warn("refresh old coin for recoup not found");
        return;
      }
      revokedCoin.status = CoinStatus.Dormant;
      oldCoin.currentAmount = Amounts.add(
        oldCoin.currentAmount,
        recoupGroup.oldAmountPerCoin[coinIdx],
      ).amount;
      logger.trace(
        "recoup: setting old coin amount to",
        Amounts.stringify(oldCoin.currentAmount),
      );
      recoupGroup.scheduleRefreshCoins.push(oldCoin.coinPub);
      await tx.coins.put(revokedCoin);
      await tx.coins.put(oldCoin);
      await putGroupAsFinished(ws, tx, recoupGroup, coinIdx);
    });
}

async function resetRecoupGroupRetry(
  ws: InternalWalletState,
  recoupGroupId: string,
): Promise<void> {
  await ws.db
    .mktx((x) => ({
      recoupGroups: x.recoupGroups,
    }))
    .runReadWrite(async (tx) => {
      const x = await tx.recoupGroups.get(recoupGroupId);
      if (x) {
        x.retryInfo = initRetryInfo();
        await tx.recoupGroups.put(x);
      }
    });
}

export async function processRecoupGroup(
  ws: InternalWalletState,
  recoupGroupId: string,
  forceNow = false,
): Promise<void> {
  await ws.memoProcessRecoup.memo(recoupGroupId, async () => {
    const onOpErr = (e: TalerErrorDetails): Promise<void> =>
      incrementRecoupRetry(ws, recoupGroupId, e);
    return await guardOperationException(
      async () => await processRecoupGroupImpl(ws, recoupGroupId, forceNow),
      onOpErr,
    );
  });
}

async function processRecoupGroupImpl(
  ws: InternalWalletState,
  recoupGroupId: string,
  forceNow = false,
): Promise<void> {
  if (forceNow) {
    await resetRecoupGroupRetry(ws, recoupGroupId);
  }
  const recoupGroup = await ws.db
    .mktx((x) => ({
      recoupGroups: x.recoupGroups,
    }))
    .runReadOnly(async (tx) => {
      return tx.recoupGroups.get(recoupGroupId);
    });
  if (!recoupGroup) {
    return;
  }
  if (recoupGroup.timestampFinished) {
    logger.trace("recoup group finished");
    return;
  }
  const ps = recoupGroup.coinPubs.map((x, i) =>
    processRecoup(ws, recoupGroupId, i),
  );
  await Promise.all(ps);

  const reserveSet = new Set<string>();
  for (let i = 0; i < recoupGroup.coinPubs.length; i++) {
    const coinPub = recoupGroup.coinPubs[i];
    const coin = await ws.db
      .mktx((x) => ({
        coins: x.coins,
      }))
      .runReadOnly(async (tx) => {
        return tx.coins.get(coinPub);
      });
    if (!coin) {
      throw Error(`Coin ${coinPub} not found, can't request recoup`);
    }
    if (coin.coinSource.type === CoinSourceType.Withdraw) {
      reserveSet.add(coin.coinSource.reservePub);
    }
  }

  for (const r of reserveSet.values()) {
    processReserve(ws, r).catch((e) => {
      logger.error(`processing reserve ${r} after recoup failed`);
    });
  }
}

export async function createRecoupGroup(
  ws: InternalWalletState,
  tx: GetReadWriteAccess<{
    recoupGroups: typeof WalletStoresV1.recoupGroups;
    denominations: typeof WalletStoresV1.denominations;
    refreshGroups: typeof WalletStoresV1.refreshGroups;
    coins: typeof WalletStoresV1.coins;
  }>,
  coinPubs: string[],
): Promise<string> {
  const recoupGroupId = encodeCrock(getRandomBytes(32));

  const recoupGroup: RecoupGroupRecord = {
    recoupGroupId,
    coinPubs: coinPubs,
    lastError: undefined,
    timestampFinished: undefined,
    timestampStarted: getTimestampNow(),
    retryInfo: initRetryInfo(),
    recoupFinishedPerCoin: coinPubs.map(() => false),
    // Will be populated later
    oldAmountPerCoin: [],
    scheduleRefreshCoins: [],
  };

  for (let coinIdx = 0; coinIdx < coinPubs.length; coinIdx++) {
    const coinPub = coinPubs[coinIdx];
    const coin = await tx.coins.get(coinPub);
    if (!coin) {
      await putGroupAsFinished(ws, tx, recoupGroup, coinIdx);
      continue;
    }
    if (Amounts.isZero(coin.currentAmount)) {
      await putGroupAsFinished(ws, tx, recoupGroup, coinIdx);
      continue;
    }
    recoupGroup.oldAmountPerCoin[coinIdx] = coin.currentAmount;
    coin.currentAmount = Amounts.getZero(coin.currentAmount.currency);
    await tx.coins.put(coin);
  }

  await tx.recoupGroups.put(recoupGroup);

  return recoupGroupId;
}

async function processRecoup(
  ws: InternalWalletState,
  recoupGroupId: string,
  coinIdx: number,
): Promise<void> {
  const coin = await ws.db
    .mktx((x) => ({
      recoupGroups: x.recoupGroups,
      coins: x.coins,
    }))
    .runReadOnly(async (tx) => {
      const recoupGroup = await tx.recoupGroups.get(recoupGroupId);
      if (!recoupGroup) {
        return;
      }
      if (recoupGroup.timestampFinished) {
        return;
      }
      if (recoupGroup.recoupFinishedPerCoin[coinIdx]) {
        return;
      }

      const coinPub = recoupGroup.coinPubs[coinIdx];

      const coin = await tx.coins.get(coinPub);
      if (!coin) {
        throw Error(`Coin ${coinPub} not found, can't request payback`);
      }
      return coin;
    });

  if (!coin) {
    return;
  }

  const cs = coin.coinSource;

  switch (cs.type) {
    case CoinSourceType.Tip:
      return recoupTipCoin(ws, recoupGroupId, coinIdx, coin);
    case CoinSourceType.Refresh:
      return recoupRefreshCoin(ws, recoupGroupId, coinIdx, coin, cs);
    case CoinSourceType.Withdraw:
      return recoupWithdrawCoin(ws, recoupGroupId, coinIdx, coin, cs);
    default:
      throw Error("unknown coin source type");
  }
}
