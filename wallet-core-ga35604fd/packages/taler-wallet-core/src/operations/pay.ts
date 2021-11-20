/*
 This file is part of GNU Taler
 (C) 2019 Taler Systems S.A.

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
 * Implementation of the payment operation, including downloading and
 * claiming of proposals.
 *
 * @author Florian Dold
 */

/**
 * Imports.
 */
import {
  AmountJson,
  Amounts,
  timestampIsBetween,
  getTimestampNow,
  isTimestampExpired,
  Timestamp,
  RefreshReason,
  CoinDepositPermission,
  NotificationType,
  TalerErrorDetails,
  Duration,
  durationMax,
  durationMin,
  durationMul,
  ContractTerms,
  codecForProposal,
  TalerErrorCode,
  codecForContractTerms,
  timestampAddDuration,
  ConfirmPayResult,
  ConfirmPayResultType,
  codecForMerchantPayResponse,
  PreparePayResult,
  PreparePayResultType,
  parsePayUri,
  Logger,
  URL,
  getDurationRemaining,
  HttpStatusCode,
} from "@gnu-taler/taler-util";
import { encodeCrock, getRandomBytes } from "@gnu-taler/taler-util";
import {
  PayCoinSelection,
  CoinCandidateSelection,
  AvailableCoinInfo,
  selectPayCoins,
  PreviousPayCoins,
} from "../util/coinSelection.js";
import { j2s } from "@gnu-taler/taler-util";
import {
  initRetryInfo,
  updateRetryInfoTimeout,
  getRetryDuration,
} from "../util/retries.js";
import { getTotalRefreshCost, createRefreshGroup } from "./refresh.js";
import { InternalWalletState, EXCHANGE_COINS_LOCK } from "../common.js";
import { ContractTermsUtil } from "../util/contractTerms.js";
import { getExchangeDetails } from "./exchanges.js";
import { GetReadWriteAccess } from "../util/query.js";
import {
  AbortStatus,
  AllowedAuditorInfo,
  AllowedExchangeInfo,
  BackupProviderStateTag,
  CoinRecord,
  CoinStatus,
  DenominationRecord,
  ProposalRecord,
  ProposalStatus,
  PurchaseRecord,
  WalletContractData,
  WalletStoresV1,
} from "../db.js";
import {
  getHttpResponseErrorDetails,
  readSuccessResponseJsonOrErrorCode,
  readSuccessResponseJsonOrThrow,
  readTalerErrorResponse,
  readUnexpectedResponseDetails,
  throwUnexpectedRequestError,
} from "../util/http.js";
import {
  guardOperationException,
  makeErrorDetails,
  OperationFailedAndReportedError,
  OperationFailedError,
} from "../errors.js";

/**
 * Logger.
 */
const logger = new Logger("pay.ts");

/**
 * Compute the total cost of a payment to the customer.
 *
 * This includes the amount taken by the merchant, fees (wire/deposit) contributed
 * by the customer, refreshing fees, fees for withdraw-after-refresh and "trimmings"
 * of coins that are too small to spend.
 */
export async function getTotalPaymentCost(
  ws: InternalWalletState,
  pcs: PayCoinSelection,
): Promise<AmountJson> {
  return ws.db
    .mktx((x) => ({ coins: x.coins, denominations: x.denominations }))
    .runReadOnly(async (tx) => {
      const costs = [];
      for (let i = 0; i < pcs.coinPubs.length; i++) {
        const coin = await tx.coins.get(pcs.coinPubs[i]);
        if (!coin) {
          throw Error("can't calculate payment cost, coin not found");
        }
        const denom = await tx.denominations.get([
          coin.exchangeBaseUrl,
          coin.denomPubHash,
        ]);
        if (!denom) {
          throw Error(
            "can't calculate payment cost, denomination for coin not found",
          );
        }
        const allDenoms = await tx.denominations.indexes.byExchangeBaseUrl
          .iter()
          .toArray();
        const amountLeft = Amounts.sub(denom.value, pcs.coinContributions[i])
          .amount;
        const refreshCost = getTotalRefreshCost(allDenoms, denom, amountLeft);
        costs.push(pcs.coinContributions[i]);
        costs.push(refreshCost);
      }
      const zero = Amounts.getZero(pcs.paymentAmount.currency);
      return Amounts.sum([zero, ...costs]).amount;
    });
}

/**
 * Get the amount that will be deposited on the merchant's bank
 * account, not considering aggregation.
 */
export async function getEffectiveDepositAmount(
  ws: InternalWalletState,
  wireType: string,
  pcs: PayCoinSelection,
): Promise<AmountJson> {
  const amt: AmountJson[] = [];
  const fees: AmountJson[] = [];
  const exchangeSet: Set<string> = new Set();

  await ws.db
    .mktx((x) => ({
      coins: x.coins,
      denominations: x.denominations,
      exchanges: x.exchanges,
      exchangeDetails: x.exchangeDetails,
    }))
    .runReadOnly(async (tx) => {
      for (let i = 0; i < pcs.coinPubs.length; i++) {
        const coin = await tx.coins.get(pcs.coinPubs[i]);
        if (!coin) {
          throw Error("can't calculate deposit amount, coin not found");
        }
        const denom = await tx.denominations.get([
          coin.exchangeBaseUrl,
          coin.denomPubHash,
        ]);
        if (!denom) {
          throw Error("can't find denomination to calculate deposit amount");
        }
        amt.push(pcs.coinContributions[i]);
        fees.push(denom.feeDeposit);
        exchangeSet.add(coin.exchangeBaseUrl);
      }
      for (const exchangeUrl of exchangeSet.values()) {
        const exchangeDetails = await getExchangeDetails(tx, exchangeUrl);
        if (!exchangeDetails) {
          continue;
        }
	// FIXME/NOTE: the line below _likely_ throws exception
	// about "find method not found on undefined" when the wireType
	// is not supported by the Exchange.
        const fee = exchangeDetails.wireInfo.feesForType[wireType].find((x) => {
          return timestampIsBetween(
            getTimestampNow(),
            x.startStamp,
            x.endStamp,
          );
        })?.wireFee;
        if (fee) {
          fees.push(fee);
        }
      }
    });
  return Amounts.sub(Amounts.sum(amt).amount, Amounts.sum(fees).amount).amount;
}

function isSpendableCoin(coin: CoinRecord, denom: DenominationRecord): boolean {
  if (coin.suspended) {
    return false;
  }
  if (denom.isRevoked) {
    return false;
  }
  if (!denom.isOffered) {
    return false;
  }
  if (coin.status !== CoinStatus.Fresh) {
    return false;
  }
  if (isTimestampExpired(denom.stampExpireDeposit)) {
    return false;
  }
  return true;
}

export interface CoinSelectionRequest {
  amount: AmountJson;

  allowedAuditors: AllowedAuditorInfo[];
  allowedExchanges: AllowedExchangeInfo[];

  /**
   * Timestamp of the contract.
   */
  timestamp: Timestamp;

  wireMethod: string;

  wireFeeAmortization: number;

  maxWireFee: AmountJson;

  maxDepositFee: AmountJson;
}

/**
 * Get candidate coins.  From these candidate coins,
 * the actual contributions will be computed later.
 *
 * The resulting candidate coin list is sorted deterministically.
 *
 * TODO: Exclude more coins:
 * - when we already have a coin with more remaining amount than
 *   the payment amount, coins with even higher amounts can be skipped.
 */
export async function getCandidatePayCoins(
  ws: InternalWalletState,
  req: CoinSelectionRequest,
): Promise<CoinCandidateSelection> {
  const candidateCoins: AvailableCoinInfo[] = [];
  const wireFeesPerExchange: Record<string, AmountJson> = {};

  await ws.db
    .mktx((x) => ({
      exchanges: x.exchanges,
      exchangeDetails: x.exchangeDetails,
      denominations: x.denominations,
      coins: x.coins,
    }))
    .runReadOnly(async (tx) => {
      const exchanges = await tx.exchanges.iter().toArray();
      for (const exchange of exchanges) {
        let isOkay = false;
        const exchangeDetails = await getExchangeDetails(tx, exchange.baseUrl);
        if (!exchangeDetails) {
          continue;
        }
        const exchangeFees = exchangeDetails.wireInfo;
        if (!exchangeFees) {
          continue;
        }

        // is the exchange explicitly allowed?
        for (const allowedExchange of req.allowedExchanges) {
          if (allowedExchange.exchangePub === exchangeDetails.masterPublicKey) {
            isOkay = true;
            break;
          }
        }

        // is the exchange allowed because of one of its auditors?
        if (!isOkay) {
          for (const allowedAuditor of req.allowedAuditors) {
            for (const auditor of exchangeDetails.auditors) {
              if (auditor.auditor_pub === allowedAuditor.auditorPub) {
                isOkay = true;
                break;
              }
            }
            if (isOkay) {
              break;
            }
          }
        }

        if (!isOkay) {
          continue;
        }

        const coins = await tx.coins.indexes.byBaseUrl
          .iter(exchange.baseUrl)
          .toArray();

        if (!coins || coins.length === 0) {
          continue;
        }

        // Denomination of the first coin, we assume that all other
        // coins have the same currency
        const firstDenom = await tx.denominations.get([
          exchange.baseUrl,
          coins[0].denomPubHash,
        ]);
        if (!firstDenom) {
          throw Error("db inconsistent");
        }
        const currency = firstDenom.value.currency;
        for (const coin of coins) {
          const denom = await tx.denominations.get([
            exchange.baseUrl,
            coin.denomPubHash,
          ]);
          if (!denom) {
            throw Error("db inconsistent");
          }
          if (denom.value.currency !== currency) {
            logger.warn(
              `same pubkey for different currencies at exchange ${exchange.baseUrl}`,
            );
            continue;
          }
          if (!isSpendableCoin(coin, denom)) {
            continue;
          }
          candidateCoins.push({
            availableAmount: coin.currentAmount,
            coinPub: coin.coinPub,
            denomPub: coin.denomPub,
            feeDeposit: denom.feeDeposit,
            exchangeBaseUrl: denom.exchangeBaseUrl,
          });
        }

        let wireFee: AmountJson | undefined;
        for (const fee of exchangeFees.feesForType[req.wireMethod] || []) {
          if (
            fee.startStamp <= req.timestamp &&
            fee.endStamp >= req.timestamp
          ) {
            wireFee = fee.wireFee;
            break;
          }
        }
        if (wireFee) {
          wireFeesPerExchange[exchange.baseUrl] = wireFee;
        }
      }
    });

  return {
    candidateCoins,
    wireFeesPerExchange,
  };
}

/**
 * Apply a coin selection to the database.  Marks coins as spent
 * and creates a refresh session for the remaining amount.
 *
 * FIXME:  This does not deal well with conflicting spends!
 * When two payments are made in parallel, the same coin can be selected
 * for two payments.
 * However, this is a situation that can also happen via sync.
 */
export async function applyCoinSpend(
  ws: InternalWalletState,
  tx: GetReadWriteAccess<{
    coins: typeof WalletStoresV1.coins;
    refreshGroups: typeof WalletStoresV1.refreshGroups;
    denominations: typeof WalletStoresV1.denominations;
  }>,
  coinSelection: PayCoinSelection,
  allocationId: string,
) {
  for (let i = 0; i < coinSelection.coinPubs.length; i++) {
    const coin = await tx.coins.get(coinSelection.coinPubs[i]);
    if (!coin) {
      throw Error("coin allocated for payment doesn't exist anymore");
    }
    const contrib = coinSelection.coinContributions[i];
    if (coin.status !== CoinStatus.Fresh) {
      const alloc = coin.allocation;
      if (!alloc) {
        continue;
      }
      if (alloc.id !== allocationId) {
        // FIXME: assign error code
        throw Error("conflicting coin allocation (id)");
      }
      if (0 !== Amounts.cmp(alloc.amount, contrib)) {
        // FIXME: assign error code
        throw Error("conflicting coin allocation (contrib)");
      }
      continue;
    }
    coin.status = CoinStatus.Dormant;
    coin.allocation = {
      id: allocationId,
      amount: Amounts.stringify(contrib),
    };
    const remaining = Amounts.sub(coin.currentAmount, contrib);
    if (remaining.saturated) {
      throw Error("not enough remaining balance on coin for payment");
    }
    coin.currentAmount = remaining.amount;
    await tx.coins.put(coin);
  }
  const refreshCoinPubs = coinSelection.coinPubs.map((x) => ({
    coinPub: x,
  }));
  await createRefreshGroup(ws, tx, refreshCoinPubs, RefreshReason.Pay);
}

/**
 * Record all information that is necessary to
 * pay for a proposal in the wallet's database.
 */
async function recordConfirmPay(
  ws: InternalWalletState,
  proposal: ProposalRecord,
  coinSelection: PayCoinSelection,
  coinDepositPermissions: CoinDepositPermission[],
  sessionIdOverride: string | undefined,
): Promise<PurchaseRecord> {
  const d = proposal.download;
  if (!d) {
    throw Error("proposal is in invalid state");
  }
  let sessionId;
  if (sessionIdOverride) {
    sessionId = sessionIdOverride;
  } else {
    sessionId = proposal.downloadSessionId;
  }
  logger.trace(
    `recording payment on ${proposal.orderId} with session ID ${sessionId}`,
  );
  const payCostInfo = await getTotalPaymentCost(ws, coinSelection);
  const t: PurchaseRecord = {
    abortStatus: AbortStatus.None,
    download: d,
    lastSessionId: sessionId,
    payCoinSelection: coinSelection,
    payCoinSelectionUid: encodeCrock(getRandomBytes(32)),
    totalPayCost: payCostInfo,
    coinDepositPermissions,
    timestampAccept: getTimestampNow(),
    timestampLastRefundStatus: undefined,
    proposalId: proposal.proposalId,
    lastPayError: undefined,
    lastRefundStatusError: undefined,
    payRetryInfo: initRetryInfo(),
    refundStatusRetryInfo: initRetryInfo(),
    refundQueryRequested: false,
    timestampFirstSuccessfulPay: undefined,
    autoRefundDeadline: undefined,
    paymentSubmitPending: true,
    refunds: {},
    merchantPaySig: undefined,
    noncePriv: proposal.noncePriv,
    noncePub: proposal.noncePub,
  };

  await ws.db
    .mktx((x) => ({
      proposals: x.proposals,
      purchases: x.purchases,
      coins: x.coins,
      refreshGroups: x.refreshGroups,
      denominations: x.denominations,
    }))
    .runReadWrite(async (tx) => {
      const p = await tx.proposals.get(proposal.proposalId);
      if (p) {
        p.proposalStatus = ProposalStatus.ACCEPTED;
        delete p.lastError;
        p.retryInfo = initRetryInfo();
        await tx.proposals.put(p);
      }
      await tx.purchases.put(t);
      await applyCoinSpend(ws, tx, coinSelection, `proposal:${t.proposalId}`);
    });

  ws.notify({
    type: NotificationType.ProposalAccepted,
    proposalId: proposal.proposalId,
  });
  return t;
}

async function incrementProposalRetry(
  ws: InternalWalletState,
  proposalId: string,
  err: TalerErrorDetails | undefined,
): Promise<void> {
  await ws.db
    .mktx((x) => ({ proposals: x.proposals }))
    .runReadWrite(async (tx) => {
      const pr = await tx.proposals.get(proposalId);
      if (!pr) {
        return;
      }
      if (!pr.retryInfo) {
        return;
      }
      pr.retryInfo.retryCounter++;
      updateRetryInfoTimeout(pr.retryInfo);
      pr.lastError = err;
      await tx.proposals.put(pr);
    });
  if (err) {
    ws.notify({ type: NotificationType.ProposalOperationError, error: err });
  }
}

async function incrementPurchasePayRetry(
  ws: InternalWalletState,
  proposalId: string,
  err: TalerErrorDetails | undefined,
): Promise<void> {
  logger.warn("incrementing purchase pay retry with error", err);
  await ws.db
    .mktx((x) => ({ purchases: x.purchases }))
    .runReadWrite(async (tx) => {
      const pr = await tx.purchases.get(proposalId);
      if (!pr) {
        return;
      }
      if (!pr.payRetryInfo) {
        pr.payRetryInfo = initRetryInfo();
      }
      pr.payRetryInfo.retryCounter++;
      updateRetryInfoTimeout(pr.payRetryInfo);
      logger.trace(
        `retrying pay in ${
          getDurationRemaining(pr.payRetryInfo.nextRetry).d_ms
        } ms`,
      );
      pr.lastPayError = err;
      await tx.purchases.put(pr);
    });
  if (err) {
    ws.notify({ type: NotificationType.PayOperationError, error: err });
  }
}

export async function processDownloadProposal(
  ws: InternalWalletState,
  proposalId: string,
  forceNow = false,
): Promise<void> {
  const onOpErr = (err: TalerErrorDetails): Promise<void> =>
    incrementProposalRetry(ws, proposalId, err);
  await guardOperationException(
    () => processDownloadProposalImpl(ws, proposalId, forceNow),
    onOpErr,
  );
}

async function resetDownloadProposalRetry(
  ws: InternalWalletState,
  proposalId: string,
): Promise<void> {
  await ws.db
    .mktx((x) => ({ proposals: x.proposals }))
    .runReadWrite(async (tx) => {
      const p = await tx.proposals.get(proposalId);
      if (p) {
        delete p.retryInfo;
        await tx.proposals.put(p);
      }
    });
}

async function failProposalPermanently(
  ws: InternalWalletState,
  proposalId: string,
  err: TalerErrorDetails,
): Promise<void> {
  await ws.db
    .mktx((x) => ({ proposals: x.proposals }))
    .runReadWrite(async (tx) => {
      const p = await tx.proposals.get(proposalId);
      if (!p) {
        return;
      }
      delete p.retryInfo;
      p.lastError = err;
      p.proposalStatus = ProposalStatus.PERMANENTLY_FAILED;
      await tx.proposals.put(p);
    });
}

function getProposalRequestTimeout(proposal: ProposalRecord): Duration {
  return durationMax(
    { d_ms: 60000 },
    durationMin({ d_ms: 5000 }, getRetryDuration(proposal.retryInfo)),
  );
}

function getPayRequestTimeout(purchase: PurchaseRecord): Duration {
  return durationMul(
    { d_ms: 15000 },
    1 + purchase.payCoinSelection.coinPubs.length / 5,
  );
}

export function extractContractData(
  parsedContractTerms: ContractTerms,
  contractTermsHash: string,
  merchantSig: string,
): WalletContractData {
  const amount = Amounts.parseOrThrow(parsedContractTerms.amount);
  let maxWireFee: AmountJson;
  if (parsedContractTerms.max_wire_fee) {
    maxWireFee = Amounts.parseOrThrow(parsedContractTerms.max_wire_fee);
  } else {
    maxWireFee = Amounts.getZero(amount.currency);
  }
  return {
    amount,
    contractTermsHash: contractTermsHash,
    fulfillmentUrl: parsedContractTerms.fulfillment_url ?? "",
    merchantBaseUrl: parsedContractTerms.merchant_base_url,
    merchantPub: parsedContractTerms.merchant_pub,
    merchantSig,
    orderId: parsedContractTerms.order_id,
    summary: parsedContractTerms.summary,
    autoRefund: parsedContractTerms.auto_refund,
    maxWireFee,
    payDeadline: parsedContractTerms.pay_deadline,
    refundDeadline: parsedContractTerms.refund_deadline,
    wireFeeAmortization: parsedContractTerms.wire_fee_amortization || 1,
    allowedAuditors: parsedContractTerms.auditors.map((x) => ({
      auditorBaseUrl: x.url,
      auditorPub: x.auditor_pub,
    })),
    allowedExchanges: parsedContractTerms.exchanges.map((x) => ({
      exchangeBaseUrl: x.url,
      exchangePub: x.master_pub,
    })),
    timestamp: parsedContractTerms.timestamp,
    wireMethod: parsedContractTerms.wire_method,
    wireInfoHash: parsedContractTerms.h_wire,
    maxDepositFee: Amounts.parseOrThrow(parsedContractTerms.max_fee),
    merchant: parsedContractTerms.merchant,
    products: parsedContractTerms.products,
    summaryI18n: parsedContractTerms.summary_i18n,
  };
}

async function processDownloadProposalImpl(
  ws: InternalWalletState,
  proposalId: string,
  forceNow: boolean,
): Promise<void> {
  if (forceNow) {
    await resetDownloadProposalRetry(ws, proposalId);
  }
  const proposal = await ws.db
    .mktx((x) => ({ proposals: x.proposals }))
    .runReadOnly(async (tx) => {
      return tx.proposals.get(proposalId);
    });
  if (!proposal) {
    return;
  }
  if (proposal.proposalStatus != ProposalStatus.DOWNLOADING) {
    return;
  }

  const orderClaimUrl = new URL(
    `orders/${proposal.orderId}/claim`,
    proposal.merchantBaseUrl,
  ).href;
  logger.trace("downloading contract from '" + orderClaimUrl + "'");

  const requestBody: {
    nonce: string;
    token?: string;
  } = {
    nonce: proposal.noncePub,
  };
  if (proposal.claimToken) {
    requestBody.token = proposal.claimToken;
  }

  const httpResponse = await ws.http.postJson(orderClaimUrl, requestBody, {
    timeout: getProposalRequestTimeout(proposal),
  });
  const r = await readSuccessResponseJsonOrErrorCode(
    httpResponse,
    codecForProposal(),
  );
  if (r.isError) {
    switch (r.talerErrorResponse.code) {
      case TalerErrorCode.MERCHANT_POST_ORDERS_ID_CLAIM_ALREADY_CLAIMED:
        throw OperationFailedError.fromCode(
          TalerErrorCode.WALLET_ORDER_ALREADY_CLAIMED,
          "order already claimed (likely by other wallet)",
          {
            orderId: proposal.orderId,
            claimUrl: orderClaimUrl,
          },
        );
      default:
        throwUnexpectedRequestError(httpResponse, r.talerErrorResponse);
    }
  }
  const proposalResp = r.response;

  // The proposalResp contains the contract terms as raw JSON,
  // as the coded to parse them doesn't necessarily round-trip.
  // We need this raw JSON to compute the contract terms hash.

  // FIXME: Do better error handling, check if the
  // contract terms have all their forgettable information still
  // present.  The wallet should never accept contract terms
  // with missing information from the merchant.

  const isWellFormed = ContractTermsUtil.validateForgettable(
    proposalResp.contract_terms,
  );

  if (!isWellFormed) {
    logger.trace(
      `malformed contract terms: ${j2s(proposalResp.contract_terms)}`,
    );
    const err = makeErrorDetails(
      TalerErrorCode.WALLET_CONTRACT_TERMS_MALFORMED,
      "validation for well-formedness failed",
      {},
    );
    await failProposalPermanently(ws, proposalId, err);
    throw new OperationFailedAndReportedError(err);
  }

  const contractTermsHash = ContractTermsUtil.hashContractTerms(
    proposalResp.contract_terms,
  );

  logger.info(`Contract terms hash: ${contractTermsHash}`);

  let parsedContractTerms: ContractTerms;

  try {
    parsedContractTerms = codecForContractTerms().decode(
      proposalResp.contract_terms,
    );
  } catch (e) {
    const err = makeErrorDetails(
      TalerErrorCode.WALLET_CONTRACT_TERMS_MALFORMED,
      "schema validation failed",
      {},
    );
    await failProposalPermanently(ws, proposalId, err);
    throw new OperationFailedAndReportedError(err);
  }

  const sigValid = await ws.cryptoApi.isValidContractTermsSignature(
    contractTermsHash,
    proposalResp.sig,
    parsedContractTerms.merchant_pub,
  );

  if (!sigValid) {
    const err = makeErrorDetails(
      TalerErrorCode.WALLET_CONTRACT_TERMS_SIGNATURE_INVALID,
      "merchant's signature on contract terms is invalid",
      {
        merchantPub: parsedContractTerms.merchant_pub,
        orderId: parsedContractTerms.order_id,
      },
    );
    await failProposalPermanently(ws, proposalId, err);
    throw new OperationFailedAndReportedError(err);
  }

  const fulfillmentUrl = parsedContractTerms.fulfillment_url;

  const baseUrlForDownload = proposal.merchantBaseUrl;
  const baseUrlFromContractTerms = parsedContractTerms.merchant_base_url;

  if (baseUrlForDownload !== baseUrlFromContractTerms) {
    const err = makeErrorDetails(
      TalerErrorCode.WALLET_CONTRACT_TERMS_BASE_URL_MISMATCH,
      "merchant base URL mismatch",
      {
        baseUrlForDownload,
        baseUrlFromContractTerms,
      },
    );
    await failProposalPermanently(ws, proposalId, err);
    throw new OperationFailedAndReportedError(err);
  }

  const contractData = extractContractData(
    parsedContractTerms,
    contractTermsHash,
    proposalResp.sig,
  );

  await ws.db
    .mktx((x) => ({ proposals: x.proposals, purchases: x.purchases }))
    .runReadWrite(async (tx) => {
      const p = await tx.proposals.get(proposalId);
      if (!p) {
        return;
      }
      if (p.proposalStatus !== ProposalStatus.DOWNLOADING) {
        return;
      }
      p.download = {
        contractData,
        contractTermsRaw: proposalResp.contract_terms,
      };
      if (
        fulfillmentUrl &&
        (fulfillmentUrl.startsWith("http://") ||
          fulfillmentUrl.startsWith("https://"))
      ) {
        const differentPurchase = await tx.purchases.indexes.byFulfillmentUrl.get(
          fulfillmentUrl,
        );
        if (differentPurchase) {
          logger.warn("repurchase detected");
          p.proposalStatus = ProposalStatus.REPURCHASE;
          p.repurchaseProposalId = differentPurchase.proposalId;
          await tx.proposals.put(p);
          return;
        }
      }
      p.proposalStatus = ProposalStatus.PROPOSED;
      await tx.proposals.put(p);
    });

  ws.notify({
    type: NotificationType.ProposalDownloaded,
    proposalId: proposal.proposalId,
  });
}

/**
 * Download a proposal and store it in the database.
 * Returns an id for it to retrieve it later.
 *
 * @param sessionId Current session ID, if the proposal is being
 *  downloaded in the context of a session ID.
 */
async function startDownloadProposal(
  ws: InternalWalletState,
  merchantBaseUrl: string,
  orderId: string,
  sessionId: string | undefined,
  claimToken: string | undefined,
  noncePriv: string | undefined,
): Promise<string> {

  const oldProposal = await ws.db
    .mktx((x) => ({ proposals: x.proposals }))
    .runReadOnly(async (tx) => {
      return tx.proposals.indexes.byUrlAndOrderId.get([
        merchantBaseUrl,
        orderId,
      ]);
    });
  
  /**
   * If we have already claimed this proposal with the same sessionId
   * nonce and claim token, reuse it.
   */
  if (oldProposal && 
      oldProposal.downloadSessionId === sessionId &&
      (!noncePriv || oldProposal.noncePriv === noncePriv) &&
      oldProposal.claimToken === claimToken) {
    await processDownloadProposal(ws, oldProposal.proposalId);
    return oldProposal.proposalId;
  }

  const { priv, pub } = await (noncePriv ? ws.cryptoApi.eddsaGetPublic(noncePriv) : ws.cryptoApi.createEddsaKeypair());
  const proposalId = encodeCrock(getRandomBytes(32));

  const proposalRecord: ProposalRecord = {
    download: undefined,
    noncePriv: priv,
    noncePub: pub,
    claimToken,
    timestamp: getTimestampNow(),
    merchantBaseUrl,
    orderId,
    proposalId: proposalId,
    proposalStatus: ProposalStatus.DOWNLOADING,
    repurchaseProposalId: undefined,
    retryInfo: initRetryInfo(),
    lastError: undefined,
    downloadSessionId: sessionId,
  };

  await ws.db
    .mktx((x) => ({ proposals: x.proposals }))
    .runReadWrite(async (tx) => {
      const existingRecord = await tx.proposals.indexes.byUrlAndOrderId.get([
        merchantBaseUrl,
        orderId,
      ]);
      if (existingRecord) {
        // Created concurrently
        return;
      }
      await tx.proposals.put(proposalRecord);
    });

  await processDownloadProposal(ws, proposalId);
  return proposalId;
}

async function storeFirstPaySuccess(
  ws: InternalWalletState,
  proposalId: string,
  sessionId: string | undefined,
  paySig: string,
): Promise<void> {
  const now = getTimestampNow();
  await ws.db
    .mktx((x) => ({ purchases: x.purchases }))
    .runReadWrite(async (tx) => {
      const purchase = await tx.purchases.get(proposalId);

      if (!purchase) {
        logger.warn("purchase does not exist anymore");
        return;
      }
      const isFirst = purchase.timestampFirstSuccessfulPay === undefined;
      if (!isFirst) {
        logger.warn("payment success already stored");
        return;
      }
      purchase.timestampFirstSuccessfulPay = now;
      purchase.paymentSubmitPending = false;
      purchase.lastPayError = undefined;
      purchase.lastSessionId = sessionId;
      purchase.payRetryInfo = initRetryInfo();
      purchase.merchantPaySig = paySig;
      if (isFirst) {
        const ar = purchase.download.contractData.autoRefund;
        if (ar) {
          logger.info("auto_refund present");
          purchase.refundQueryRequested = true;
          purchase.refundStatusRetryInfo = initRetryInfo();
          purchase.lastRefundStatusError = undefined;
          purchase.autoRefundDeadline = timestampAddDuration(now, ar);
        }
      }
      await tx.purchases.put(purchase);
    });
}

async function storePayReplaySuccess(
  ws: InternalWalletState,
  proposalId: string,
  sessionId: string | undefined,
): Promise<void> {
  await ws.db
    .mktx((x) => ({ purchases: x.purchases }))
    .runReadWrite(async (tx) => {
      const purchase = await tx.purchases.get(proposalId);

      if (!purchase) {
        logger.warn("purchase does not exist anymore");
        return;
      }
      const isFirst = purchase.timestampFirstSuccessfulPay === undefined;
      if (isFirst) {
        throw Error("invalid payment state");
      }
      purchase.paymentSubmitPending = false;
      purchase.lastPayError = undefined;
      purchase.payRetryInfo = initRetryInfo();
      purchase.lastSessionId = sessionId;
      await tx.purchases.put(purchase);
    });
}

/**
 * Handle a 409 Conflict response from the merchant.
 *
 * We do this by going through the coin history provided by the exchange and
 * (1) verifying the signatures from the exchange
 * (2) adjusting the remaining coin value and refreshing it
 * (3) re-do coin selection with the bad coin removed
 */
async function handleInsufficientFunds(
  ws: InternalWalletState,
  proposalId: string,
  err: TalerErrorDetails,
): Promise<void> {
  logger.trace("handling insufficient funds, trying to re-select coins");

  const proposal = await ws.db
    .mktx((x) => ({ purchaes: x.purchases }))
    .runReadOnly(async (tx) => {
      return tx.purchaes.get(proposalId);
    });
  if (!proposal) {
    return;
  }

  const brokenCoinPub = (err as any).coin_pub;

  const exchangeReply = (err as any).exchange_reply;
  if (
    exchangeReply.code !== TalerErrorCode.EXCHANGE_DEPOSIT_INSUFFICIENT_FUNDS
  ) {
    // FIXME: set as failed
    throw Error("can't handle error code");
  }

  logger.trace(`got error details: ${j2s(err)}`);

  const { contractData } = proposal.download;

  const candidates = await getCandidatePayCoins(ws, {
    allowedAuditors: contractData.allowedAuditors,
    allowedExchanges: contractData.allowedExchanges,
    amount: contractData.amount,
    maxDepositFee: contractData.maxDepositFee,
    maxWireFee: contractData.maxWireFee,
    timestamp: contractData.timestamp,
    wireFeeAmortization: contractData.wireFeeAmortization,
    wireMethod: contractData.wireMethod,
  });

  const prevPayCoins: PreviousPayCoins = [];

  await ws.db
    .mktx((x) => ({ coins: x.coins, denominations: x.denominations }))
    .runReadOnly(async (tx) => {
      for (let i = 0; i < proposal.payCoinSelection.coinPubs.length; i++) {
        const coinPub = proposal.payCoinSelection.coinPubs[i];
        if (coinPub === brokenCoinPub) {
          continue;
        }
        const contrib = proposal.payCoinSelection.coinContributions[i];
        const coin = await tx.coins.get(coinPub);
        if (!coin) {
          continue;
        }
        const denom = await tx.denominations.get([
          coin.exchangeBaseUrl,
          coin.denomPubHash,
        ]);
        if (!denom) {
          continue;
        }
        prevPayCoins.push({
          coinPub,
          contribution: contrib,
          exchangeBaseUrl: coin.exchangeBaseUrl,
          feeDeposit: denom.feeDeposit,
        });
      }
    });

  const res = selectPayCoins({
    candidates,
    contractTermsAmount: contractData.amount,
    depositFeeLimit: contractData.maxDepositFee,
    wireFeeAmortization: contractData.wireFeeAmortization ?? 1,
    wireFeeLimit: contractData.maxWireFee,
    prevPayCoins,
  });

  if (!res) {
    logger.trace("insufficient funds for coin re-selection");
    return;
  }

  logger.trace("re-selected coins");

  await ws.db
    .mktx((x) => ({
      purchases: x.purchases,
      coins: x.coins,
      denominations: x.denominations,
      refreshGroups: x.refreshGroups,
    }))
    .runReadWrite(async (tx) => {
      const p = await tx.purchases.get(proposalId);
      if (!p) {
        return;
      }
      p.payCoinSelection = res;
      p.payCoinSelectionUid = encodeCrock(getRandomBytes(32));
      p.coinDepositPermissions = undefined;
      await tx.purchases.put(p);
      await applyCoinSpend(ws, tx, res, `proposal:${p.proposalId}`);
    });
}

async function unblockBackup(
  ws: InternalWalletState,
  proposalId: string,
): Promise<void> {
  await ws.db
    .mktx((x) => ({ backupProviders: x.backupProviders }))
    .runReadWrite(async (tx) => {
      const bp = await tx.backupProviders.indexes.byPaymentProposalId
        .iter(proposalId)
        .forEachAsync(async (bp) => {
          if (bp.state.tag === BackupProviderStateTag.Retrying) {
            bp.state = {
              tag: BackupProviderStateTag.Ready,
              nextBackupTimestamp: getTimestampNow(),
            };
          }
        });
    });
}

/**
 * Submit a payment to the merchant.
 *
 * If the wallet has previously paid, it just transmits the merchant's
 * own signature certifying that the wallet has previously paid.
 */
async function submitPay(
  ws: InternalWalletState,
  proposalId: string,
): Promise<ConfirmPayResult> {
  const purchase = await ws.db
    .mktx((x) => ({ purchases: x.purchases }))
    .runReadOnly(async (tx) => {
      return tx.purchases.get(proposalId);
    });
  if (!purchase) {
    throw Error("Purchase not found: " + proposalId);
  }
  if (purchase.abortStatus !== AbortStatus.None) {
    throw Error("not submitting payment for aborted purchase");
  }
  const sessionId = purchase.lastSessionId;

  logger.trace("paying with session ID", sessionId);

  if (!purchase.merchantPaySig) {
    const payUrl = new URL(
      `orders/${purchase.download.contractData.orderId}/pay`,
      purchase.download.contractData.merchantBaseUrl,
    ).href;

    let depositPermissions: CoinDepositPermission[];

    if (purchase.coinDepositPermissions) {
      depositPermissions = purchase.coinDepositPermissions;
    } else {
      // FIXME: also cache!
      depositPermissions = await generateDepositPermissions(
        ws,
        purchase.payCoinSelection,
        purchase.download.contractData,
      );
    }

    const reqBody = {
      coins: depositPermissions,
      session_id: purchase.lastSessionId,
    };

    logger.trace(
      "making pay request ... ",
      JSON.stringify(reqBody, undefined, 2),
    );

    const resp = await ws.runSequentialized([EXCHANGE_COINS_LOCK], () =>
      ws.http.postJson(payUrl, reqBody, {
        timeout: getPayRequestTimeout(purchase),
      }),
    );

    logger.trace(`got resp ${JSON.stringify(resp)}`);

    // Hide transient errors.
    if (
      (purchase.payRetryInfo?.retryCounter ?? 0) <= 5 &&
      resp.status >= 500 &&
      resp.status <= 599
    ) {
      logger.trace("treating /pay error as transient");
      const err = makeErrorDetails(
        TalerErrorCode.WALLET_UNEXPECTED_REQUEST_ERROR,
        "/pay failed",
        getHttpResponseErrorDetails(resp),
      );
      incrementPurchasePayRetry(ws, proposalId, undefined);
      return {
        type: ConfirmPayResultType.Pending,
        lastError: err,
      };
    }

    if (resp.status === HttpStatusCode.BadRequest) {
      const errDetails = await readUnexpectedResponseDetails(resp);
      logger.warn("unexpected 400 response for /pay");
      logger.warn(j2s(errDetails));
      await ws.db
        .mktx((x) => ({ purchases: x.purchases }))
        .runReadWrite(async (tx) => {
          const purch = await tx.purchases.get(proposalId);
          if (!purch) {
            return;
          }
          purch.payFrozen = true;
          purch.lastPayError = errDetails;
          delete purch.payRetryInfo;
          await tx.purchases.put(purch);
        });
      // FIXME: Maybe introduce a new return type for this instead of throwing?
      throw new OperationFailedAndReportedError(errDetails);
    }

    if (resp.status === HttpStatusCode.Conflict) {
      const err = await readTalerErrorResponse(resp);
      if (
        err.code ===
        TalerErrorCode.MERCHANT_POST_ORDERS_ID_PAY_INSUFFICIENT_FUNDS
      ) {
        // Do this in the background, as it might take some time
        handleInsufficientFunds(ws, proposalId, err).catch(async (e) => {
          await incrementProposalRetry(ws, proposalId, {
            code: TalerErrorCode.WALLET_UNEXPECTED_EXCEPTION,
            message: "unexpected exception",
            hint: "unexpected exception",
            details: {
              exception: e.toString(),
            },
          });
        });

        return {
          type: ConfirmPayResultType.Pending,
          // FIXME: should we return something better here?
          lastError: err,
        };
      }
    }

    const merchantResp = await readSuccessResponseJsonOrThrow(
      resp,
      codecForMerchantPayResponse(),
    );

    logger.trace("got success from pay URL", merchantResp);

    const merchantPub = purchase.download.contractData.merchantPub;
    const valid: boolean = await ws.cryptoApi.isValidPaymentSignature(
      merchantResp.sig,
      purchase.download.contractData.contractTermsHash,
      merchantPub,
    );

    if (!valid) {
      logger.error("merchant payment signature invalid");
      // FIXME: properly display error
      throw Error("merchant payment signature invalid");
    }

    await storeFirstPaySuccess(ws, proposalId, sessionId, merchantResp.sig);
    await unblockBackup(ws, proposalId);
  } else {
    const payAgainUrl = new URL(
      `orders/${purchase.download.contractData.orderId}/paid`,
      purchase.download.contractData.merchantBaseUrl,
    ).href;
    const reqBody = {
      sig: purchase.merchantPaySig,
      h_contract: purchase.download.contractData.contractTermsHash,
      session_id: sessionId ?? "",
    };
    const resp = await ws.runSequentialized([EXCHANGE_COINS_LOCK], () =>
      ws.http.postJson(payAgainUrl, reqBody),
    );
    // Hide transient errors.
    if (
      (purchase.payRetryInfo?.retryCounter ?? 0) <= 5 &&
      resp.status >= 500 &&
      resp.status <= 599
    ) {
      const err = makeErrorDetails(
        TalerErrorCode.WALLET_UNEXPECTED_REQUEST_ERROR,
        "/paid failed",
        getHttpResponseErrorDetails(resp),
      );
      incrementPurchasePayRetry(ws, proposalId, undefined);
      return {
        type: ConfirmPayResultType.Pending,
        lastError: err,
      };
    }
    if (resp.status !== 204) {
      throw OperationFailedError.fromCode(
        TalerErrorCode.WALLET_UNEXPECTED_REQUEST_ERROR,
        "/paid failed",
        getHttpResponseErrorDetails(resp),
      );
    }
    await storePayReplaySuccess(ws, proposalId, sessionId);
    await unblockBackup(ws, proposalId);
  }

  ws.notify({
    type: NotificationType.PayOperationSuccess,
    proposalId: purchase.proposalId,
  });

  return {
    type: ConfirmPayResultType.Done,
    contractTerms: purchase.download.contractTermsRaw,
  };
}

export async function checkPaymentByProposalId(
  ws: InternalWalletState,
  proposalId: string,
  sessionId?: string,
): Promise<PreparePayResult> {
  let proposal = await ws.db
    .mktx((x) => ({ proposals: x.proposals }))
    .runReadOnly(async (tx) => {
      return tx.proposals.get(proposalId);
    });
  if (!proposal) {
    throw Error(`could not get proposal ${proposalId}`);
  }
  if (proposal.proposalStatus === ProposalStatus.REPURCHASE) {
    const existingProposalId = proposal.repurchaseProposalId;
    if (!existingProposalId) {
      throw Error("invalid proposal state");
    }
    logger.trace("using existing purchase for same product");
    proposal = await ws.db
      .mktx((x) => ({ proposals: x.proposals }))
      .runReadOnly(async (tx) => {
        return tx.proposals.get(existingProposalId);
      });
    if (!proposal) {
      throw Error("existing proposal is in wrong state");
    }
  }
  const d = proposal.download;
  if (!d) {
    logger.error("bad proposal", proposal);
    throw Error("proposal is in invalid state");
  }
  const contractData = d.contractData;
  const merchantSig = d.contractData.merchantSig;
  if (!merchantSig) {
    throw Error("BUG: proposal is in invalid state");
  }

  proposalId = proposal.proposalId;

  // First check if we already paid for it.
  const purchase = await ws.db
    .mktx((x) => ({ purchases: x.purchases }))
    .runReadOnly(async (tx) => {
      return tx.purchases.get(proposalId);
    });

  if (!purchase) {
    // If not already paid, check if we could pay for it.
    const candidates = await getCandidatePayCoins(ws, {
      allowedAuditors: contractData.allowedAuditors,
      allowedExchanges: contractData.allowedExchanges,
      amount: contractData.amount,
      maxDepositFee: contractData.maxDepositFee,
      maxWireFee: contractData.maxWireFee,
      timestamp: contractData.timestamp,
      wireFeeAmortization: contractData.wireFeeAmortization,
      wireMethod: contractData.wireMethod,
    });
    const res = selectPayCoins({
      candidates,
      contractTermsAmount: contractData.amount,
      depositFeeLimit: contractData.maxDepositFee,
      wireFeeAmortization: contractData.wireFeeAmortization ?? 1,
      wireFeeLimit: contractData.maxWireFee,
      prevPayCoins: [],
    });

    if (!res) {
      logger.info("not confirming payment, insufficient coins");
      return {
        status: PreparePayResultType.InsufficientBalance,
        contractTerms: d.contractTermsRaw,
        proposalId: proposal.proposalId,
        noncePriv: proposal.noncePriv,
        amountRaw: Amounts.stringify(d.contractData.amount),
      };
    }

    const totalCost = await getTotalPaymentCost(ws, res);
    logger.trace("costInfo", totalCost);
    logger.trace("coinsForPayment", res);

    return {
      status: PreparePayResultType.PaymentPossible,
      contractTerms: d.contractTermsRaw,
      proposalId: proposal.proposalId,
      noncePriv: proposal.noncePriv,
      amountEffective: Amounts.stringify(totalCost),
      amountRaw: Amounts.stringify(res.paymentAmount),
      contractTermsHash: d.contractData.contractTermsHash,
    };
  }

  if (purchase.lastSessionId !== sessionId) {
    logger.trace(
      "automatically re-submitting payment with different session ID",
    );
    await ws.db
      .mktx((x) => ({ purchases: x.purchases }))
      .runReadWrite(async (tx) => {
        const p = await tx.purchases.get(proposalId);
        if (!p) {
          return;
        }
        p.lastSessionId = sessionId;
        await tx.purchases.put(p);
      });
    const r = await guardOperationException(
      () => submitPay(ws, proposalId),
      (e: TalerErrorDetails): Promise<void> =>
        incrementPurchasePayRetry(ws, proposalId, e),
    );
    if (r.type !== ConfirmPayResultType.Done) {
      throw Error("submitting pay failed");
    }
    return {
      status: PreparePayResultType.AlreadyConfirmed,
      contractTerms: purchase.download.contractTermsRaw,
      contractTermsHash: purchase.download.contractData.contractTermsHash,
      paid: true,
      amountRaw: Amounts.stringify(purchase.download.contractData.amount),
      amountEffective: Amounts.stringify(purchase.totalPayCost),
      proposalId,
    };
  } else if (!purchase.timestampFirstSuccessfulPay) {
    return {
      status: PreparePayResultType.AlreadyConfirmed,
      contractTerms: purchase.download.contractTermsRaw,
      contractTermsHash: purchase.download.contractData.contractTermsHash,
      paid: false,
      amountRaw: Amounts.stringify(purchase.download.contractData.amount),
      amountEffective: Amounts.stringify(purchase.totalPayCost),
      proposalId,
    };
  } else {
    const paid = !purchase.paymentSubmitPending;
    return {
      status: PreparePayResultType.AlreadyConfirmed,
      contractTerms: purchase.download.contractTermsRaw,
      contractTermsHash: purchase.download.contractData.contractTermsHash,
      paid,
      amountRaw: Amounts.stringify(purchase.download.contractData.amount),
      amountEffective: Amounts.stringify(purchase.totalPayCost),
      ...(paid ? { nextUrl: purchase.download.contractData.orderId } : {}),
      proposalId,
    };
  }
}

/**
 * Check if a payment for the given taler://pay/ URI is possible.
 *
 * If the payment is possible, the signature are already generated but not
 * yet send to the merchant.
 */
export async function preparePayForUri(
  ws: InternalWalletState,
  talerPayUri: string,
): Promise<PreparePayResult> {
  const uriResult = parsePayUri(talerPayUri);

  if (!uriResult) {
    throw OperationFailedError.fromCode(
      TalerErrorCode.WALLET_INVALID_TALER_PAY_URI,
      `invalid taler://pay URI (${talerPayUri})`,
      {
        talerPayUri,
      },
    );
  }

  let proposalId = await startDownloadProposal(
    ws,
    uriResult.merchantBaseUrl,
    uriResult.orderId,
    uriResult.sessionId,
    uriResult.claimToken,
    uriResult.noncePriv,
  );

  return checkPaymentByProposalId(ws, proposalId, uriResult.sessionId);
}

/**
 * Generate deposit permissions for a purchase.
 *
 * Accesses the database and the crypto worker.
 */
export async function generateDepositPermissions(
  ws: InternalWalletState,
  payCoinSel: PayCoinSelection,
  contractData: WalletContractData,
): Promise<CoinDepositPermission[]> {
  const depositPermissions: CoinDepositPermission[] = [];
  const coinWithDenom: Array<{
    coin: CoinRecord;
    denom: DenominationRecord;
  }> = [];
  await ws.db
    .mktx((x) => ({ coins: x.coins, denominations: x.denominations }))
    .runReadOnly(async (tx) => {
      for (let i = 0; i < payCoinSel.coinPubs.length; i++) {
        const coin = await tx.coins.get(payCoinSel.coinPubs[i]);
        if (!coin) {
          throw Error("can't pay, allocated coin not found anymore");
        }
        const denom = await tx.denominations.get([
          coin.exchangeBaseUrl,
          coin.denomPubHash,
        ]);
        if (!denom) {
          throw Error(
            "can't pay, denomination of allocated coin not found anymore",
          );
        }
        coinWithDenom.push({ coin, denom });
      }
    });

  for (let i = 0; i < payCoinSel.coinPubs.length; i++) {
    const { coin, denom } = coinWithDenom[i];
    const dp = await ws.cryptoApi.signDepositPermission({
      coinPriv: coin.coinPriv,
      coinPub: coin.coinPub,
      contractTermsHash: contractData.contractTermsHash,
      denomPubHash: coin.denomPubHash,
      denomSig: coin.denomSig,
      exchangeBaseUrl: coin.exchangeBaseUrl,
      feeDeposit: denom.feeDeposit,
      merchantPub: contractData.merchantPub,
      refundDeadline: contractData.refundDeadline,
      spendAmount: payCoinSel.coinContributions[i],
      timestamp: contractData.timestamp,
      wireInfoHash: contractData.wireInfoHash,
    });
    depositPermissions.push(dp);
  }
  return depositPermissions;
}

/**
 * Add a contract to the wallet and sign coins, and send them.
 */
export async function confirmPay(
  ws: InternalWalletState,
  proposalId: string,
  sessionIdOverride?: string,
): Promise<ConfirmPayResult> {
  logger.trace(
    `executing confirmPay with proposalId ${proposalId} and sessionIdOverride ${sessionIdOverride}`,
  );
  const proposal = await ws.db
    .mktx((x) => ({ proposals: x.proposals }))
    .runReadOnly(async (tx) => {
      return tx.proposals.get(proposalId);
    });

  if (!proposal) {
    throw Error(`proposal with id ${proposalId} not found`);
  }

  const d = proposal.download;
  if (!d) {
    throw Error("proposal is in invalid state");
  }

  const existingPurchase = await ws.db
    .mktx((x) => ({ purchases: x.purchases }))
    .runReadWrite(async (tx) => {
      const purchase = await tx.purchases.get(proposalId);
      if (
        purchase &&
        sessionIdOverride !== undefined &&
        sessionIdOverride != purchase.lastSessionId
      ) {
        logger.trace(`changing session ID to ${sessionIdOverride}`);
        purchase.lastSessionId = sessionIdOverride;
        purchase.paymentSubmitPending = true;
        await tx.purchases.put(purchase);
      }
      return purchase;
    });

  if (existingPurchase) {
    logger.trace("confirmPay: submitting payment for existing purchase");
    return await guardOperationException(
      () => submitPay(ws, proposalId),
      (e: TalerErrorDetails): Promise<void> =>
        incrementPurchasePayRetry(ws, proposalId, e),
    );
  }

  logger.trace("confirmPay: purchase record does not exist yet");

  const contractData = d.contractData;

  const candidates = await getCandidatePayCoins(ws, {
    allowedAuditors: contractData.allowedAuditors,
    allowedExchanges: contractData.allowedExchanges,
    amount: contractData.amount,
    maxDepositFee: contractData.maxDepositFee,
    maxWireFee: contractData.maxWireFee,
    timestamp: contractData.timestamp,
    wireFeeAmortization: contractData.wireFeeAmortization,
    wireMethod: contractData.wireMethod,
  });

  const res = selectPayCoins({
    candidates,
    contractTermsAmount: contractData.amount,
    depositFeeLimit: contractData.maxDepositFee,
    wireFeeAmortization: contractData.wireFeeAmortization ?? 1,
    wireFeeLimit: contractData.maxWireFee,
    prevPayCoins: [],
  });

  logger.trace("coin selection result", res);

  if (!res) {
    // Should not happen, since checkPay should be called first
    // FIXME: Actually, this should be handled gracefully,
    // and the status should be stored in the DB.
    logger.warn("not confirming payment, insufficient coins");
    throw Error("insufficient balance");
  }

  const depositPermissions = await generateDepositPermissions(
    ws,
    res,
    d.contractData,
  );
  await recordConfirmPay(
    ws,
    proposal,
    res,
    depositPermissions,
    sessionIdOverride,
  );

  return await guardOperationException(
    () => submitPay(ws, proposalId),
    (e: TalerErrorDetails): Promise<void> =>
      incrementPurchasePayRetry(ws, proposalId, e),
  );
}

export async function processPurchasePay(
  ws: InternalWalletState,
  proposalId: string,
  forceNow = false,
): Promise<void> {
  const onOpErr = (e: TalerErrorDetails): Promise<void> =>
    incrementPurchasePayRetry(ws, proposalId, e);
  await guardOperationException(
    () => processPurchasePayImpl(ws, proposalId, forceNow),
    onOpErr,
  );
}

async function resetPurchasePayRetry(
  ws: InternalWalletState,
  proposalId: string,
): Promise<void> {
  await ws.db
    .mktx((x) => ({ purchases: x.purchases }))
    .runReadWrite(async (tx) => {
      const p = await tx.purchases.get(proposalId);
      if (p) {
        p.payRetryInfo = initRetryInfo();
        await tx.purchases.put(p);
      }
    });
}

async function processPurchasePayImpl(
  ws: InternalWalletState,
  proposalId: string,
  forceNow: boolean,
): Promise<void> {
  if (forceNow) {
    await resetPurchasePayRetry(ws, proposalId);
  }
  const purchase = await ws.db
    .mktx((x) => ({ purchases: x.purchases }))
    .runReadOnly(async (tx) => {
      return tx.purchases.get(proposalId);
    });
  if (!purchase) {
    return;
  }
  if (!purchase.paymentSubmitPending) {
    return;
  }
  logger.trace(`processing purchase pay ${proposalId}`);
  await submitPay(ws, proposalId);
}

export async function refuseProposal(
  ws: InternalWalletState,
  proposalId: string,
): Promise<void> {
  const success = await ws.db
    .mktx((x) => ({ proposals: x.proposals }))
    .runReadWrite(async (tx) => {
      const proposal = await tx.proposals.get(proposalId);
      if (!proposal) {
        logger.trace(`proposal ${proposalId} not found, won't refuse proposal`);
        return false;
      }
      if (proposal.proposalStatus !== ProposalStatus.PROPOSED) {
        return false;
      }
      proposal.proposalStatus = ProposalStatus.REFUSED;
      await tx.proposals.put(proposal);
      return true;
    });
  if (success) {
    ws.notify({
      type: NotificationType.ProposalRefused,
    });
  }
}
