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
 * Imports.
 */
import {
  Amounts,
  Auditor,
  canonicalizeBaseUrl,
  codecForExchangeKeysJson,
  codecForExchangeWireJson,
  compare,
  Denomination,
  Duration,
  durationFromSpec,
  ExchangeSignKeyJson,
  ExchangeWireJson,
  getTimestampNow,
  isTimestampExpired,
  Logger,
  NotificationType,
  parsePaytoUri,
  Recoup,
  TalerErrorCode,
  URL,
  TalerErrorDetails,
  Timestamp,
  hashDenomPub,
} from "@gnu-taler/taler-util";
import { decodeCrock, encodeCrock, hash } from "@gnu-taler/taler-util";
import { CryptoApi } from "../crypto/workers/cryptoApi.js";
import {
  DenominationRecord,
  DenominationVerificationStatus,
  ExchangeDetailsRecord,
  ExchangeRecord,
  WalletStoresV1,
  WireFee,
  WireInfo,
} from "../db.js";
import {
  getExpiryTimestamp,
  HttpRequestLibrary,
  readSuccessResponseJsonOrThrow,
  readSuccessResponseTextOrThrow,
} from "../util/http.js";
import { DbAccess, GetReadOnlyAccess } from "../util/query.js";
import { initRetryInfo, updateRetryInfoTimeout } from "../util/retries.js";
import {
  guardOperationException,
  makeErrorDetails,
  OperationFailedError,
} from "../errors.js";
import { InternalWalletState, TrustInfo } from "../common.js";
import {
  WALLET_CACHE_BREAKER_CLIENT_VERSION,
  WALLET_EXCHANGE_PROTOCOL_VERSION,
} from "../versions.js";

const logger = new Logger("exchanges.ts");

function denominationRecordFromKeys(
  exchangeBaseUrl: string,
  exchangeMasterPub: string,
  listIssueDate: Timestamp,
  denomIn: Denomination,
): DenominationRecord {
  const denomPubHash = encodeCrock(hashDenomPub(denomIn.denom_pub));
  const d: DenominationRecord = {
    denomPub: denomIn.denom_pub,
    denomPubHash,
    exchangeBaseUrl,
    exchangeMasterPub,
    feeDeposit: Amounts.parseOrThrow(denomIn.fee_deposit),
    feeRefresh: Amounts.parseOrThrow(denomIn.fee_refresh),
    feeRefund: Amounts.parseOrThrow(denomIn.fee_refund),
    feeWithdraw: Amounts.parseOrThrow(denomIn.fee_withdraw),
    isOffered: true,
    isRevoked: false,
    masterSig: denomIn.master_sig,
    stampExpireDeposit: denomIn.stamp_expire_deposit,
    stampExpireLegal: denomIn.stamp_expire_legal,
    stampExpireWithdraw: denomIn.stamp_expire_withdraw,
    stampStart: denomIn.stamp_start,
    verificationStatus: DenominationVerificationStatus.Unverified,
    value: Amounts.parseOrThrow(denomIn.value),
    listIssueDate,
  };
  return d;
}

async function handleExchangeUpdateError(
  ws: InternalWalletState,
  baseUrl: string,
  err: TalerErrorDetails,
): Promise<void> {
  await ws.db
    .mktx((x) => ({ exchanges: x.exchanges }))
    .runReadOnly(async (tx) => {
      const exchange = await tx.exchanges.get(baseUrl);
      if (!exchange) {
        return;
      }
      exchange.retryInfo.retryCounter++;
      updateRetryInfoTimeout(exchange.retryInfo);
      exchange.lastError = err;
    });
  if (err) {
    ws.notify({ type: NotificationType.ExchangeOperationError, error: err });
  }
}

function getExchangeRequestTimeout(e: ExchangeRecord): Duration {
  return { d_ms: 5000 };
}

export interface ExchangeTosDownloadResult {
  tosText: string;
  tosEtag: string;
  tosContentType: string;
}

export async function downloadExchangeWithTermsOfService(
  exchangeBaseUrl: string,
  http: HttpRequestLibrary,
  timeout: Duration,
  contentType: string,
): Promise<ExchangeTosDownloadResult> {
  const reqUrl = new URL("terms", exchangeBaseUrl);
  reqUrl.searchParams.set("cacheBreaker", WALLET_CACHE_BREAKER_CLIENT_VERSION);
  const headers = {
    Accept: contentType,
  };

  const resp = await http.get(reqUrl.href, {
    headers,
    timeout,
  });
  const tosText = await readSuccessResponseTextOrThrow(resp);
  const tosEtag = resp.headers.get("etag") || "unknown";
  const tosContentType = resp.headers.get("content-type") || "text/plain";

  return { tosText, tosEtag, tosContentType };
}

/**
 * Get exchange details from the database.
 */
export async function getExchangeDetails(
  tx: GetReadOnlyAccess<{
    exchanges: typeof WalletStoresV1.exchanges;
    exchangeDetails: typeof WalletStoresV1.exchangeDetails;
  }>,
  exchangeBaseUrl: string,
): Promise<ExchangeDetailsRecord | undefined> {
  const r = await tx.exchanges.get(exchangeBaseUrl);
  if (!r) {
    return;
  }
  const dp = r.detailsPointer;
  if (!dp) {
    return;
  }
  const { currency, masterPublicKey } = dp;
  return await tx.exchangeDetails.get([r.baseUrl, currency, masterPublicKey]);
}

getExchangeDetails.makeContext = (db: DbAccess<typeof WalletStoresV1>) =>
  db.mktx((x) => ({
    exchanges: x.exchanges,
    exchangeDetails: x.exchangeDetails,
  }));

export async function acceptExchangeTermsOfService(
  ws: InternalWalletState,
  exchangeBaseUrl: string,
  etag: string | undefined,
): Promise<void> {
  await ws.db
    .mktx((x) => ({
      exchanges: x.exchanges,
      exchangeDetails: x.exchangeDetails,
    }))
    .runReadWrite(async (tx) => {
      const d = await getExchangeDetails(tx, exchangeBaseUrl);
      if (d) {
        d.termsOfServiceAcceptedEtag = etag;
        await tx.exchangeDetails.put(d);
      }
    });
}

async function validateWireInfo(
  wireInfo: ExchangeWireJson,
  masterPublicKey: string,
  cryptoApi: CryptoApi,
): Promise<WireInfo> {
  for (const a of wireInfo.accounts) {
    logger.trace("validating exchange acct");
    const isValid = await cryptoApi.isValidWireAccount(
      a.payto_uri,
      a.master_sig,
      masterPublicKey,
    );
    if (!isValid) {
      throw Error("exchange acct signature invalid");
    }
  }
  const feesForType: { [wireMethod: string]: WireFee[] } = {};
  for (const wireMethod of Object.keys(wireInfo.fees)) {
    const feeList: WireFee[] = [];
    for (const x of wireInfo.fees[wireMethod]) {
      const startStamp = x.start_date;
      const endStamp = x.end_date;
      const fee: WireFee = {
        closingFee: Amounts.parseOrThrow(x.closing_fee),
        endStamp,
        sig: x.sig,
        startStamp,
        wireFee: Amounts.parseOrThrow(x.wire_fee),
      };
      const isValid = await cryptoApi.isValidWireFee(
        wireMethod,
        fee,
        masterPublicKey,
      );
      if (!isValid) {
        throw Error("exchange wire fee signature invalid");
      }
      feeList.push(fee);
    }
    feesForType[wireMethod] = feeList;
  }

  return {
    accounts: wireInfo.accounts,
    feesForType,
  };
}

/**
 * Fetch wire information for an exchange.
 *
 * @param exchangeBaseUrl Exchange base URL, assumed to be already normalized.
 */
async function downloadExchangeWithWireInfo(
  exchangeBaseUrl: string,
  http: HttpRequestLibrary,
  timeout: Duration,
): Promise<ExchangeWireJson> {
  const reqUrl = new URL("wire", exchangeBaseUrl);
  reqUrl.searchParams.set("cacheBreaker", WALLET_CACHE_BREAKER_CLIENT_VERSION);

  const resp = await http.get(reqUrl.href, {
    timeout,
  });
  const wireInfo = await readSuccessResponseJsonOrThrow(
    resp,
    codecForExchangeWireJson(),
  );

  return wireInfo;
}

export async function updateExchangeFromUrl(
  ws: InternalWalletState,
  baseUrl: string,
  acceptedFormat?: string[],
  forceNow = false,
): Promise<{
  exchange: ExchangeRecord;
  exchangeDetails: ExchangeDetailsRecord;
}> {
  const onOpErr = (e: TalerErrorDetails): Promise<void> =>
    handleExchangeUpdateError(ws, baseUrl, e);
  return await guardOperationException(
    () => updateExchangeFromUrlImpl(ws, baseUrl, acceptedFormat, forceNow),
    onOpErr,
  );
}

async function provideExchangeRecord(
  ws: InternalWalletState,
  baseUrl: string,
  now: Timestamp,
): Promise<ExchangeRecord> {
  return await ws.db
    .mktx((x) => ({ exchanges: x.exchanges }))
    .runReadWrite(async (tx) => {
      let r = await tx.exchanges.get(baseUrl);
      if (!r) {
        r = {
          permanent: true,
          baseUrl: baseUrl,
          retryInfo: initRetryInfo(),
          detailsPointer: undefined,
          lastUpdate: undefined,
          nextUpdate: now,
          nextRefreshCheck: now,
        };
        await tx.exchanges.put(r);
      }
      return r;
    });
}

interface ExchangeKeysDownloadResult {
  masterPublicKey: string;
  currency: string;
  auditors: Auditor[];
  currentDenominations: DenominationRecord[];
  protocolVersion: string;
  signingKeys: ExchangeSignKeyJson[];
  reserveClosingDelay: Duration;
  expiry: Timestamp;
  recoup: Recoup[];
  listIssueDate: Timestamp;
}

/**
 * Download and validate an exchange's /keys data.
 */
async function downloadKeysInfo(
  baseUrl: string,
  http: HttpRequestLibrary,
  timeout: Duration,
): Promise<ExchangeKeysDownloadResult> {
  const keysUrl = new URL("keys", baseUrl);
  keysUrl.searchParams.set("cacheBreaker", WALLET_CACHE_BREAKER_CLIENT_VERSION);

  const resp = await http.get(keysUrl.href, {
    timeout,
  });
  const exchangeKeysJson = await readSuccessResponseJsonOrThrow(
    resp,
    codecForExchangeKeysJson(),
  );

  logger.info("received /keys response");

  if (exchangeKeysJson.denoms.length === 0) {
    const opErr = makeErrorDetails(
      TalerErrorCode.WALLET_EXCHANGE_DENOMINATIONS_INSUFFICIENT,
      "exchange doesn't offer any denominations",
      {
        exchangeBaseUrl: baseUrl,
      },
    );
    throw new OperationFailedError(opErr);
  }

  const protocolVersion = exchangeKeysJson.version;

  const versionRes = compare(WALLET_EXCHANGE_PROTOCOL_VERSION, protocolVersion);
  if (versionRes?.compatible != true) {
    const opErr = makeErrorDetails(
      TalerErrorCode.WALLET_EXCHANGE_PROTOCOL_VERSION_INCOMPATIBLE,
      "exchange protocol version not compatible with wallet",
      {
        exchangeProtocolVersion: protocolVersion,
        walletProtocolVersion: WALLET_EXCHANGE_PROTOCOL_VERSION,
      },
    );
    throw new OperationFailedError(opErr);
  }

  const currency = Amounts.parseOrThrow(
    exchangeKeysJson.denoms[0].value,
  ).currency.toUpperCase();

  return {
    masterPublicKey: exchangeKeysJson.master_public_key,
    currency,
    auditors: exchangeKeysJson.auditors,
    currentDenominations: exchangeKeysJson.denoms.map((d) =>
      denominationRecordFromKeys(
        baseUrl,
        exchangeKeysJson.master_public_key,
        exchangeKeysJson.list_issue_date,
        d,
      ),
    ),
    protocolVersion: exchangeKeysJson.version,
    signingKeys: exchangeKeysJson.signkeys,
    reserveClosingDelay: exchangeKeysJson.reserve_closing_delay,
    expiry: getExpiryTimestamp(resp, {
      minDuration: durationFromSpec({ hours: 1 }),
    }),
    recoup: exchangeKeysJson.recoup ?? [],
    listIssueDate: exchangeKeysJson.list_issue_date,
  };
}

/**
 * Update or add exchange DB entry by fetching the /keys and /wire information.
 * Optionally link the reserve entry to the new or existing
 * exchange entry in then DB.
 */
async function updateExchangeFromUrlImpl(
  ws: InternalWalletState,
  baseUrl: string,
  acceptedFormat?: string[],
  forceNow = false,
): Promise<{
  exchange: ExchangeRecord;
  exchangeDetails: ExchangeDetailsRecord;
}> {
  logger.trace(`updating exchange info for ${baseUrl}`);
  const now = getTimestampNow();
  baseUrl = canonicalizeBaseUrl(baseUrl);

  const r = await provideExchangeRecord(ws, baseUrl, now);

  if (!forceNow && r && !isTimestampExpired(r.nextUpdate)) {
    const res = await ws.db
      .mktx((x) => ({
        exchanges: x.exchanges,
        exchangeDetails: x.exchangeDetails,
      }))
      .runReadOnly(async (tx) => {
        const exchange = await tx.exchanges.get(baseUrl);
        if (!exchange) {
          return;
        }
        const exchangeDetails = await getExchangeDetails(tx, baseUrl);
        if (!exchangeDetails) {
          return;
        }
        return { exchange, exchangeDetails };
      });
    if (res) {
      logger.info("using existing exchange info");
      return res;
    }
  }

  logger.info("updating exchange /keys info");

  const timeout = getExchangeRequestTimeout(r);

  const keysInfo = await downloadKeysInfo(baseUrl, ws.http, timeout);

  logger.info("updating exchange /wire info");
  const wireInfoDownload = await downloadExchangeWithWireInfo(
    baseUrl,
    ws.http,
    timeout,
  );

  logger.info("validating exchange /wire info");

  const wireInfo = await validateWireInfo(
    wireInfoDownload,
    keysInfo.masterPublicKey,
    ws.cryptoApi,
  );

  logger.info("finished validating exchange /wire info");

  let tosFound: ExchangeTosDownloadResult | undefined;
  //Remove this when exchange supports multiple content-type in accept header
  if (acceptedFormat)
    for (const format of acceptedFormat) {
      const resp = await downloadExchangeWithTermsOfService(
        baseUrl,
        ws.http,
        timeout,
        format,
      );
      if (resp.tosContentType === format) {
        tosFound = resp;
        break;
      }
    }
  // If none of the specified format was found try text/plain
  const tosDownload =
    tosFound !== undefined
      ? tosFound
      : await downloadExchangeWithTermsOfService(
          baseUrl,
          ws.http,
          timeout,
          "text/plain",
        );

  let recoupGroupId: string | undefined = undefined;

  logger.trace("updating exchange info in database");

  const updated = await ws.db
    .mktx((x) => ({
      exchanges: x.exchanges,
      exchangeDetails: x.exchangeDetails,
      denominations: x.denominations,
      coins: x.coins,
      refreshGroups: x.refreshGroups,
      recoupGroups: x.recoupGroups,
    }))
    .runReadWrite(async (tx) => {
      const r = await tx.exchanges.get(baseUrl);
      if (!r) {
        logger.warn(`exchange ${baseUrl} no longer present`);
        return;
      }
      let details = await getExchangeDetails(tx, r.baseUrl);
      if (details) {
        // FIXME: We need to do some consistency checks!
      }
      // FIXME: validate signing keys and merge with old set
      details = {
        auditors: keysInfo.auditors,
        currency: keysInfo.currency,
        masterPublicKey: keysInfo.masterPublicKey,
        protocolVersion: keysInfo.protocolVersion,
        signingKeys: keysInfo.signingKeys,
        reserveClosingDelay: keysInfo.reserveClosingDelay,
        exchangeBaseUrl: r.baseUrl,
        wireInfo,
        termsOfServiceText: tosDownload.tosText,
        termsOfServiceAcceptedEtag: undefined,
        termsOfServiceContentType: tosDownload.tosContentType,
        termsOfServiceLastEtag: tosDownload.tosEtag,
        termsOfServiceAcceptedTimestamp: getTimestampNow(),
      };
      // FIXME: only update if pointer got updated
      r.lastError = undefined;
      r.retryInfo = initRetryInfo();
      r.lastUpdate = getTimestampNow();
      r.nextUpdate = keysInfo.expiry;
      // New denominations might be available.
      r.nextRefreshCheck = getTimestampNow();
      r.detailsPointer = {
        currency: details.currency,
        masterPublicKey: details.masterPublicKey,
        // FIXME: only change if pointer really changed
        updateClock: getTimestampNow(),
      };
      await tx.exchanges.put(r);
      await tx.exchangeDetails.put(details);

      logger.trace("updating denominations in database");
      const currentDenomSet = new Set<string>(
        keysInfo.currentDenominations.map((x) => x.denomPubHash),
      );
      for (const currentDenom of keysInfo.currentDenominations) {
        const oldDenom = await tx.denominations.get([
          baseUrl,
          currentDenom.denomPubHash,
        ]);
        if (oldDenom) {
          // FIXME: Do consistency check, report to auditor if necessary.
        } else {
          await tx.denominations.put(currentDenom);
        }
      }

      // Update list issue date for all denominations,
      // and mark non-offered denominations as such.
      await tx.denominations.indexes.byExchangeBaseUrl
        .iter(r.baseUrl)
        .forEachAsync(async (x) => {
          if (!currentDenomSet.has(x.denomPubHash)) {
            // FIXME: Here, an auditor report should be created, unless
            // the denomination is really legally expired.
            if (x.isOffered) {
              x.isOffered = false;
              logger.info(
                `setting denomination ${x.denomPubHash} to offered=false`,
              );
            }
          } else {
            x.listIssueDate = keysInfo.listIssueDate;
            if (!x.isOffered) {
              x.isOffered = true;
              logger.info(
                `setting denomination ${x.denomPubHash} to offered=true`,
              );
            }
          }
          await tx.denominations.put(x);
        });

      logger.trace("done updating denominations in database");

      // Handle recoup
      const recoupDenomList = keysInfo.recoup;
      const newlyRevokedCoinPubs: string[] = [];
      logger.trace("recoup list from exchange", recoupDenomList);
      for (const recoupInfo of recoupDenomList) {
        const oldDenom = await tx.denominations.get([
          r.baseUrl,
          recoupInfo.h_denom_pub,
        ]);
        if (!oldDenom) {
          // We never even knew about the revoked denomination, all good.
          continue;
        }
        if (oldDenom.isRevoked) {
          // We already marked the denomination as revoked,
          // this implies we revoked all coins
          logger.trace("denom already revoked");
          continue;
        }
        logger.trace("revoking denom", recoupInfo.h_denom_pub);
        oldDenom.isRevoked = true;
        await tx.denominations.put(oldDenom);
        const affectedCoins = await tx.coins.indexes.byDenomPubHash
          .iter(recoupInfo.h_denom_pub)
          .toArray();
        for (const ac of affectedCoins) {
          newlyRevokedCoinPubs.push(ac.coinPub);
        }
      }
      if (newlyRevokedCoinPubs.length != 0) {
        logger.trace("recouping coins", newlyRevokedCoinPubs);
        recoupGroupId = await ws.recoupOps.createRecoupGroup(
          ws,
          tx,
          newlyRevokedCoinPubs,
        );
      }
      return {
        exchange: r,
        exchangeDetails: details,
      };
    });

  if (recoupGroupId) {
    // Asynchronously start recoup.  This doesn't need to finish
    // for the exchange update to be considered finished.
    ws.recoupOps.processRecoupGroup(ws, recoupGroupId).catch((e) => {
      logger.error("error while recouping coins:", e);
    });
  }

  if (!updated) {
    throw Error("something went wrong with updating the exchange");
  }

  logger.trace("done updating exchange info in database");

  return {
    exchange: updated.exchange,
    exchangeDetails: updated.exchangeDetails,
  };
}

export async function getExchangePaytoUri(
  ws: InternalWalletState,
  exchangeBaseUrl: string,
  supportedTargetTypes: string[],
): Promise<string> {
  // We do the update here, since the exchange might not even exist
  // yet in our database.
  const details = await getExchangeDetails
    .makeContext(ws.db)
    .runReadOnly(async (tx) => {
      return getExchangeDetails(tx, exchangeBaseUrl);
    });
  const accounts = details?.wireInfo.accounts ?? [];
  for (const account of accounts) {
    const res = parsePaytoUri(account.payto_uri);
    if (!res) {
      continue;
    }
    if (supportedTargetTypes.includes(res.targetType)) {
      return account.payto_uri;
    }
  }
  throw Error("no matching exchange account found");
}

/**
 * Check if and how an exchange is trusted and/or audited.
 */
export async function getExchangeTrust(
  ws: InternalWalletState,
  exchangeInfo: ExchangeRecord,
): Promise<TrustInfo> {
  let isTrusted = false;
  let isAudited = false;

  return await ws.db
    .mktx((x) => ({
      exchanges: x.exchanges,
      exchangeDetails: x.exchangeDetails,
      exchangesTrustStore: x.exchangeTrust,
      auditorTrust: x.auditorTrust,
    }))
    .runReadOnly(async (tx) => {
      const exchangeDetails = await getExchangeDetails(
        tx,
        exchangeInfo.baseUrl,
      );

      if (!exchangeDetails) {
        throw Error(`exchange ${exchangeInfo.baseUrl} details not available`);
      }
      const exchangeTrustRecord = await tx.exchangesTrustStore.indexes.byExchangeMasterPub.get(
        exchangeDetails.masterPublicKey,
      );
      if (
        exchangeTrustRecord &&
        exchangeTrustRecord.uids.length > 0 &&
        exchangeTrustRecord.currency === exchangeDetails.currency
      ) {
        isTrusted = true;
      }

      for (const auditor of exchangeDetails.auditors) {
        const auditorTrustRecord = await tx.auditorTrust.indexes.byAuditorPub.get(
          auditor.auditor_pub,
        );
        if (auditorTrustRecord && auditorTrustRecord.uids.length > 0) {
          isAudited = true;
          break;
        }
      }

      return { isTrusted, isAudited };
    });
}
