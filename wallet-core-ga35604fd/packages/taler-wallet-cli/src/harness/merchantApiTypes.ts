/*
 This file is part of GNU Taler
 (C) 2020 Taler Systems S.A.

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
 * Test harness for various GNU Taler components.
 * Also provides a fault-injection proxy.
 *
 * @author Florian Dold <dold@taler.net>
 */

/**
 * Imports.
 */
import {
  ContractTerms,
  Duration,
  Codec,
  buildCodecForObject,
  codecForString,
  codecOptional,
  codecForConstString,
  codecForBoolean,
  codecForNumber,
  codecForContractTerms,
  codecForAny,
  buildCodecForUnion,
  AmountString,
  Timestamp,
  CoinPublicKeyString,
  EddsaPublicKeyString,
  codecForAmountString,
} from "@gnu-taler/taler-util";

export interface PostOrderRequest {
  // The order must at least contain the minimal
  // order detail, but can override all
  order: Partial<ContractTerms>;

  // if set, the backend will then set the refund deadline to the current
  // time plus the specified delay.
  refund_delay?: Duration;

  // specifies the payment target preferred by the client. Can be used
  // to select among the various (active) wire methods supported by the instance.
  payment_target?: string;

  // FIXME: some fields are missing

  // Should a token for claiming the order be generated?
  // False can make sense if the ORDER_ID is sufficiently
  // high entropy to prevent adversarial claims (like it is
  // if the backend auto-generates one). Default is 'true'.
  create_token?: boolean;
}

export type ClaimToken = string;

export interface PostOrderResponse {
  order_id: string;
  token?: ClaimToken;
}

export const codecForPostOrderResponse = (): Codec<PostOrderResponse> =>
  buildCodecForObject<PostOrderResponse>()
    .property("order_id", codecForString())
    .property("token", codecOptional(codecForString()))
    .build("PostOrderResponse");

export const codecForCheckPaymentPaidResponse = (): Codec<CheckPaymentPaidResponse> =>
  buildCodecForObject<CheckPaymentPaidResponse>()
    .property("order_status_url", codecForString())
    .property("order_status", codecForConstString("paid"))
    .property("refunded", codecForBoolean())
    .property("wired", codecForBoolean())
    .property("deposit_total", codecForAmountString())
    .property("exchange_ec", codecForNumber())
    .property("exchange_hc", codecForNumber())
    .property("refund_amount", codecForAmountString())
    .property("contract_terms", codecForContractTerms())
    // FIXME: specify
    .property("wire_details", codecForAny())
    .property("wire_reports", codecForAny())
    .property("refund_details", codecForAny())
    .build("CheckPaymentPaidResponse");

export const codecForCheckPaymentUnpaidResponse = (): Codec<CheckPaymentUnpaidResponse> =>
  buildCodecForObject<CheckPaymentUnpaidResponse>()
    .property("order_status", codecForConstString("unpaid"))
    .property("taler_pay_uri", codecForString())
    .property("order_status_url", codecForString())
    .property("already_paid_order_id", codecOptional(codecForString()))
    .build("CheckPaymentPaidResponse");

export const codecForCheckPaymentClaimedResponse = (): Codec<CheckPaymentClaimedResponse> =>
  buildCodecForObject<CheckPaymentClaimedResponse>()
    .property("order_status", codecForConstString("claimed"))
    .property("contract_terms", codecForContractTerms())
    .build("CheckPaymentClaimedResponse");

export const codecForMerchantOrderPrivateStatusResponse = (): Codec<MerchantOrderPrivateStatusResponse> =>
  buildCodecForUnion<MerchantOrderPrivateStatusResponse>()
    .discriminateOn("order_status")
    .alternative("paid", codecForCheckPaymentPaidResponse())
    .alternative("unpaid", codecForCheckPaymentUnpaidResponse())
    .alternative("claimed", codecForCheckPaymentClaimedResponse())
    .build("MerchantOrderPrivateStatusResponse");

export type MerchantOrderPrivateStatusResponse =
  | CheckPaymentPaidResponse
  | CheckPaymentUnpaidResponse
  | CheckPaymentClaimedResponse;

export interface CheckPaymentClaimedResponse {
  // Wallet claimed the order, but didn't pay yet.
  order_status: "claimed";

  contract_terms: ContractTerms;
}

export interface CheckPaymentPaidResponse {
  // did the customer pay for this contract
  order_status: "paid";

  // Was the payment refunded (even partially)
  refunded: boolean;

  // Did the exchange wire us the funds
  wired: boolean;

  // Total amount the exchange deposited into our bank account
  // for this contract, excluding fees.
  deposit_total: AmountString;

  // Numeric error code indicating errors the exchange
  // encountered tracking the wire transfer for this purchase (before
  // we even got to specific coin issues).
  // 0 if there were no issues.
  exchange_ec: number;

  // HTTP status code returned by the exchange when we asked for
  // information to track the wire transfer for this purchase.
  // 0 if there were no issues.
  exchange_hc: number;

  // Total amount that was refunded, 0 if refunded is false.
  refund_amount: AmountString;

  // Contract terms
  contract_terms: ContractTerms;

  // Ihe wire transfer status from the exchange for this order if available, otherwise empty array
  wire_details: TransactionWireTransfer[];

  // Reports about trouble obtaining wire transfer details, empty array if no trouble were encountered.
  wire_reports: TransactionWireReport[];

  // The refund details for this order.  One entry per
  // refunded coin; empty array if there are no refunds.
  refund_details: RefundDetails[];

  order_status_url: string;
}

export interface CheckPaymentUnpaidResponse {
  order_status: "unpaid";

  // URI that the wallet must process to complete the payment.
  taler_pay_uri: string;

  order_status_url: string;

  // Alternative order ID which was paid for already in the same session.
  // Only given if the same product was purchased before in the same session.
  already_paid_order_id?: string;

  // We do we NOT return the contract terms here because they may not
  // exist in case the wallet did not yet claim them.
}

export interface RefundDetails {
  // Reason given for the refund
  reason: string;

  // when was the refund approved
  timestamp: Timestamp;

  // Total amount that was refunded (minus a refund fee).
  amount: AmountString;
}

export interface TransactionWireTransfer {
  // Responsible exchange
  exchange_url: string;

  // 32-byte wire transfer identifier
  wtid: string;

  // execution time of the wire transfer
  execution_time: Timestamp;

  // Total amount that has been wire transferred
  // to the merchant
  amount: AmountString;

  // Was this transfer confirmed by the merchant via the
  // POST /transfers API, or is it merely claimed by the exchange?
  confirmed: boolean;
}

export interface TransactionWireReport {
  // Numerical error code
  code: number;

  // Human-readable error description
  hint: string;

  // Numerical error code from the exchange.
  exchange_ec: number;

  // HTTP status code received from the exchange.
  exchange_hc: number;

  // Public key of the coin for which we got the exchange error.
  coin_pub: CoinPublicKeyString;
}

export interface TippingReserveStatus {
  // Array of all known reserves (possibly empty!)
  reserves: ReserveStatusEntry[];
}

export interface ReserveStatusEntry {
  // Public key of the reserve
  reserve_pub: string;

  // Timestamp when it was established
  creation_time: Timestamp;

  // Timestamp when it expires
  expiration_time: Timestamp;

  // Initial amount as per reserve creation call
  merchant_initial_amount: AmountString;

  // Initial amount as per exchange, 0 if exchange did
  // not confirm reserve creation yet.
  exchange_initial_amount: AmountString;

  // Amount picked up so far.
  pickup_amount: AmountString;

  // Amount approved for tips that exceeds the pickup_amount.
  committed_amount: AmountString;

  // Is this reserve active (false if it was deleted but not purged)
  active: boolean;
}

export interface TipCreateConfirmation {
  // Unique tip identifier for the tip that was created.
  tip_id: string;

  // taler://tip URI for the tip
  taler_tip_uri: string;

  // URL that will directly trigger processing
  // the tip when the browser is redirected to it
  tip_status_url: string;

  // when does the tip expire
  tip_expiration: Timestamp;
}

export interface TipCreateRequest {
  // Amount that the customer should be tipped
  amount: AmountString;

  // Justification for giving the tip
  justification: string;

  // URL that the user should be directed to after tipping,
  // will be included in the tip_token.
  next_url: string;
}

export interface MerchantInstancesResponse {
  // List of instances that are present in the backend (see Instance)
  instances: MerchantInstanceDetail[];
}

export interface MerchantInstanceDetail {
  // Merchant name corresponding to this instance.
  name: string;

  // Merchant instance this response is about ($INSTANCE)
  id: string;

  // Public key of the merchant/instance, in Crockford Base32 encoding.
  merchant_pub: EddsaPublicKeyString;

  // List of the payment targets supported by this instance. Clients can
  // specify the desired payment target in /order requests.  Note that
  // front-ends do not have to support wallets selecting payment targets.
  payment_targets: string[];
}
