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
 * Type declarations for the exchange's reserve transaction information.
 *
 * @author Florian Dold <dold@taler.net>
 */

/**
 * Imports.
 */
import {
  codecForString,
  buildCodecForObject,
  codecForConstString,
  buildCodecForUnion,
  Codec,
  codecForNumber,
} from "./codec.js";
import {
  AmountString,
  Base32String,
  EddsaSignatureString,
  EddsaPublicKeyString,
  CoinPublicKeyString,
} from "./talerTypes";
import { Timestamp, codecForTimestamp } from "./time.js";

export enum ReserveTransactionType {
  Withdraw = "WITHDRAW",
  Credit = "CREDIT",
  Recoup = "RECOUP",
  Closing = "CLOSING",
}

export interface ReserveWithdrawTransaction {
  type: ReserveTransactionType.Withdraw;

  /**
   * Amount withdrawn.
   */
  amount: AmountString;

  /**
   * Hash of the denomination public key of the coin.
   */
  h_denom_pub: Base32String;

  /**
   * Hash of the blinded coin to be signed
   */
  h_coin_envelope: Base32String;

  /**
   * Signature of 'TALER_WithdrawRequestPS' created with the reserves's
   * private key.
   */
  reserve_sig: EddsaSignatureString;

  /**
   * Fee that is charged for withdraw.
   */
  withdraw_fee: AmountString;
}

export interface ReserveCreditTransaction {
  type: ReserveTransactionType.Credit;

  /**
   * Amount withdrawn.
   */
  amount: AmountString;

  /**
   * Sender account payto://-URL
   */
  sender_account_url: string;

  /**
   * Transfer details uniquely identifying the transfer.
   */
  wire_reference: number;

  /**
   * Timestamp of the incoming wire transfer.
   */
  timestamp: Timestamp;
}

export interface ReserveClosingTransaction {
  type: ReserveTransactionType.Closing;

  /**
   * Closing balance.
   */
  amount: AmountString;

  /**
   * Closing fee charged by the exchange.
   */
  closing_fee: AmountString;

  /**
   * Wire transfer subject.
   */
  wtid: string;

  /**
   * Hash of the wire account into which the funds were returned to.
   */
  h_wire: string;

  /**
   * This is a signature over a
   * struct TALER_ReserveCloseConfirmationPS with purpose
   * TALER_SIGNATURE_EXCHANGE_RESERVE_CLOSED.
   */
  exchange_sig: EddsaSignatureString;

  /**
   * Public key used to create exchange_sig.
   */
  exchange_pub: EddsaPublicKeyString;

  /**
   * Time when the reserve was closed.
   */
  timestamp: Timestamp;
}

export interface ReserveRecoupTransaction {
  type: ReserveTransactionType.Recoup;

  /**
   * Amount paid back.
   */
  amount: AmountString;

  /**
   * This is a signature over
   * a struct TALER_PaybackConfirmationPS with purpose
   *  TALER_SIGNATURE_EXCHANGE_CONFIRM_PAYBACK.
   */
  exchange_sig: EddsaSignatureString;

  /**
   * Public key used to create exchange_sig.
   */
  exchange_pub: EddsaPublicKeyString;

  /**
   * Time when the funds were paid back into the reserve.
   */
  timestamp: Timestamp;

  /**
   * Public key of the coin that was paid back.
   */
  coin_pub: CoinPublicKeyString;
}

/**
 * Format of the exchange's transaction history for a reserve.
 */
export type ReserveTransaction =
  | ReserveWithdrawTransaction
  | ReserveCreditTransaction
  | ReserveClosingTransaction
  | ReserveRecoupTransaction;

export const codecForReserveWithdrawTransaction = (): Codec<ReserveWithdrawTransaction> =>
  buildCodecForObject<ReserveWithdrawTransaction>()
    .property("amount", codecForString())
    .property("h_coin_envelope", codecForString())
    .property("h_denom_pub", codecForString())
    .property("reserve_sig", codecForString())
    .property("type", codecForConstString(ReserveTransactionType.Withdraw))
    .property("withdraw_fee", codecForString())
    .build("ReserveWithdrawTransaction");

export const codecForReserveCreditTransaction = (): Codec<ReserveCreditTransaction> =>
  buildCodecForObject<ReserveCreditTransaction>()
    .property("amount", codecForString())
    .property("sender_account_url", codecForString())
    .property("timestamp", codecForTimestamp)
    .property("wire_reference", codecForNumber())
    .property("type", codecForConstString(ReserveTransactionType.Credit))
    .build("ReserveCreditTransaction");

export const codecForReserveClosingTransaction = (): Codec<ReserveClosingTransaction> =>
  buildCodecForObject<ReserveClosingTransaction>()
    .property("amount", codecForString())
    .property("closing_fee", codecForString())
    .property("exchange_pub", codecForString())
    .property("exchange_sig", codecForString())
    .property("h_wire", codecForString())
    .property("timestamp", codecForTimestamp)
    .property("type", codecForConstString(ReserveTransactionType.Closing))
    .property("wtid", codecForString())
    .build("ReserveClosingTransaction");

export const codecForReserveRecoupTransaction = (): Codec<ReserveRecoupTransaction> =>
  buildCodecForObject<ReserveRecoupTransaction>()
    .property("amount", codecForString())
    .property("coin_pub", codecForString())
    .property("exchange_pub", codecForString())
    .property("exchange_sig", codecForString())
    .property("timestamp", codecForTimestamp)
    .property("type", codecForConstString(ReserveTransactionType.Recoup))
    .build("ReserveRecoupTransaction");

export const codecForReserveTransaction = (): Codec<ReserveTransaction> =>
  buildCodecForUnion<ReserveTransaction>()
    .discriminateOn("type")
    .alternative(
      ReserveTransactionType.Withdraw,
      codecForReserveWithdrawTransaction(),
    )
    .alternative(
      ReserveTransactionType.Closing,
      codecForReserveClosingTransaction(),
    )
    .alternative(
      ReserveTransactionType.Recoup,
      codecForReserveRecoupTransaction(),
    )
    .alternative(
      ReserveTransactionType.Credit,
      codecForReserveCreditTransaction(),
    )
    .build<ReserveTransaction>("ReserveTransaction");
