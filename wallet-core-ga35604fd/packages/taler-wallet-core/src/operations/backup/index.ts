/*
 This file is part of GNU Taler
 (C) 2020 Taler Systems SA

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
 * Implementation of wallet backups (export/import/upload) and sync
 * server management.
 *
 * @author Florian Dold <dold@taler.net>
 */

/**
 * Imports.
 */
import {
  AmountString,
  BackupRecovery,
  buildCodecForObject,
  canonicalizeBaseUrl,
  canonicalJson,
  Codec,
  codecForAmountString,
  codecForBoolean,
  codecForList,
  codecForNumber,
  codecForString,
  codecOptional,
  ConfirmPayResultType,
  durationFromSpec,
  getTimestampNow,
  hashDenomPub,
  HttpStatusCode,
  j2s,
  Logger,
  notEmpty,
  NotificationType,
  PreparePayResultType,
  RecoveryLoadRequest,
  RecoveryMergeStrategy,
  TalerErrorDetails,
  Timestamp,
  timestampAddDuration,
  URL,
  WalletBackupContentV1,
} from "@gnu-taler/taler-util";
import { gunzipSync, gzipSync } from "fflate";
import { InternalWalletState } from "../../common.js";
import { kdf } from "@gnu-taler/taler-util";
import { secretbox, secretbox_open } from "@gnu-taler/taler-util";
import {
  bytesToString,
  decodeCrock,
  eddsaGetPublic,
  EddsaKeyPair,
  encodeCrock,
  getRandomBytes,
  hash,
  rsaBlind,
  stringToBytes,
} from "@gnu-taler/taler-util";
import { CryptoApi } from "../../crypto/workers/cryptoApi.js";
import {
  BackupProviderRecord,
  BackupProviderState,
  BackupProviderStateTag,
  BackupProviderTerms,
  ConfigRecord,
  WalletBackupConfState,
  WalletStoresV1,
  WALLET_BACKUP_STATE_KEY,
} from "../../db.js";
import { guardOperationException } from "../../errors.js";
import {
  readSuccessResponseJsonOrThrow,
  readTalerErrorResponse,
} from "../../util/http.js";
import {
  checkDbInvariant,
  checkLogicInvariant,
} from "../../util/invariants.js";
import { GetReadWriteAccess } from "../../util/query.js";
import { initRetryInfo, updateRetryInfoTimeout } from "../../util/retries.js";
import {
  checkPaymentByProposalId,
  confirmPay,
  preparePayForUri,
} from "../pay.js";
import { exportBackup } from "./export.js";
import { BackupCryptoPrecomputedData, importBackup } from "./import.js";
import { getWalletBackupState, provideBackupState } from "./state.js";

const logger = new Logger("operations/backup.ts");

function concatArrays(xs: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const x of xs) {
    len += x.byteLength;
  }
  const out = new Uint8Array(len);
  let offset = 0;
  for (const x of xs) {
    out.set(x, offset);
    offset += x.length;
  }
  return out;
}

const magic = "TLRWBK01";

/**
 * Encrypt the backup.
 *
 * Blob format:
 * Magic "TLRWBK01" (8 bytes)
 * Nonce (24 bytes)
 * Compressed JSON blob (rest)
 */
export async function encryptBackup(
  config: WalletBackupConfState,
  blob: WalletBackupContentV1,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  chunks.push(stringToBytes(magic));
  const nonceStr = config.lastBackupNonce;
  checkLogicInvariant(!!nonceStr);
  const nonce = decodeCrock(nonceStr).slice(0, 24);
  chunks.push(nonce);
  const backupJsonContent = canonicalJson(blob);
  logger.trace("backup JSON size", backupJsonContent.length);
  const compressedContent = gzipSync(stringToBytes(backupJsonContent), {
    mtime: 0,
  });
  const secret = deriveBlobSecret(config);
  const encrypted = secretbox(compressedContent, nonce.slice(0, 24), secret);
  chunks.push(encrypted);
  return concatArrays(chunks);
}

/**
 * Compute cryptographic values for a backup blob.
 *
 * FIXME: Take data that we already know from the DB.
 * FIXME: Move computations into crypto worker.
 */
async function computeBackupCryptoData(
  cryptoApi: CryptoApi,
  backupContent: WalletBackupContentV1,
): Promise<BackupCryptoPrecomputedData> {
  const cryptoData: BackupCryptoPrecomputedData = {
    coinPrivToCompletedCoin: {},
    rsaDenomPubToHash: {},
    proposalIdToContractTermsHash: {},
    proposalNoncePrivToPub: {},
    reservePrivToPub: {},
  };
  for (const backupExchangeDetails of backupContent.exchange_details) {
    for (const backupDenom of backupExchangeDetails.denominations) {
      if (backupDenom.denom_pub.cipher !== 1) {
        throw Error("unsupported cipher");
      }
      for (const backupCoin of backupDenom.coins) {
        const coinPub = encodeCrock(
          eddsaGetPublic(decodeCrock(backupCoin.coin_priv)),
        );
        const blindedCoin = rsaBlind(
          hash(decodeCrock(backupCoin.coin_priv)),
          decodeCrock(backupCoin.blinding_key),
          decodeCrock(backupDenom.denom_pub.rsa_public_key),
        );
        cryptoData.coinPrivToCompletedCoin[backupCoin.coin_priv] = {
          coinEvHash: encodeCrock(hash(blindedCoin)),
          coinPub,
        };
      }
      cryptoData.rsaDenomPubToHash[
        backupDenom.denom_pub.rsa_public_key
      ] = encodeCrock(hashDenomPub(backupDenom.denom_pub));
    }
    for (const backupReserve of backupExchangeDetails.reserves) {
      cryptoData.reservePrivToPub[backupReserve.reserve_priv] = encodeCrock(
        eddsaGetPublic(decodeCrock(backupReserve.reserve_priv)),
      );
    }
  }
  for (const prop of backupContent.proposals) {
    const contractTermsHash = await cryptoApi.hashString(
      canonicalJson(prop.contract_terms_raw),
    );
    const noncePub = encodeCrock(eddsaGetPublic(decodeCrock(prop.nonce_priv)));
    cryptoData.proposalNoncePrivToPub[prop.nonce_priv] = noncePub;
    cryptoData.proposalIdToContractTermsHash[
      prop.proposal_id
    ] = contractTermsHash;
  }
  for (const purch of backupContent.purchases) {
    const contractTermsHash = await cryptoApi.hashString(
      canonicalJson(purch.contract_terms_raw),
    );
    const noncePub = encodeCrock(eddsaGetPublic(decodeCrock(purch.nonce_priv)));
    cryptoData.proposalNoncePrivToPub[purch.nonce_priv] = noncePub;
    cryptoData.proposalIdToContractTermsHash[
      purch.proposal_id
    ] = contractTermsHash;
  }
  return cryptoData;
}

function deriveAccountKeyPair(
  bc: WalletBackupConfState,
  providerUrl: string,
): EddsaKeyPair {
  const privateKey = kdf(
    32,
    decodeCrock(bc.walletRootPriv),
    stringToBytes("taler-sync-account-key-salt"),
    stringToBytes(providerUrl),
  );
  return {
    eddsaPriv: privateKey,
    eddsaPub: eddsaGetPublic(privateKey),
  };
}

function deriveBlobSecret(bc: WalletBackupConfState): Uint8Array {
  return kdf(
    32,
    decodeCrock(bc.walletRootPriv),
    stringToBytes("taler-sync-blob-secret-salt"),
    stringToBytes("taler-sync-blob-secret-info"),
  );
}

interface BackupForProviderArgs {
  backupProviderBaseUrl: string;

  /**
   * Should we attempt one more upload after trying
   * to pay?
   */
  retryAfterPayment: boolean;
}

function getNextBackupTimestamp(): Timestamp {
  // FIXME:  Randomize!
  return timestampAddDuration(
    getTimestampNow(),
    durationFromSpec({ minutes: 5 }),
  );
}

async function runBackupCycleForProvider(
  ws: InternalWalletState,
  args: BackupForProviderArgs,
): Promise<void> {
  const provider = await ws.db
    .mktx((x) => ({ backupProviders: x.backupProviders }))
    .runReadOnly(async (tx) => {
      return tx.backupProviders.get(args.backupProviderBaseUrl);
    });

  if (!provider) {
    logger.warn("provider disappeared");
    return;
  }

  const backupJson = await exportBackup(ws);
  const backupConfig = await provideBackupState(ws);
  const encBackup = await encryptBackup(backupConfig, backupJson);
  const currentBackupHash = hash(encBackup);

  const accountKeyPair = deriveAccountKeyPair(backupConfig, provider.baseUrl);

  const newHash = encodeCrock(currentBackupHash);
  const oldHash = provider.lastBackupHash;

  logger.trace(`trying to upload backup to ${provider.baseUrl}`);
  logger.trace(`old hash ${oldHash}, new hash ${newHash}`);

  const syncSig = await ws.cryptoApi.makeSyncSignature({
    newHash: encodeCrock(currentBackupHash),
    oldHash: provider.lastBackupHash,
    accountPriv: encodeCrock(accountKeyPair.eddsaPriv),
  });

  logger.trace(`sync signature is ${syncSig}`);

  const accountBackupUrl = new URL(
    `/backups/${encodeCrock(accountKeyPair.eddsaPub)}`,
    provider.baseUrl,
  );

  const resp = await ws.http.fetch(accountBackupUrl.href, {
    method: "POST",
    body: encBackup,
    headers: {
      "content-type": "application/octet-stream",
      "sync-signature": syncSig,
      "if-none-match": newHash,
      ...(provider.lastBackupHash
        ? {
            "if-match": provider.lastBackupHash,
          }
        : {}),
    },
  });

  logger.trace(`sync response status: ${resp.status}`);

  if (resp.status === HttpStatusCode.NotModified) {
    await ws.db
      .mktx((x) => ({ backupProvider: x.backupProviders }))
      .runReadWrite(async (tx) => {
        const prov = await tx.backupProvider.get(provider.baseUrl);
        if (!prov) {
          return;
        }
        prov.lastBackupCycleTimestamp = getTimestampNow();
        prov.state = {
          tag: BackupProviderStateTag.Ready,
          nextBackupTimestamp: getNextBackupTimestamp(),
        };
        await tx.backupProvider.put(prov);
      });
    return;
  }

  if (resp.status === HttpStatusCode.PaymentRequired) {
    logger.trace("payment required for backup");
    logger.trace(`headers: ${j2s(resp.headers)}`);
    const talerUri = resp.headers.get("taler");
    if (!talerUri) {
      throw Error("no taler URI available to pay provider");
    }
    const res = await preparePayForUri(ws, talerUri);
    let proposalId = res.proposalId;
    let doPay: boolean = false;
    switch (res.status) {
      case PreparePayResultType.InsufficientBalance:
        // FIXME: record in provider state!
        logger.warn("insufficient balance to pay for backup provider");
        proposalId = res.proposalId;
        break;
      case PreparePayResultType.PaymentPossible:
        doPay = true;
        break;
      case PreparePayResultType.AlreadyConfirmed:
        break;
    }

    // FIXME: check if the provider is overcharging us!

    await ws.db
      .mktx((x) => ({ backupProviders: x.backupProviders }))
      .runReadWrite(async (tx) => {
        const provRec = await tx.backupProviders.get(provider.baseUrl);
        checkDbInvariant(!!provRec);
        const ids = new Set(provRec.paymentProposalIds);
        ids.add(proposalId);
        provRec.paymentProposalIds = Array.from(ids).sort();
        provRec.currentPaymentProposalId = proposalId;
        // FIXME: allocate error code for this!
        await tx.backupProviders.put(provRec);
        await incrementBackupRetryInTx(
          tx,
          args.backupProviderBaseUrl,
          undefined,
        );
      });

    if (doPay) {
      const confirmRes = await confirmPay(ws, proposalId);
      switch (confirmRes.type) {
        case ConfirmPayResultType.Pending:
          logger.warn("payment not yet finished yet");
          break;
      }
    }

    if (args.retryAfterPayment) {
      await runBackupCycleForProvider(ws, {
        ...args,
        retryAfterPayment: false,
      });
    }
    return;
  }

  if (resp.status === HttpStatusCode.NoContent) {
    await ws.db
      .mktx((x) => ({ backupProviders: x.backupProviders }))
      .runReadWrite(async (tx) => {
        const prov = await tx.backupProviders.get(provider.baseUrl);
        if (!prov) {
          return;
        }
        prov.lastBackupHash = encodeCrock(currentBackupHash);
        prov.lastBackupCycleTimestamp = getTimestampNow();
        prov.state = {
          tag: BackupProviderStateTag.Ready,
          nextBackupTimestamp: getNextBackupTimestamp(),
        };
        await tx.backupProviders.put(prov);
      });
    return;
  }

  if (resp.status === HttpStatusCode.Conflict) {
    logger.info("conflicting backup found");
    const backupEnc = new Uint8Array(await resp.bytes());
    const backupConfig = await provideBackupState(ws);
    const blob = await decryptBackup(backupConfig, backupEnc);
    const cryptoData = await computeBackupCryptoData(ws.cryptoApi, blob);
    await importBackup(ws, blob, cryptoData);
    await ws.db
      .mktx((x) => ({ backupProvider: x.backupProviders }))
      .runReadWrite(async (tx) => {
        const prov = await tx.backupProvider.get(provider.baseUrl);
        if (!prov) {
          logger.warn("backup provider not found anymore");
          return;
        }
        prov.lastBackupHash = encodeCrock(hash(backupEnc));
        // FIXME:  Allocate error code for this situation?
        prov.state = {
          tag: BackupProviderStateTag.Retrying,
          retryInfo: initRetryInfo(),
        };
        await tx.backupProvider.put(prov);
      });
    logger.info("processed existing backup");
    // Now upload our own, merged backup.
    await runBackupCycleForProvider(ws, {
      ...args,
      retryAfterPayment: false,
    });
    return;
  }

  // Some other response that we did not expect!

  logger.error("parsing error response");

  const err = await readTalerErrorResponse(resp);
  logger.error(`got error response from backup provider: ${j2s(err)}`);
  await ws.db
    .mktx((x) => ({ backupProviders: x.backupProviders }))
    .runReadWrite(async (tx) => {
      incrementBackupRetryInTx(tx, args.backupProviderBaseUrl, err);
    });
}

async function incrementBackupRetryInTx(
  tx: GetReadWriteAccess<{
    backupProviders: typeof WalletStoresV1.backupProviders;
  }>,
  backupProviderBaseUrl: string,
  err: TalerErrorDetails | undefined,
): Promise<void> {
  const pr = await tx.backupProviders.get(backupProviderBaseUrl);
  if (!pr) {
    return;
  }
  if (pr.state.tag === BackupProviderStateTag.Retrying) {
    pr.state.retryInfo.retryCounter++;
    pr.state.lastError = err;
    updateRetryInfoTimeout(pr.state.retryInfo);
  } else if (pr.state.tag === BackupProviderStateTag.Ready) {
    pr.state = {
      tag: BackupProviderStateTag.Retrying,
      retryInfo: initRetryInfo(),
      lastError: err,
    };
  }
  await tx.backupProviders.put(pr);
}

async function incrementBackupRetry(
  ws: InternalWalletState,
  backupProviderBaseUrl: string,
  err: TalerErrorDetails | undefined,
): Promise<void> {
  await ws.db
    .mktx((x) => ({ backupProviders: x.backupProviders }))
    .runReadWrite(async (tx) =>
      incrementBackupRetryInTx(tx, backupProviderBaseUrl, err),
    );
}

export async function processBackupForProvider(
  ws: InternalWalletState,
  backupProviderBaseUrl: string,
): Promise<void> {
  const provider = await ws.db
    .mktx((x) => ({ backupProviders: x.backupProviders }))
    .runReadOnly(async (tx) => {
      return await tx.backupProviders.get(backupProviderBaseUrl);
    });
  if (!provider) {
    throw Error("unknown backup provider");
  }

  const onOpErr = (err: TalerErrorDetails): Promise<void> =>
    incrementBackupRetry(ws, backupProviderBaseUrl, err);

  const run = async () => {
    await runBackupCycleForProvider(ws, {
      backupProviderBaseUrl: provider.baseUrl,
      retryAfterPayment: true,
    });
  };

  await guardOperationException(run, onOpErr);
}

export interface RemoveBackupProviderRequest {
  provider: string;
}

export const codecForRemoveBackupProvider = (): Codec<RemoveBackupProviderRequest> =>
  buildCodecForObject<RemoveBackupProviderRequest>()
    .property("provider", codecForString())
    .build("RemoveBackupProviderRequest");

export async function removeBackupProvider(
  ws: InternalWalletState,
  req: RemoveBackupProviderRequest,
): Promise<void> {
  await ws.db
    .mktx(({ backupProviders }) => ({ backupProviders }))
    .runReadWrite(async (tx) => {
      await tx.backupProviders.delete(req.provider);
    });
}

export interface RunBackupCycleRequest {
  /**
   * List of providers to backup or empty for all known providers.
   */
  providers?: Array<string>;
}

export const codecForRunBackupCycle = (): Codec<RunBackupCycleRequest> =>
  buildCodecForObject<RunBackupCycleRequest>()
    .property("providers", codecOptional(codecForList(codecForString())))
    .build("RunBackupCycleRequest");

/**
 * Do one backup cycle that consists of:
 * 1. Exporting a backup and try to upload it.
 *    Stop if this step succeeds.
 * 2. Download, verify and import backups from connected sync accounts.
 * 3. Upload the updated backup blob.
 */
export async function runBackupCycle(
  ws: InternalWalletState,
  req: RunBackupCycleRequest,
): Promise<void> {
  const providers = await ws.db
    .mktx((x) => ({ backupProviders: x.backupProviders }))
    .runReadOnly(async (tx) => {
      if (req.providers) {
        const rs = await Promise.all(
          req.providers.map((id) => tx.backupProviders.get(id)),
        );
        return rs.filter(notEmpty);
      }
      return await tx.backupProviders.iter().toArray();
    });

  for (const provider of providers) {
    await runBackupCycleForProvider(ws, {
      backupProviderBaseUrl: provider.baseUrl,
      retryAfterPayment: true,
    });
  }
}

interface SyncTermsOfServiceResponse {
  // maximum backup size supported
  storage_limit_in_megabytes: number;

  // Fee for an account, per year.
  annual_fee: AmountString;

  // protocol version supported by the server,
  // for now always "0.0".
  version: string;
}

const codecForSyncTermsOfServiceResponse = (): Codec<SyncTermsOfServiceResponse> =>
  buildCodecForObject<SyncTermsOfServiceResponse>()
    .property("storage_limit_in_megabytes", codecForNumber())
    .property("annual_fee", codecForAmountString())
    .property("version", codecForString())
    .build("SyncTermsOfServiceResponse");

export interface AddBackupProviderRequest {
  backupProviderBaseUrl: string;

  name: string;
  /**
   * Activate the provider.  Should only be done after
   * the user has reviewed the provider.
   */
  activate?: boolean;
}

export const codecForAddBackupProviderRequest = (): Codec<AddBackupProviderRequest> =>
  buildCodecForObject<AddBackupProviderRequest>()
    .property("backupProviderBaseUrl", codecForString())
    .property("name", codecForString())
    .property("activate", codecOptional(codecForBoolean()))
    .build("AddBackupProviderRequest");

export async function addBackupProvider(
  ws: InternalWalletState,
  req: AddBackupProviderRequest,
): Promise<void> {
  logger.info(`adding backup provider ${j2s(req)}`);
  await provideBackupState(ws);
  const canonUrl = canonicalizeBaseUrl(req.backupProviderBaseUrl);
  await ws.db
    .mktx((x) => ({ backupProviders: x.backupProviders }))
    .runReadWrite(async (tx) => {
      const oldProv = await tx.backupProviders.get(canonUrl);
      if (oldProv) {
        logger.info("old backup provider found");
        if (req.activate) {
          oldProv.state = {
            tag: BackupProviderStateTag.Ready,
            nextBackupTimestamp: getTimestampNow(),
          };
          logger.info("setting existing backup provider to active");
          await tx.backupProviders.put(oldProv);
        }
        return;
      }
    });
  const termsUrl = new URL("config", canonUrl);
  const resp = await ws.http.get(termsUrl.href);
  const terms = await readSuccessResponseJsonOrThrow(
    resp,
    codecForSyncTermsOfServiceResponse(),
  );
  await ws.db
    .mktx((x) => ({ backupProviders: x.backupProviders }))
    .runReadWrite(async (tx) => {
      let state: BackupProviderState;
      if (req.activate) {
        state = {
          tag: BackupProviderStateTag.Ready,
          nextBackupTimestamp: getTimestampNow(),
        };
      } else {
        state = {
          tag: BackupProviderStateTag.Provisional,
        };
      }
      await tx.backupProviders.put({
        state,
        name: req.name,
        terms: {
          annualFee: terms.annual_fee,
          storageLimitInMegabytes: terms.storage_limit_in_megabytes,
          supportedProtocolVersion: terms.version,
        },
        paymentProposalIds: [],
        baseUrl: canonUrl,
        uids: [encodeCrock(getRandomBytes(32))],
      });
    });
}

export async function restoreFromRecoverySecret(): Promise<void> {}

/**
 * Information about one provider.
 *
 * We don't store the account key here,
 * as that's derived from the wallet root key.
 */
export interface ProviderInfo {
  active: boolean;
  syncProviderBaseUrl: string;
  name: string;
  terms?: BackupProviderTerms;
  /**
   * Last communication issue with the provider.
   */
  lastError?: TalerErrorDetails;
  lastSuccessfulBackupTimestamp?: Timestamp;
  lastAttemptedBackupTimestamp?: Timestamp;
  paymentProposalIds: string[];
  backupProblem?: BackupProblem;
  paymentStatus: ProviderPaymentStatus;
}

export type BackupProblem =
  | BackupUnreadableProblem
  | BackupConflictingDeviceProblem;

export interface BackupUnreadableProblem {
  type: "backup-unreadable";
}

export interface BackupUnreadableProblem {
  type: "backup-unreadable";
}

export interface BackupConflictingDeviceProblem {
  type: "backup-conflicting-device";
  otherDeviceId: string;
  myDeviceId: string;
  backupTimestamp: Timestamp;
}

export type ProviderPaymentStatus =
  | ProviderPaymentTermsChanged
  | ProviderPaymentPaid
  | ProviderPaymentInsufficientBalance
  | ProviderPaymentUnpaid
  | ProviderPaymentPending;

export interface BackupInfo {
  walletRootPub: string;
  deviceId: string;
  providers: ProviderInfo[];
}

export async function importBackupPlain(
  ws: InternalWalletState,
  blob: any,
): Promise<void> {
  // FIXME: parse
  const backup: WalletBackupContentV1 = blob;

  const cryptoData = await computeBackupCryptoData(ws.cryptoApi, backup);

  await importBackup(ws, blob, cryptoData);
}

export enum ProviderPaymentType {
  Unpaid = "unpaid",
  Pending = "pending",
  InsufficientBalance = "insufficient-balance",
  Paid = "paid",
  TermsChanged = "terms-changed",
}

export interface ProviderPaymentUnpaid {
  type: ProviderPaymentType.Unpaid;
}

export interface ProviderPaymentInsufficientBalance {
  type: ProviderPaymentType.InsufficientBalance;
}

export interface ProviderPaymentPending {
  type: ProviderPaymentType.Pending;
}

export interface ProviderPaymentPaid {
  type: ProviderPaymentType.Paid;
  paidUntil: Timestamp;
}

export interface ProviderPaymentTermsChanged {
  type: ProviderPaymentType.TermsChanged;
  paidUntil: Timestamp;
  oldTerms: BackupProviderTerms;
  newTerms: BackupProviderTerms;
}

async function getProviderPaymentInfo(
  ws: InternalWalletState,
  provider: BackupProviderRecord,
): Promise<ProviderPaymentStatus> {
  if (!provider.currentPaymentProposalId) {
    return {
      type: ProviderPaymentType.Unpaid,
    };
  }
  const status = await checkPaymentByProposalId(
    ws,
    provider.currentPaymentProposalId,
  );
  if (status.status === PreparePayResultType.InsufficientBalance) {
    return {
      type: ProviderPaymentType.InsufficientBalance,
    };
  }
  if (status.status === PreparePayResultType.PaymentPossible) {
    return {
      type: ProviderPaymentType.Pending,
    };
  }
  if (status.status === PreparePayResultType.AlreadyConfirmed) {
    if (status.paid) {
      return {
        type: ProviderPaymentType.Paid,
        paidUntil: timestampAddDuration(
          status.contractTerms.timestamp,
          durationFromSpec({ years: 1 }),
        ),
      };
    } else {
      return {
        type: ProviderPaymentType.Pending,
      };
    }
  }
  throw Error("not reached");
}

/**
 * Get information about the current state of wallet backups.
 */
export async function getBackupInfo(
  ws: InternalWalletState,
): Promise<BackupInfo> {
  const backupConfig = await provideBackupState(ws);
  const providerRecords = await ws.db
    .mktx((x) => ({ backupProviders: x.backupProviders }))
    .runReadOnly(async (tx) => {
      return await tx.backupProviders.iter().toArray();
    });
  const providers: ProviderInfo[] = [];
  for (const x of providerRecords) {
    providers.push({
      active: x.state.tag !== BackupProviderStateTag.Provisional,
      syncProviderBaseUrl: x.baseUrl,
      lastSuccessfulBackupTimestamp: x.lastBackupCycleTimestamp,
      paymentProposalIds: x.paymentProposalIds,
      lastError:
        x.state.tag === BackupProviderStateTag.Retrying
          ? x.state.lastError
          : undefined,
      paymentStatus: await getProviderPaymentInfo(ws, x),
      terms: x.terms,
      name: x.name,
    });
  }
  return {
    deviceId: backupConfig.deviceId,
    walletRootPub: backupConfig.walletRootPub,
    providers,
  };
}

/**
 * Get backup recovery information, including the wallet's
 * private key.
 */
export async function getBackupRecovery(
  ws: InternalWalletState,
): Promise<BackupRecovery> {
  const bs = await provideBackupState(ws);
  const providers = await ws.db
    .mktx((x) => ({ backupProviders: x.backupProviders }))
    .runReadOnly(async (tx) => {
      return await tx.backupProviders.iter().toArray();
    });
  return {
    providers: providers
      .filter((x) => x.state.tag !== BackupProviderStateTag.Provisional)
      .map((x) => {
        return {
          url: x.baseUrl,
        };
      }),
    walletRootPriv: bs.walletRootPriv,
  };
}

async function backupRecoveryTheirs(
  ws: InternalWalletState,
  br: BackupRecovery,
) {
  await ws.db
    .mktx((x) => ({ config: x.config, backupProviders: x.backupProviders }))
    .runReadWrite(async (tx) => {
      let backupStateEntry: ConfigRecord | undefined = await tx.config.get(
        WALLET_BACKUP_STATE_KEY,
      );
      checkDbInvariant(!!backupStateEntry);
      checkDbInvariant(backupStateEntry.key === WALLET_BACKUP_STATE_KEY);
      backupStateEntry.value.lastBackupNonce = undefined;
      backupStateEntry.value.lastBackupTimestamp = undefined;
      backupStateEntry.value.lastBackupCheckTimestamp = undefined;
      backupStateEntry.value.lastBackupPlainHash = undefined;
      backupStateEntry.value.walletRootPriv = br.walletRootPriv;
      backupStateEntry.value.walletRootPub = encodeCrock(
        eddsaGetPublic(decodeCrock(br.walletRootPriv)),
      );
      await tx.config.put(backupStateEntry);
      for (const prov of br.providers) {
        const existingProv = await tx.backupProviders.get(prov.url);
        if (!existingProv) {
          await tx.backupProviders.put({
            baseUrl: prov.url,
            name: "not-defined",
            paymentProposalIds: [],
            state: {
              tag: BackupProviderStateTag.Ready,
              nextBackupTimestamp: getTimestampNow(),
            },
            uids: [encodeCrock(getRandomBytes(32))],
          });
        }
      }
      const providers = await tx.backupProviders.iter().toArray();
      for (const prov of providers) {
        prov.lastBackupCycleTimestamp = undefined;
        prov.lastBackupHash = undefined;
        await tx.backupProviders.put(prov);
      }
    });
}

async function backupRecoveryOurs(ws: InternalWalletState, br: BackupRecovery) {
  throw Error("not implemented");
}

export async function loadBackupRecovery(
  ws: InternalWalletState,
  br: RecoveryLoadRequest,
): Promise<void> {
  const bs = await provideBackupState(ws);
  const providers = await ws.db
    .mktx((x) => ({ backupProviders: x.backupProviders }))
    .runReadOnly(async (tx) => {
      return await tx.backupProviders.iter().toArray();
    });
  let strategy = br.strategy;
  if (
    br.recovery.walletRootPriv != bs.walletRootPriv &&
    providers.length > 0 &&
    !strategy
  ) {
    throw Error(
      "recovery load strategy must be specified for wallet with existing providers",
    );
  } else if (!strategy) {
    // Default to using the new key if we don't have providers yet.
    strategy = RecoveryMergeStrategy.Theirs;
  }
  if (strategy === RecoveryMergeStrategy.Theirs) {
    return backupRecoveryTheirs(ws, br.recovery);
  } else {
    return backupRecoveryOurs(ws, br.recovery);
  }
}

export async function exportBackupEncrypted(
  ws: InternalWalletState,
): Promise<Uint8Array> {
  await provideBackupState(ws);
  const blob = await exportBackup(ws);
  const bs = await ws.db
    .mktx((x) => ({ config: x.config }))
    .runReadOnly(async (tx) => {
      return await getWalletBackupState(ws, tx);
    });
  return encryptBackup(bs, blob);
}

export async function decryptBackup(
  backupConfig: WalletBackupConfState,
  data: Uint8Array,
): Promise<WalletBackupContentV1> {
  const rMagic = bytesToString(data.slice(0, 8));
  if (rMagic != magic) {
    throw Error("invalid backup file (magic tag mismatch)");
  }

  const nonce = data.slice(8, 8 + 24);
  const box = data.slice(8 + 24);
  const secret = deriveBlobSecret(backupConfig);
  const dataCompressed = secretbox_open(box, nonce, secret);
  if (!dataCompressed) {
    throw Error("decryption failed");
  }
  return JSON.parse(bytesToString(gunzipSync(dataCompressed)));
}

export async function importBackupEncrypted(
  ws: InternalWalletState,
  data: Uint8Array,
): Promise<void> {
  const backupConfig = await provideBackupState(ws);
  const blob = await decryptBackup(backupConfig, data);
  const cryptoData = await computeBackupCryptoData(ws.cryptoApi, blob);
  await importBackup(ws, blob, cryptoData);
}
