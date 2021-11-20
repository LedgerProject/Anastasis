/*
 This file is part of GNU Taler
 (C) 2019-2021 Taler Systems SA

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
 * Imports.
 */
import {
  AmountJson,
  Amounts,
  BankWithdrawDetails,
  codecForTalerConfigResponse,
  codecForWithdrawOperationStatusResponse,
  codecForWithdrawResponse,
  compare,
  durationFromSpec,
  ExchangeListItem,
  getDurationRemaining,
  getTimestampNow,
  Logger,
  NotificationType,
  parseWithdrawUri,
  TalerErrorCode,
  TalerErrorDetails,
  Timestamp,
  timestampCmp,
  timestampSubtractDuraction,
  WithdrawResponse,
  URL,
  WithdrawUriInfoResponse,
  VersionMatchResult,
  DenomKeyType,
} from "@gnu-taler/taler-util";
import {
  CoinRecord,
  CoinSourceType,
  CoinStatus,
  DenominationRecord,
  DenominationVerificationStatus,
  DenomSelectionState,
  ExchangeDetailsRecord,
  ExchangeRecord,
  PlanchetRecord,
} from "../db.js";
import { walletCoreDebugFlags } from "../util/debugFlags.js";
import { readSuccessResponseJsonOrThrow } from "../util/http.js";
import { initRetryInfo, updateRetryInfoTimeout } from "../util/retries.js";
import {
  guardOperationException,
  makeErrorDetails,
  OperationFailedError,
} from "../errors.js";
import { InternalWalletState } from "../common.js";
import {
  WALLET_BANK_INTEGRATION_PROTOCOL_VERSION,
  WALLET_EXCHANGE_PROTOCOL_VERSION,
} from "../versions.js";

/**
 * Logger for this file.
 */
const logger = new Logger("withdraw.ts");

/**
 * FIXME: Eliminate this in favor of DenomSelectionState.
 */
interface DenominationSelectionInfo {
  totalCoinValue: AmountJson;
  totalWithdrawCost: AmountJson;
  selectedDenoms: {
    /**
     * How many times do we withdraw this denomination?
     */
    count: number;
    denom: DenominationRecord;
  }[];
}

/**
 * Information about what will happen when creating a reserve.
 *
 * Sent to the wallet frontend to be rendered and shown to the user.
 */
export interface ExchangeWithdrawDetails {
  /**
   * Exchange that the reserve will be created at.
   */
  exchangeInfo: ExchangeRecord;

  exchangeDetails: ExchangeDetailsRecord;

  /**
   * Filtered wire info to send to the bank.
   */
  exchangeWireAccounts: string[];

  /**
   * Selected denominations for withdraw.
   */
  selectedDenoms: DenominationSelectionInfo;

  /**
   * Fees for withdraw.
   */
  withdrawFee: AmountJson;

  /**
   * Remaining balance that is too small to be withdrawn.
   */
  overhead: AmountJson;

  /**
   * Does the wallet know about an auditor for
   * the exchange that the reserve.
   */
  isAudited: boolean;

  /**
   * Did the user already accept the current terms of service for the exchange?
   */
  termsOfServiceAccepted: boolean;

  /**
   * The exchange is trusted directly.
   */
  isTrusted: boolean;

  /**
   * The earliest deposit expiration of the selected coins.
   */
  earliestDepositExpiration: Timestamp;

  /**
   * Number of currently offered denominations.
   */
  numOfferedDenoms: number;

  /**
   * Public keys of trusted auditors for the currency we're withdrawing.
   */
  trustedAuditorPubs: string[];

  /**
   * Result of checking the wallet's version
   * against the exchange's version.
   *
   * Older exchanges don't return version information.
   */
  versionMatch: VersionMatchResult | undefined;

  /**
   * Libtool-style version string for the exchange or "unknown"
   * for older exchanges.
   */
  exchangeVersion: string;

  /**
   * Libtool-style version string for the wallet.
   */
  walletVersion: string;
}

/**
 * Check if a denom is withdrawable based on the expiration time,
 * revocation and offered state.
 */
export function isWithdrawableDenom(d: DenominationRecord): boolean {
  const now = getTimestampNow();
  const started = timestampCmp(now, d.stampStart) >= 0;
  let lastPossibleWithdraw: Timestamp;
  if (walletCoreDebugFlags.denomselAllowLate) {
    lastPossibleWithdraw = d.stampExpireWithdraw;
  } else {
    lastPossibleWithdraw = timestampSubtractDuraction(
      d.stampExpireWithdraw,
      durationFromSpec({ minutes: 5 }),
    );
  }
  const remaining = getDurationRemaining(lastPossibleWithdraw, now);
  const stillOkay = remaining.d_ms !== 0;
  return started && stillOkay && !d.isRevoked && d.isOffered;
}

/**
 * Get a list of denominations (with repetitions possible)
 * whose total value is as close as possible to the available
 * amount, but never larger.
 */
export function selectWithdrawalDenominations(
  amountAvailable: AmountJson,
  denoms: DenominationRecord[],
): DenominationSelectionInfo {
  let remaining = Amounts.copy(amountAvailable);

  const selectedDenoms: {
    count: number;
    denom: DenominationRecord;
  }[] = [];

  let totalCoinValue = Amounts.getZero(amountAvailable.currency);
  let totalWithdrawCost = Amounts.getZero(amountAvailable.currency);

  denoms = denoms.filter(isWithdrawableDenom);
  denoms.sort((d1, d2) => Amounts.cmp(d2.value, d1.value));

  for (const d of denoms) {
    let count = 0;
    const cost = Amounts.add(d.value, d.feeWithdraw).amount;
    for (;;) {
      if (Amounts.cmp(remaining, cost) < 0) {
        break;
      }
      remaining = Amounts.sub(remaining, cost).amount;
      count++;
    }
    if (count > 0) {
      totalCoinValue = Amounts.add(
        totalCoinValue,
        Amounts.mult(d.value, count).amount,
      ).amount;
      totalWithdrawCost = Amounts.add(
        totalWithdrawCost,
        Amounts.mult(cost, count).amount,
      ).amount;
      selectedDenoms.push({
        count,
        denom: d,
      });
    }

    if (Amounts.isZero(remaining)) {
      break;
    }
  }

  if (logger.shouldLogTrace()) {
    logger.trace(
      `selected withdrawal denoms for ${Amounts.stringify(totalCoinValue)}`,
    );
    for (const sd of selectedDenoms) {
      logger.trace(
        `denom_pub_hash=${sd.denom.denomPubHash}, count=${sd.count}`,
      );
    }
    logger.trace("(end of withdrawal denom list)");
  }

  return {
    selectedDenoms,
    totalCoinValue,
    totalWithdrawCost,
  };
}

/**
 * Get information about a withdrawal from
 * a taler://withdraw URI by asking the bank.
 */
export async function getBankWithdrawalInfo(
  ws: InternalWalletState,
  talerWithdrawUri: string,
): Promise<BankWithdrawDetails> {
  const uriResult = parseWithdrawUri(talerWithdrawUri);
  if (!uriResult) {
    throw Error(`can't parse URL ${talerWithdrawUri}`);
  }

  const configReqUrl = new URL("config", uriResult.bankIntegrationApiBaseUrl);

  const configResp = await ws.http.get(configReqUrl.href);
  const config = await readSuccessResponseJsonOrThrow(
    configResp,
    codecForTalerConfigResponse(),
  );

  const versionRes = compare(
    WALLET_BANK_INTEGRATION_PROTOCOL_VERSION,
    config.version,
  );
  if (versionRes?.compatible != true) {
    const opErr = makeErrorDetails(
      TalerErrorCode.WALLET_BANK_INTEGRATION_PROTOCOL_VERSION_INCOMPATIBLE,
      "bank integration protocol version not compatible with wallet",
      {
        exchangeProtocolVersion: config.version,
        walletProtocolVersion: WALLET_BANK_INTEGRATION_PROTOCOL_VERSION,
      },
    );
    throw new OperationFailedError(opErr);
  }

  const reqUrl = new URL(
    `withdrawal-operation/${uriResult.withdrawalOperationId}`,
    uriResult.bankIntegrationApiBaseUrl,
  );
  const resp = await ws.http.get(reqUrl.href);
  const status = await readSuccessResponseJsonOrThrow(
    resp,
    codecForWithdrawOperationStatusResponse(),
  );

  return {
    amount: Amounts.parseOrThrow(status.amount),
    confirmTransferUrl: status.confirm_transfer_url,
    extractedStatusUrl: reqUrl.href,
    selectionDone: status.selection_done,
    senderWire: status.sender_wire,
    suggestedExchange: status.suggested_exchange,
    transferDone: status.transfer_done,
    wireTypes: status.wire_types,
  };
}

/**
 * Return denominations that can potentially used for a withdrawal.
 */
export async function getCandidateWithdrawalDenoms(
  ws: InternalWalletState,
  exchangeBaseUrl: string,
): Promise<DenominationRecord[]> {
  return await ws.db
    .mktx((x) => ({ denominations: x.denominations }))
    .runReadOnly(async (tx) => {
      const allDenoms = await tx.denominations.indexes.byExchangeBaseUrl.getAll(
        exchangeBaseUrl,
      );
      return allDenoms.filter(isWithdrawableDenom);
    });
}

/**
 * Generate a planchet for a coin index in a withdrawal group.
 * Does not actually withdraw the coin yet.
 *
 * Split up so that we can parallelize the crypto, but serialize
 * the exchange requests per reserve.
 */
async function processPlanchetGenerate(
  ws: InternalWalletState,
  withdrawalGroupId: string,
  coinIdx: number,
): Promise<void> {
  const withdrawalGroup = await ws.db
    .mktx((x) => ({ withdrawalGroups: x.withdrawalGroups }))
    .runReadOnly(async (tx) => {
      return await tx.withdrawalGroups.get(withdrawalGroupId);
    });
  if (!withdrawalGroup) {
    return;
  }
  let planchet = await ws.db
    .mktx((x) => ({
      planchets: x.planchets,
    }))
    .runReadOnly(async (tx) => {
      return tx.planchets.indexes.byGroupAndIndex.get([
        withdrawalGroupId,
        coinIdx,
      ]);
    });
  if (!planchet) {
    let ci = 0;
    let denomPubHash: string | undefined;
    for (
      let di = 0;
      di < withdrawalGroup.denomsSel.selectedDenoms.length;
      di++
    ) {
      const d = withdrawalGroup.denomsSel.selectedDenoms[di];
      if (coinIdx >= ci && coinIdx < ci + d.count) {
        denomPubHash = d.denomPubHash;
        break;
      }
      ci += d.count;
    }
    if (!denomPubHash) {
      throw Error("invariant violated");
    }

    const { denom, reserve } = await ws.db
      .mktx((x) => ({
        reserves: x.reserves,
        denominations: x.denominations,
      }))
      .runReadOnly(async (tx) => {
        const denom = await tx.denominations.get([
          withdrawalGroup.exchangeBaseUrl,
          denomPubHash!,
        ]);
        if (!denom) {
          throw Error("invariant violated");
        }
        const reserve = await tx.reserves.get(withdrawalGroup.reservePub);
        if (!reserve) {
          throw Error("invariant violated");
        }
        return { denom, reserve };
      });
    const r = await ws.cryptoApi.createPlanchet({
      denomPub: denom.denomPub,
      feeWithdraw: denom.feeWithdraw,
      reservePriv: reserve.reservePriv,
      reservePub: reserve.reservePub,
      value: denom.value,
      coinIndex: coinIdx,
      secretSeed: withdrawalGroup.secretSeed,
    });
    const newPlanchet: PlanchetRecord = {
      blindingKey: r.blindingKey,
      coinEv: r.coinEv,
      coinEvHash: r.coinEvHash,
      coinIdx,
      coinPriv: r.coinPriv,
      coinPub: r.coinPub,
      coinValue: r.coinValue,
      denomPub: r.denomPub,
      denomPubHash: r.denomPubHash,
      isFromTip: false,
      reservePub: r.reservePub,
      withdrawalDone: false,
      withdrawSig: r.withdrawSig,
      withdrawalGroupId: withdrawalGroupId,
      lastError: undefined,
    };
    await ws.db
      .mktx((x) => ({ planchets: x.planchets }))
      .runReadWrite(async (tx) => {
        const p = await tx.planchets.indexes.byGroupAndIndex.get([
          withdrawalGroupId,
          coinIdx,
        ]);
        if (p) {
          planchet = p;
          return;
        }
        await tx.planchets.put(newPlanchet);
        planchet = newPlanchet;
      });
  }
}

/**
 * Send the withdrawal request for a generated planchet to the exchange.
 *
 * The verification of the response is done asynchronously to enable parallelism.
 */
async function processPlanchetExchangeRequest(
  ws: InternalWalletState,
  withdrawalGroupId: string,
  coinIdx: number,
): Promise<WithdrawResponse | undefined> {
  const d = await ws.db
    .mktx((x) => ({
      withdrawalGroups: x.withdrawalGroups,
      planchets: x.planchets,
      exchanges: x.exchanges,
      denominations: x.denominations,
    }))
    .runReadOnly(async (tx) => {
      const withdrawalGroup = await tx.withdrawalGroups.get(withdrawalGroupId);
      if (!withdrawalGroup) {
        return;
      }
      let planchet = await tx.planchets.indexes.byGroupAndIndex.get([
        withdrawalGroupId,
        coinIdx,
      ]);
      if (!planchet) {
        return;
      }
      if (planchet.withdrawalDone) {
        logger.warn("processPlanchet: planchet already withdrawn");
        return;
      }
      const exchange = await tx.exchanges.get(withdrawalGroup.exchangeBaseUrl);
      if (!exchange) {
        logger.error("db inconsistent: exchange for planchet not found");
        return;
      }

      const denom = await tx.denominations.get([
        withdrawalGroup.exchangeBaseUrl,
        planchet.denomPubHash,
      ]);

      if (!denom) {
        logger.error("db inconsistent: denom for planchet not found");
        return;
      }

      logger.trace(
        `processing planchet #${coinIdx} in withdrawal ${withdrawalGroupId}`,
      );

      const reqBody: any = {
        denom_pub_hash: planchet.denomPubHash,
        reserve_pub: planchet.reservePub,
        reserve_sig: planchet.withdrawSig,
        coin_ev: planchet.coinEv,
      };
      const reqUrl = new URL(
        `reserves/${planchet.reservePub}/withdraw`,
        exchange.baseUrl,
      ).href;

      return { reqUrl, reqBody };
    });

  if (!d) {
    return;
  }
  const { reqUrl, reqBody } = d;

  try {
    const resp = await ws.http.postJson(reqUrl, reqBody);
    const r = await readSuccessResponseJsonOrThrow(
      resp,
      codecForWithdrawResponse(),
    );
    return r;
  } catch (e) {
    logger.trace("withdrawal request failed", e);
    logger.trace(e);
    if (!(e instanceof OperationFailedError)) {
      throw e;
    }
    const errDetails = e.operationError;
    await ws.db
      .mktx((x) => ({ planchets: x.planchets }))
      .runReadWrite(async (tx) => {
        let planchet = await tx.planchets.indexes.byGroupAndIndex.get([
          withdrawalGroupId,
          coinIdx,
        ]);
        if (!planchet) {
          return;
        }
        planchet.lastError = errDetails;
        await tx.planchets.put(planchet);
      });
    return;
  }
}

async function processPlanchetVerifyAndStoreCoin(
  ws: InternalWalletState,
  withdrawalGroupId: string,
  coinIdx: number,
  resp: WithdrawResponse,
): Promise<void> {
  const d = await ws.db
    .mktx((x) => ({
      withdrawalGroups: x.withdrawalGroups,
      planchets: x.planchets,
    }))
    .runReadOnly(async (tx) => {
      const withdrawalGroup = await tx.withdrawalGroups.get(withdrawalGroupId);
      if (!withdrawalGroup) {
        return;
      }
      let planchet = await tx.planchets.indexes.byGroupAndIndex.get([
        withdrawalGroupId,
        coinIdx,
      ]);
      if (!planchet) {
        return;
      }
      if (planchet.withdrawalDone) {
        logger.warn("processPlanchet: planchet already withdrawn");
        return;
      }
      return { planchet, exchangeBaseUrl: withdrawalGroup.exchangeBaseUrl };
    });

  if (!d) {
    return;
  }

  const { planchet, exchangeBaseUrl } = d;

  const planchetDenomPub = planchet.denomPub;
  if (planchetDenomPub.cipher !== DenomKeyType.Rsa) {
    throw Error("cipher not supported");
  }

  const evSig = resp.ev_sig;
  if (evSig.cipher !== DenomKeyType.Rsa) {
    throw Error("unsupported cipher");
  }

  const denomSigRsa = await ws.cryptoApi.rsaUnblind(
    evSig.blinded_rsa_signature,
    planchet.blindingKey,
    planchetDenomPub.rsa_public_key,
  );

  const isValid = await ws.cryptoApi.rsaVerify(
    planchet.coinPub,
    denomSigRsa,
    planchetDenomPub.rsa_public_key,
  );

  if (!isValid) {
    await ws.db
      .mktx((x) => ({ planchets: x.planchets }))
      .runReadWrite(async (tx) => {
        let planchet = await tx.planchets.indexes.byGroupAndIndex.get([
          withdrawalGroupId,
          coinIdx,
        ]);
        if (!planchet) {
          return;
        }
        planchet.lastError = makeErrorDetails(
          TalerErrorCode.WALLET_EXCHANGE_COIN_SIGNATURE_INVALID,
          "invalid signature from the exchange after unblinding",
          {},
        );
        await tx.planchets.put(planchet);
      });
    return;
  }

  const coin: CoinRecord = {
    blindingKey: planchet.blindingKey,
    coinPriv: planchet.coinPriv,
    coinPub: planchet.coinPub,
    currentAmount: planchet.coinValue,
    denomPub: planchet.denomPub,
    denomPubHash: planchet.denomPubHash,
    denomSig: {
      cipher: DenomKeyType.Rsa,
      rsa_signature: denomSigRsa,
    },
    coinEvHash: planchet.coinEvHash,
    exchangeBaseUrl: exchangeBaseUrl,
    status: CoinStatus.Fresh,
    coinSource: {
      type: CoinSourceType.Withdraw,
      coinIndex: coinIdx,
      reservePub: planchet.reservePub,
      withdrawalGroupId: withdrawalGroupId,
    },
    suspended: false,
  };

  const planchetCoinPub = planchet.coinPub;

  const firstSuccess = await ws.db
    .mktx((x) => ({
      coins: x.coins,
      withdrawalGroups: x.withdrawalGroups,
      reserves: x.reserves,
      planchets: x.planchets,
    }))
    .runReadWrite(async (tx) => {
      const ws = await tx.withdrawalGroups.get(withdrawalGroupId);
      if (!ws) {
        return false;
      }
      const p = await tx.planchets.get(planchetCoinPub);
      if (!p || p.withdrawalDone) {
        return false;
      }
      p.withdrawalDone = true;
      await tx.planchets.put(p);
      await tx.coins.add(coin);
      return true;
    });

  if (firstSuccess) {
    ws.notify({
      type: NotificationType.CoinWithdrawn,
    });
  }
}

export function denomSelectionInfoToState(
  dsi: DenominationSelectionInfo,
): DenomSelectionState {
  return {
    selectedDenoms: dsi.selectedDenoms.map((x) => {
      return {
        count: x.count,
        denomPubHash: x.denom.denomPubHash,
      };
    }),
    totalCoinValue: dsi.totalCoinValue,
    totalWithdrawCost: dsi.totalWithdrawCost,
  };
}

/**
 * Make sure that denominations that currently can be used for withdrawal
 * are validated, and the result of validation is stored in the database.
 */
export async function updateWithdrawalDenoms(
  ws: InternalWalletState,
  exchangeBaseUrl: string,
): Promise<void> {
  logger.trace(
    `updating denominations used for withdrawal for ${exchangeBaseUrl}`,
  );
  const exchangeDetails = await ws.db
    .mktx((x) => ({
      exchanges: x.exchanges,
      exchangeDetails: x.exchangeDetails,
    }))
    .runReadOnly(async (tx) => {
      return ws.exchangeOps.getExchangeDetails(tx, exchangeBaseUrl);
    });
  if (!exchangeDetails) {
    logger.error("exchange details not available");
    throw Error(`exchange ${exchangeBaseUrl} details not available`);
  }
  // First do a pass where the validity of candidate denominations
  // is checked and the result is stored in the database.
  logger.trace("getting candidate denominations");
  const denominations = await getCandidateWithdrawalDenoms(ws, exchangeBaseUrl);
  logger.trace(`got ${denominations.length} candidate denominations`);
  const batchSize = 500;
  let current = 0;

  while (current < denominations.length) {
    const updatedDenominations: DenominationRecord[] = [];
    // Do a batch of batchSize
    for (
      let batchIdx = 0;
      batchIdx < batchSize && current < denominations.length;
      batchIdx++, current++
    ) {
      const denom = denominations[current];
      if (
        denom.verificationStatus === DenominationVerificationStatus.Unverified
      ) {
        logger.trace(
          `Validating denomination (${current + 1}/${
            denominations.length
          }) signature of ${denom.denomPubHash}`,
        );
        const valid = await ws.cryptoApi.isValidDenom(
          denom,
          exchangeDetails.masterPublicKey,
        );
        logger.trace(`Done validating ${denom.denomPubHash}`);
        if (!valid) {
          logger.warn(
            `Signature check for denomination h=${denom.denomPubHash} failed`,
          );
          denom.verificationStatus = DenominationVerificationStatus.VerifiedBad;
        } else {
          denom.verificationStatus =
            DenominationVerificationStatus.VerifiedGood;
        }
        updatedDenominations.push(denom);
      }
    }
    if (updatedDenominations.length > 0) {
      logger.trace("writing denomination batch to db");
      await ws.db
        .mktx((x) => ({ denominations: x.denominations }))
        .runReadWrite(async (tx) => {
          for (let i = 0; i < updatedDenominations.length; i++) {
            const denom = updatedDenominations[i];
            await tx.denominations.put(denom);
          }
        });
      logger.trace("done with DB write");
    }
  }
}

async function incrementWithdrawalRetry(
  ws: InternalWalletState,
  withdrawalGroupId: string,
  err: TalerErrorDetails | undefined,
): Promise<void> {
  await ws.db
    .mktx((x) => ({ withdrawalGroups: x.withdrawalGroups }))
    .runReadWrite(async (tx) => {
      const wsr = await tx.withdrawalGroups.get(withdrawalGroupId);
      if (!wsr) {
        return;
      }
      wsr.retryInfo.retryCounter++;
      updateRetryInfoTimeout(wsr.retryInfo);
      wsr.lastError = err;
      await tx.withdrawalGroups.put(wsr);
    });
  if (err) {
    ws.notify({ type: NotificationType.WithdrawOperationError, error: err });
  }
}

export async function processWithdrawGroup(
  ws: InternalWalletState,
  withdrawalGroupId: string,
  forceNow = false,
): Promise<void> {
  const onOpErr = (e: TalerErrorDetails): Promise<void> =>
    incrementWithdrawalRetry(ws, withdrawalGroupId, e);
  await guardOperationException(
    () => processWithdrawGroupImpl(ws, withdrawalGroupId, forceNow),
    onOpErr,
  );
}

async function resetWithdrawalGroupRetry(
  ws: InternalWalletState,
  withdrawalGroupId: string,
): Promise<void> {
  await ws.db
    .mktx((x) => ({ withdrawalGroups: x.withdrawalGroups }))
    .runReadWrite(async (tx) => {
      const x = await tx.withdrawalGroups.get(withdrawalGroupId);
      if (x) {
        x.retryInfo = initRetryInfo();
        await tx.withdrawalGroups.put(x);
      }
    });
}

async function processWithdrawGroupImpl(
  ws: InternalWalletState,
  withdrawalGroupId: string,
  forceNow: boolean,
): Promise<void> {
  logger.trace("processing withdraw group", withdrawalGroupId);
  if (forceNow) {
    await resetWithdrawalGroupRetry(ws, withdrawalGroupId);
  }
  const withdrawalGroup = await ws.db
    .mktx((x) => ({ withdrawalGroups: x.withdrawalGroups }))
    .runReadOnly(async (tx) => {
      return tx.withdrawalGroups.get(withdrawalGroupId);
    });
  if (!withdrawalGroup) {
    logger.trace("withdraw session doesn't exist");
    return;
  }

  await ws.exchangeOps.updateExchangeFromUrl(
    ws,
    withdrawalGroup.exchangeBaseUrl,
  );

  const numTotalCoins = withdrawalGroup.denomsSel.selectedDenoms
    .map((x) => x.count)
    .reduce((a, b) => a + b);

  let work: Promise<void>[] = [];

  for (let i = 0; i < numTotalCoins; i++) {
    work.push(processPlanchetGenerate(ws, withdrawalGroupId, i));
  }

  // Generate coins concurrently (parallelism only happens in the crypto API workers)
  await Promise.all(work);

  work = [];

  for (let coinIdx = 0; coinIdx < numTotalCoins; coinIdx++) {
    const resp = await processPlanchetExchangeRequest(
      ws,
      withdrawalGroupId,
      coinIdx,
    );
    if (!resp) {
      continue;
    }
    work.push(
      processPlanchetVerifyAndStoreCoin(ws, withdrawalGroupId, coinIdx, resp),
    );
  }

  await Promise.all(work);

  let numFinished = 0;
  let finishedForFirstTime = false;
  let errorsPerCoin: Record<number, TalerErrorDetails> = {};

  await ws.db
    .mktx((x) => ({
      coins: x.coins,
      withdrawalGroups: x.withdrawalGroups,
      reserves: x.reserves,
      planchets: x.planchets,
    }))
    .runReadWrite(async (tx) => {
      const wg = await tx.withdrawalGroups.get(withdrawalGroupId);
      if (!wg) {
        return;
      }

      await tx.planchets.indexes.byGroup
        .iter(withdrawalGroupId)
        .forEach((x) => {
          if (x.withdrawalDone) {
            numFinished++;
          }
          if (x.lastError) {
            errorsPerCoin[x.coinIdx] = x.lastError;
          }
        });
      logger.trace(`now withdrawn ${numFinished} of ${numTotalCoins} coins`);
      if (wg.timestampFinish === undefined && numFinished === numTotalCoins) {
        finishedForFirstTime = true;
        wg.timestampFinish = getTimestampNow();
        wg.lastError = undefined;
        wg.retryInfo = initRetryInfo();
      }

      await tx.withdrawalGroups.put(wg);
    });

  if (numFinished != numTotalCoins) {
    throw OperationFailedError.fromCode(
      TalerErrorCode.WALLET_WITHDRAWAL_GROUP_INCOMPLETE,
      `withdrawal did not finish (${numFinished} / ${numTotalCoins} coins withdrawn)`,
      {
        errorsPerCoin,
      },
    );
  }

  if (finishedForFirstTime) {
    ws.notify({
      type: NotificationType.WithdrawGroupFinished,
      reservePub: withdrawalGroup.reservePub,
    });
  }
}

export async function getExchangeWithdrawalInfo(
  ws: InternalWalletState,
  baseUrl: string,
  amount: AmountJson,
): Promise<ExchangeWithdrawDetails> {
  const {
    exchange,
    exchangeDetails,
  } = await ws.exchangeOps.updateExchangeFromUrl(ws, baseUrl);
  await updateWithdrawalDenoms(ws, baseUrl);
  const denoms = await getCandidateWithdrawalDenoms(ws, baseUrl);
  const selectedDenoms = selectWithdrawalDenominations(amount, denoms);
  const exchangeWireAccounts: string[] = [];
  for (const account of exchangeDetails.wireInfo.accounts) {
    exchangeWireAccounts.push(account.payto_uri);
  }

  const { isTrusted, isAudited } = await ws.exchangeOps.getExchangeTrust(
    ws,
    exchange,
  );

  let earliestDepositExpiration =
    selectedDenoms.selectedDenoms[0].denom.stampExpireDeposit;
  for (let i = 1; i < selectedDenoms.selectedDenoms.length; i++) {
    const expireDeposit =
      selectedDenoms.selectedDenoms[i].denom.stampExpireDeposit;
    if (expireDeposit.t_ms < earliestDepositExpiration.t_ms) {
      earliestDepositExpiration = expireDeposit;
    }
  }

  const possibleDenoms = await ws.db
    .mktx((x) => ({ denominations: x.denominations }))
    .runReadOnly(async (tx) => {
      return tx.denominations.indexes.byExchangeBaseUrl
        .iter()
        .filter((d) => d.isOffered);
    });

  let versionMatch;
  if (exchangeDetails.protocolVersion) {
    versionMatch = compare(
      WALLET_EXCHANGE_PROTOCOL_VERSION,
      exchangeDetails.protocolVersion,
    );

    if (
      versionMatch &&
      !versionMatch.compatible &&
      versionMatch.currentCmp === -1
    ) {
      console.warn(
        `wallet's support for exchange protocol version ${WALLET_EXCHANGE_PROTOCOL_VERSION} might be outdated ` +
          `(exchange has ${exchangeDetails.protocolVersion}), checking for updates`,
      );
    }
  }

  let tosAccepted = false;

  if (exchangeDetails.termsOfServiceLastEtag) {
    if (
      exchangeDetails.termsOfServiceAcceptedEtag ===
      exchangeDetails.termsOfServiceLastEtag
    ) {
      tosAccepted = true;
    }
  }

  const withdrawFee = Amounts.sub(
    selectedDenoms.totalWithdrawCost,
    selectedDenoms.totalCoinValue,
  ).amount;

  const ret: ExchangeWithdrawDetails = {
    earliestDepositExpiration,
    exchangeInfo: exchange,
    exchangeDetails,
    exchangeWireAccounts,
    exchangeVersion: exchangeDetails.protocolVersion || "unknown",
    isAudited,
    isTrusted,
    numOfferedDenoms: possibleDenoms.length,
    overhead: Amounts.sub(amount, selectedDenoms.totalWithdrawCost).amount,
    selectedDenoms,
    // FIXME: delete this field / replace by something we can display to the user
    trustedAuditorPubs: [],
    versionMatch,
    walletVersion: WALLET_EXCHANGE_PROTOCOL_VERSION,
    withdrawFee,
    termsOfServiceAccepted: tosAccepted,
  };
  return ret;
}

export async function getWithdrawalDetailsForUri(
  ws: InternalWalletState,
  talerWithdrawUri: string,
): Promise<WithdrawUriInfoResponse> {
  logger.trace(`getting withdrawal details for URI ${talerWithdrawUri}`);
  const info = await getBankWithdrawalInfo(ws, talerWithdrawUri);
  logger.trace(`got bank info`);
  if (info.suggestedExchange) {
    // FIXME: right now the exchange gets permanently added,
    // we might want to only temporarily add it.
    try {
      await ws.exchangeOps.updateExchangeFromUrl(ws, info.suggestedExchange);
    } catch (e) {
      // We still continued if it failed, as other exchanges might be available.
      // We don't want to fail if the bank-suggested exchange is broken/offline.
      logger.trace(
        `querying bank-suggested exchange (${info.suggestedExchange}) failed`,
      );
    }
  }

  const exchanges: ExchangeListItem[] = [];

  await ws.db
    .mktx((x) => ({
      exchanges: x.exchanges,
      exchangeDetails: x.exchangeDetails,
    }))
    .runReadOnly(async (tx) => {
      const exchangeRecords = await tx.exchanges.iter().toArray();
      for (const r of exchangeRecords) {
        const details = await ws.exchangeOps.getExchangeDetails(tx, r.baseUrl);
        if (details) {
          exchanges.push({
            exchangeBaseUrl: details.exchangeBaseUrl,
            currency: details.currency,
            paytoUris: details.wireInfo.accounts.map((x) => x.payto_uri),
          });
        }
      }
    });

  return {
    amount: Amounts.stringify(info.amount),
    defaultExchangeBaseUrl: info.suggestedExchange,
    possibleExchanges: exchanges,
  };
}
