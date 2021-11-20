/*
 This file is part of GNU Taler
 (C) 2019-2020 Taler Systems SA

 TALER is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 TALER is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 TALER; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

/**
 * Implementation of crypto-related high-level functions for the Taler wallet.
 *
 * @author Florian Dold <dold@taler.net>
 */

/**
 * Imports.
 */

// FIXME: Crypto should not use DB Types!
import {
  CoinRecord,
  DenominationRecord,
  WireFee,
  CoinSourceType,
} from "../../db.js";

import {
  buildSigPS,
  CoinDepositPermission,
  DenomKeyType,
  FreshCoin,
  hashDenomPub,
  RecoupRequest,
  RefreshPlanchetInfo,
  TalerSignaturePurpose,
} from "@gnu-taler/taler-util";
// FIXME: These types should be internal to the wallet!
import {
  BenchmarkResult,
  PlanchetCreationResult,
  PlanchetCreationRequest,
  DepositInfo,
  MakeSyncSignatureRequest,
} from "@gnu-taler/taler-util";
import { AmountJson, Amounts } from "@gnu-taler/taler-util";
import * as timer from "../../util/timer.js";
import {
  encodeCrock,
  decodeCrock,
  createEddsaKeyPair,
  hash,
  rsaBlind,
  eddsaVerify,
  eddsaSign,
  rsaUnblind,
  stringToBytes,
  createHashContext,
  keyExchangeEcdheEddsa,
  setupRefreshPlanchet,
  rsaVerify,
  setupRefreshTransferPub,
  setupTipPlanchet,
  setupWithdrawPlanchet,
  eddsaGetPublic,
} from "@gnu-taler/taler-util";
import { randomBytes } from "@gnu-taler/taler-util";
import { kdf } from "@gnu-taler/taler-util";
import { Timestamp, timestampTruncateToSecond } from "@gnu-taler/taler-util";

import { Logger } from "@gnu-taler/taler-util";
import {
  DerivedRefreshSession,
  DerivedTipPlanchet,
  DeriveRefreshSessionRequest,
  DeriveTipRequest,
  SignTrackTransactionRequest,
} from "../cryptoTypes.js";
import bigint from "big-integer";

const logger = new Logger("cryptoImplementation.ts");

function amountToBuffer(amount: AmountJson): Uint8Array {
  const buffer = new ArrayBuffer(8 + 4 + 12);
  const dvbuf = new DataView(buffer);
  const u8buf = new Uint8Array(buffer);
  const curr = stringToBytes(amount.currency);
  if (typeof dvbuf.setBigUint64 !== "undefined") {
    dvbuf.setBigUint64(0, BigInt(amount.value));
  } else {
    const arr = bigint(amount.value).toArray(2 ** 8).value;
    let offset = 8 - arr.length;
    for (let i = 0; i < arr.length; i++) {
      dvbuf.setUint8(offset++, arr[i]);
    }
  }
  dvbuf.setUint32(8, amount.fraction);
  u8buf.set(curr, 8 + 4);

  return u8buf;
}

function timestampRoundedToBuffer(ts: Timestamp): Uint8Array {
  const b = new ArrayBuffer(8);
  const v = new DataView(b);
  const tsRounded = timestampTruncateToSecond(ts);
  if (typeof v.setBigUint64 !== "undefined") {
    const s = BigInt(tsRounded.t_ms) * BigInt(1000);
    v.setBigUint64(0, s);
  } else {
    const s =
      tsRounded.t_ms === "never"
        ? bigint.zero
        : bigint(tsRounded.t_ms).times(1000);
    const arr = s.toArray(2 ** 8).value;
    let offset = 8 - arr.length;
    for (let i = 0; i < arr.length; i++) {
      v.setUint8(offset++, arr[i]);
    }
  }
  return new Uint8Array(b);
}

export interface PrimitiveWorker {
  setupRefreshPlanchet(arg0: {
    transfer_secret: string;
    coin_index: number;
  }): Promise<{
    coin_pub: string;
    coin_priv: string;
    blinding_key: string;
  }>;
  eddsaVerify(req: {
    msg: string;
    sig: string;
    pub: string;
  }): Promise<{ valid: boolean }>;
}

export class CryptoImplementation {
  static enableTracing = false;

  constructor(private primitiveWorker?: PrimitiveWorker) {}

  /**
   * Create a pre-coin of the given denomination to be withdrawn from then given
   * reserve.
   */
  createPlanchet(req: PlanchetCreationRequest): PlanchetCreationResult {
    if (req.denomPub.cipher !== 1) {
      throw Error("unsupported cipher");
    }
    const reservePub = decodeCrock(req.reservePub);
    const reservePriv = decodeCrock(req.reservePriv);
    const denomPubRsa = decodeCrock(req.denomPub.rsa_public_key);
    const derivedPlanchet = setupWithdrawPlanchet(
      decodeCrock(req.secretSeed),
      req.coinIndex,
    );
    const coinPubHash = hash(derivedPlanchet.coinPub);
    const ev = rsaBlind(coinPubHash, derivedPlanchet.bks, denomPubRsa);
    const amountWithFee = Amounts.add(req.value, req.feeWithdraw).amount;
    const denomPubHash = hashDenomPub(req.denomPub);
    const evHash = hash(ev);

    const withdrawRequest = buildSigPS(
      TalerSignaturePurpose.WALLET_RESERVE_WITHDRAW,
    )
      .put(reservePub)
      .put(amountToBuffer(amountWithFee))
      .put(denomPubHash)
      .put(evHash)
      .build();

    const sig = eddsaSign(withdrawRequest, reservePriv);

    const planchet: PlanchetCreationResult = {
      blindingKey: encodeCrock(derivedPlanchet.bks),
      coinEv: encodeCrock(ev),
      coinPriv: encodeCrock(derivedPlanchet.coinPriv),
      coinPub: encodeCrock(derivedPlanchet.coinPub),
      coinValue: req.value,
      denomPub: {
        cipher: 1,
        rsa_public_key: encodeCrock(denomPubRsa),
      },
      denomPubHash: encodeCrock(denomPubHash),
      reservePub: encodeCrock(reservePub),
      withdrawSig: encodeCrock(sig),
      coinEvHash: encodeCrock(evHash),
    };
    return planchet;
  }

  /**
   * Create a planchet used for tipping, including the private keys.
   */
  createTipPlanchet(req: DeriveTipRequest): DerivedTipPlanchet {
    if (req.denomPub.cipher !== 1) {
      throw Error("unsupported cipher");
    }
    const fc = setupTipPlanchet(decodeCrock(req.secretSeed), req.planchetIndex);
    const denomPub = decodeCrock(req.denomPub.rsa_public_key);
    const coinPubHash = hash(fc.coinPub);
    const ev = rsaBlind(coinPubHash, fc.bks, denomPub);

    const tipPlanchet: DerivedTipPlanchet = {
      blindingKey: encodeCrock(fc.bks),
      coinEv: encodeCrock(ev),
      coinEvHash: encodeCrock(hash(ev)),
      coinPriv: encodeCrock(fc.coinPriv),
      coinPub: encodeCrock(fc.coinPub),
    };
    return tipPlanchet;
  }

  signTrackTransaction(req: SignTrackTransactionRequest): string {
    const p = buildSigPS(TalerSignaturePurpose.MERCHANT_TRACK_TRANSACTION)
      .put(decodeCrock(req.contractTermsHash))
      .put(decodeCrock(req.wireHash))
      .put(decodeCrock(req.merchantPub))
      .put(decodeCrock(req.coinPub))
      .build();
    return encodeCrock(eddsaSign(p, decodeCrock(req.merchantPriv)));
  }

  /**
   * Create and sign a message to recoup a coin.
   */
  createRecoupRequest(coin: CoinRecord): RecoupRequest {
    const p = buildSigPS(TalerSignaturePurpose.WALLET_COIN_RECOUP)
      .put(decodeCrock(coin.coinPub))
      .put(decodeCrock(coin.denomPubHash))
      .put(decodeCrock(coin.blindingKey))
      .build();

    const coinPriv = decodeCrock(coin.coinPriv);
    const coinSig = eddsaSign(p, coinPriv);
    const paybackRequest: RecoupRequest = {
      coin_blind_key_secret: coin.blindingKey,
      coin_pub: coin.coinPub,
      coin_sig: encodeCrock(coinSig),
      denom_pub_hash: coin.denomPubHash,
      denom_sig: coin.denomSig,
      refreshed: coin.coinSource.type === CoinSourceType.Refresh,
    };
    return paybackRequest;
  }

  /**
   * Check if a payment signature is valid.
   */
  isValidPaymentSignature(
    sig: string,
    contractHash: string,
    merchantPub: string,
  ): boolean {
    const p = buildSigPS(TalerSignaturePurpose.MERCHANT_PAYMENT_OK)
      .put(decodeCrock(contractHash))
      .build();
    const sigBytes = decodeCrock(sig);
    const pubBytes = decodeCrock(merchantPub);
    return eddsaVerify(p, sigBytes, pubBytes);
  }

  /**
   * Check if a wire fee is correctly signed.
   */
  async isValidWireFee(
    type: string,
    wf: WireFee,
    masterPub: string,
  ): Promise<boolean> {
    const p = buildSigPS(TalerSignaturePurpose.MASTER_WIRE_FEES)
      .put(hash(stringToBytes(type + "\0")))
      .put(timestampRoundedToBuffer(wf.startStamp))
      .put(timestampRoundedToBuffer(wf.endStamp))
      .put(amountToBuffer(wf.wireFee))
      .put(amountToBuffer(wf.closingFee))
      .build();
    const sig = decodeCrock(wf.sig);
    const pub = decodeCrock(masterPub);
    if (this.primitiveWorker) {
      return (
        await this.primitiveWorker.eddsaVerify({
          msg: encodeCrock(p),
          pub: masterPub,
          sig: encodeCrock(sig),
        })
      ).valid;
    }
    return eddsaVerify(p, sig, pub);
  }

  /**
   * Check if the signature of a denomination is valid.
   */
  async isValidDenom(
    denom: DenominationRecord,
    masterPub: string,
  ): Promise<boolean> {
    const p = buildSigPS(TalerSignaturePurpose.MASTER_DENOMINATION_KEY_VALIDITY)
      .put(decodeCrock(masterPub))
      .put(timestampRoundedToBuffer(denom.stampStart))
      .put(timestampRoundedToBuffer(denom.stampExpireWithdraw))
      .put(timestampRoundedToBuffer(denom.stampExpireDeposit))
      .put(timestampRoundedToBuffer(denom.stampExpireLegal))
      .put(amountToBuffer(denom.value))
      .put(amountToBuffer(denom.feeWithdraw))
      .put(amountToBuffer(denom.feeDeposit))
      .put(amountToBuffer(denom.feeRefresh))
      .put(amountToBuffer(denom.feeRefund))
      .put(decodeCrock(denom.denomPubHash))
      .build();
    const sig = decodeCrock(denom.masterSig);
    const pub = decodeCrock(masterPub);
    const res = eddsaVerify(p, sig, pub);
    return res;
  }

  isValidWireAccount(
    paytoUri: string,
    sig: string,
    masterPub: string,
  ): boolean {
    const paytoHash = hash(stringToBytes(paytoUri + "\0"));
    const p = buildSigPS(TalerSignaturePurpose.MASTER_WIRE_DETAILS)
      .put(paytoHash)
      .build();
    return eddsaVerify(p, decodeCrock(sig), decodeCrock(masterPub));
  }

  isValidContractTermsSignature(
    contractTermsHash: string,
    sig: string,
    merchantPub: string,
  ): boolean {
    const cthDec = decodeCrock(contractTermsHash);
    const p = buildSigPS(TalerSignaturePurpose.MERCHANT_CONTRACT)
      .put(cthDec)
      .build();
    return eddsaVerify(p, decodeCrock(sig), decodeCrock(merchantPub));
  }

  /**
   * Create a new EdDSA key pair.
   */
  createEddsaKeypair(): { priv: string; pub: string } {
    const pair = createEddsaKeyPair();
    return {
      priv: encodeCrock(pair.eddsaPriv),
      pub: encodeCrock(pair.eddsaPub),
    };
  }

  eddsaGetPublic(key: string): { priv: string; pub: string } {
    return {
      priv: key,
      pub: encodeCrock(eddsaGetPublic(decodeCrock(key))),
    };
  }

  /**
   * Unblind a blindly signed value.
   */
  rsaUnblind(blindedSig: string, bk: string, pk: string): string {
    const denomSig = rsaUnblind(
      decodeCrock(blindedSig),
      decodeCrock(pk),
      decodeCrock(bk),
    );
    return encodeCrock(denomSig);
  }

  /**
   * Unblind a blindly signed value.
   */
  rsaVerify(hm: string, sig: string, pk: string): boolean {
    return rsaVerify(hash(decodeCrock(hm)), decodeCrock(sig), decodeCrock(pk));
  }

  /**
   * Generate updated coins (to store in the database)
   * and deposit permissions for each given coin.
   */
  signDepositPermission(depositInfo: DepositInfo): CoinDepositPermission {
    // FIXME: put extensions here if used
    const hExt = new Uint8Array(64);
    const d = buildSigPS(TalerSignaturePurpose.WALLET_COIN_DEPOSIT)
      .put(decodeCrock(depositInfo.contractTermsHash))
      .put(hExt)
      .put(decodeCrock(depositInfo.wireInfoHash))
      .put(decodeCrock(depositInfo.denomPubHash))
      .put(timestampRoundedToBuffer(depositInfo.timestamp))
      .put(timestampRoundedToBuffer(depositInfo.refundDeadline))
      .put(amountToBuffer(depositInfo.spendAmount))
      .put(amountToBuffer(depositInfo.feeDeposit))
      .put(decodeCrock(depositInfo.merchantPub))
      .build();
    const coinSig = eddsaSign(d, decodeCrock(depositInfo.coinPriv));

    const s: CoinDepositPermission = {
      coin_pub: depositInfo.coinPub,
      coin_sig: encodeCrock(coinSig),
      contribution: Amounts.stringify(depositInfo.spendAmount),
      h_denom: depositInfo.denomPubHash,
      exchange_url: depositInfo.exchangeBaseUrl,
      ub_sig: {
        cipher: DenomKeyType.Rsa,
        rsa_signature: depositInfo.denomSig.rsa_signature,
      },
    };
    return s;
  }

  async deriveRefreshSession(
    req: DeriveRefreshSessionRequest,
  ): Promise<DerivedRefreshSession> {
    const {
      newCoinDenoms,
      feeRefresh: meltFee,
      kappa,
      meltCoinDenomPubHash,
      meltCoinPriv,
      meltCoinPub,
      sessionSecretSeed: refreshSessionSecretSeed,
    } = req;

    const currency = newCoinDenoms[0].value.currency;
    let valueWithFee = Amounts.getZero(currency);

    for (const ncd of newCoinDenoms) {
      const t = Amounts.add(ncd.value, ncd.feeWithdraw).amount;
      valueWithFee = Amounts.add(
        valueWithFee,
        Amounts.mult(t, ncd.count).amount,
      ).amount;
    }

    // melt fee
    valueWithFee = Amounts.add(valueWithFee, meltFee).amount;

    const sessionHc = createHashContext();

    const transferPubs: string[] = [];
    const transferPrivs: string[] = [];

    const planchetsForGammas: RefreshPlanchetInfo[][] = [];

    for (let i = 0; i < kappa; i++) {
      const transferKeyPair = setupRefreshTransferPub(
        decodeCrock(refreshSessionSecretSeed),
        i,
      );
      sessionHc.update(transferKeyPair.ecdhePub);
      transferPrivs.push(encodeCrock(transferKeyPair.ecdhePriv));
      transferPubs.push(encodeCrock(transferKeyPair.ecdhePub));
    }

    for (const denomSel of newCoinDenoms) {
      for (let i = 0; i < denomSel.count; i++) {
        if (denomSel.denomPub.cipher !== 1) {
          throw Error("unsupported cipher");
        }
        sessionHc.update(hashDenomPub(denomSel.denomPub));
      }
    }

    sessionHc.update(decodeCrock(meltCoinPub));
    sessionHc.update(amountToBuffer(valueWithFee));
    for (let i = 0; i < kappa; i++) {
      const planchets: RefreshPlanchetInfo[] = [];
      for (let j = 0; j < newCoinDenoms.length; j++) {
        const denomSel = newCoinDenoms[j];
        for (let k = 0; k < denomSel.count; k++) {
          const coinIndex = planchets.length;
          const transferPriv = decodeCrock(transferPrivs[i]);
          const oldCoinPub = decodeCrock(meltCoinPub);
          const transferSecret = keyExchangeEcdheEddsa(
            transferPriv,
            oldCoinPub,
          );
          let coinPub: Uint8Array;
          let coinPriv: Uint8Array;
          let blindingFactor: Uint8Array;
          if (this.primitiveWorker) {
            const r = await this.primitiveWorker.setupRefreshPlanchet({
              transfer_secret: encodeCrock(transferSecret),
              coin_index: coinIndex,
            });
            coinPub = decodeCrock(r.coin_pub);
            coinPriv = decodeCrock(r.coin_priv);
            blindingFactor = decodeCrock(r.blinding_key);
          } else {
            let fresh: FreshCoin = setupRefreshPlanchet(
              transferSecret,
              coinIndex,
            );
            coinPriv = fresh.coinPriv;
            coinPub = fresh.coinPub;
            blindingFactor = fresh.bks;
          }
          const pubHash = hash(coinPub);
          if (denomSel.denomPub.cipher !== 1) {
            throw Error("unsupported cipher");
          }
          const denomPub = decodeCrock(denomSel.denomPub.rsa_public_key);
          const ev = rsaBlind(pubHash, blindingFactor, denomPub);
          const planchet: RefreshPlanchetInfo = {
            blindingKey: encodeCrock(blindingFactor),
            coinEv: encodeCrock(ev),
            privateKey: encodeCrock(coinPriv),
            publicKey: encodeCrock(coinPub),
            coinEvHash: encodeCrock(hash(ev)),
          };
          planchets.push(planchet);
          sessionHc.update(ev);
        }
      }
      planchetsForGammas.push(planchets);
    }

    const sessionHash = sessionHc.finish();
    const confirmData = buildSigPS(TalerSignaturePurpose.WALLET_COIN_MELT)
      .put(sessionHash)
      .put(decodeCrock(meltCoinDenomPubHash))
      .put(amountToBuffer(valueWithFee))
      .put(amountToBuffer(meltFee))
      .put(decodeCrock(meltCoinPub))
      .build();

    const confirmSig = eddsaSign(confirmData, decodeCrock(meltCoinPriv));

    const refreshSession: DerivedRefreshSession = {
      confirmSig: encodeCrock(confirmSig),
      hash: encodeCrock(sessionHash),
      meltCoinPub: meltCoinPub,
      planchetsForGammas: planchetsForGammas,
      transferPrivs,
      transferPubs,
      meltValueWithFee: valueWithFee,
    };

    return refreshSession;
  }

  /**
   * Hash a string including the zero terminator.
   */
  hashString(str: string): string {
    const b = stringToBytes(str + "\0");
    return encodeCrock(hash(b));
  }

  /**
   * Hash a crockford encoded value.
   */
  hashEncoded(encodedBytes: string): string {
    return encodeCrock(hash(decodeCrock(encodedBytes)));
  }

  signCoinLink(
    oldCoinPriv: string,
    newDenomHash: string,
    oldCoinPub: string,
    transferPub: string,
    coinEv: string,
  ): string {
    const coinEvHash = hash(decodeCrock(coinEv));
    const coinLink = buildSigPS(TalerSignaturePurpose.WALLET_COIN_LINK)
      .put(decodeCrock(newDenomHash))
      .put(decodeCrock(transferPub))
      .put(coinEvHash)
      .build();
    const coinPriv = decodeCrock(oldCoinPriv);
    const sig = eddsaSign(coinLink, coinPriv);
    return encodeCrock(sig);
  }

  benchmark(repetitions: number): BenchmarkResult {
    let time_hash = BigInt(0);
    for (let i = 0; i < repetitions; i++) {
      const start = timer.performanceNow();
      this.hashString("hello world");
      time_hash += timer.performanceNow() - start;
    }

    let time_hash_big = BigInt(0);
    for (let i = 0; i < repetitions; i++) {
      const ba = randomBytes(4096);
      const start = timer.performanceNow();
      hash(ba);
      time_hash_big += timer.performanceNow() - start;
    }

    let time_eddsa_create = BigInt(0);
    for (let i = 0; i < repetitions; i++) {
      const start = timer.performanceNow();
      createEddsaKeyPair();
      time_eddsa_create += timer.performanceNow() - start;
    }

    let time_eddsa_sign = BigInt(0);
    const p = randomBytes(4096);

    const pair = createEddsaKeyPair();

    for (let i = 0; i < repetitions; i++) {
      const start = timer.performanceNow();
      eddsaSign(p, pair.eddsaPriv);
      time_eddsa_sign += timer.performanceNow() - start;
    }

    const sig = eddsaSign(p, pair.eddsaPriv);

    let time_eddsa_verify = BigInt(0);
    for (let i = 0; i < repetitions; i++) {
      const start = timer.performanceNow();
      eddsaVerify(p, sig, pair.eddsaPub);
      time_eddsa_verify += timer.performanceNow() - start;
    }

    return {
      repetitions,
      time: {
        hash_small: Number(time_hash),
        hash_big: Number(time_hash_big),
        eddsa_create: Number(time_eddsa_create),
        eddsa_sign: Number(time_eddsa_sign),
        eddsa_verify: Number(time_eddsa_verify),
      },
    };
  }

  makeSyncSignature(req: MakeSyncSignatureRequest): string {
    const hNew = decodeCrock(req.newHash);
    let hOld: Uint8Array;
    if (req.oldHash) {
      hOld = decodeCrock(req.oldHash);
    } else {
      hOld = new Uint8Array(64);
    }
    const sigBlob = buildSigPS(TalerSignaturePurpose.SYNC_BACKUP_UPLOAD)
      .put(hOld)
      .put(hNew)
      .build();
    const uploadSig = eddsaSign(sigBlob, decodeCrock(req.accountPriv));
    return encodeCrock(uploadSig);
  }
}
