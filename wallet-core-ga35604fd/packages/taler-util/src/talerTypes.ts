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
 * Type and schema definitions and helpers for the core GNU Taler protocol.
 *
 * Even though the rest of the wallet uses camelCase for fields, use snake_case
 * here, since that's the convention for the Taler JSON+HTTP API.
 */

/**
 * Imports.
 */

import {
  buildCodecForObject,
  codecForString,
  codecForList,
  codecOptional,
  codecForAny,
  codecForNumber,
  codecForBoolean,
  codecForMap,
  Codec,
  codecForConstNumber,
  buildCodecForUnion,
  codecForConstString,
} from "./codec.js";
import {
  Timestamp,
  codecForTimestamp,
  Duration,
  codecForDuration,
} from "./time.js";
import { codecForAmountString } from "./amounts.js";

/**
 * Denomination as found in the /keys response from the exchange.
 */
export class Denomination {
  /**
   * Value of one coin of the denomination.
   */
  value: string;

  /**
   * Public signing key of the denomination.
   */
  denom_pub: DenominationPubKey;

  /**
   * Fee for withdrawing.
   */
  fee_withdraw: string;

  /**
   * Fee for depositing.
   */
  fee_deposit: string;

  /**
   * Fee for refreshing.
   */
  fee_refresh: string;

  /**
   * Fee for refunding.
   */
  fee_refund: string;

  /**
   * Start date from which withdraw is allowed.
   */
  stamp_start: Timestamp;

  /**
   * End date for withdrawing.
   */
  stamp_expire_withdraw: Timestamp;

  /**
   * Expiration date after which the exchange can forget about
   * the currency.
   */
  stamp_expire_legal: Timestamp;

  /**
   * Date after which the coins of this denomination can't be
   * deposited anymore.
   */
  stamp_expire_deposit: Timestamp;

  /**
   * Signature over the denomination information by the exchange's master
   * signing key.
   */
  master_sig: string;
}

/**
 * Signature by the auditor that a particular denomination key is audited.
 */
export class AuditorDenomSig {
  /**
   * Denomination public key's hash.
   */
  denom_pub_h: string;

  /**
   * The signature.
   */
  auditor_sig: string;
}

/**
 * Auditor information as given by the exchange in /keys.
 */
export class Auditor {
  /**
   * Auditor's public key.
   */
  auditor_pub: string;

  /**
   * Base URL of the auditor.
   */
  auditor_url: string;

  /**
   * List of signatures for denominations by the auditor.
   */
  denomination_keys: AuditorDenomSig[];
}

/**
 * Request that we send to the exchange to get a payback.
 */
export interface RecoupRequest {
  /**
   * Hashed enomination public key of the coin we want to get
   * paid back.
   */
  denom_pub_hash: string;

  /**
   * Signature over the coin public key by the denomination.
   */
  denom_sig: UnblindedSignature;

  /**
   * Coin public key of the coin we want to refund.
   */
  coin_pub: string;

  /**
   * Blinding key that was used during withdraw,
   * used to prove that we were actually withdrawing the coin.
   */
  coin_blind_key_secret: string;

  /**
   * Signature made by the coin, authorizing the payback.
   */
  coin_sig: string;

  /**
   * Was the coin refreshed (and thus the recoup should go to the old coin)?
   */
  refreshed: boolean;
}

/**
 * Response that we get from the exchange for a payback request.
 */
export interface RecoupConfirmation {
  /**
   * Public key of the reserve that will receive the payback.
   */
  reserve_pub?: string;

  /**
   * Public key of the old coin that will receive the recoup,
   * provided if refreshed was true.
   */
  old_coin_pub?: string;
}

export interface UnblindedSignature {
  cipher: DenomKeyType.Rsa;
  rsa_signature: string;
}

/**
 * Deposit permission for a single coin.
 */
export interface CoinDepositPermission {
  /**
   * Signature by the coin.
   */
  coin_sig: string;
  /**
   * Public key of the coin being spend.
   */
  coin_pub: string;
  /**
   * Signature made by the denomination public key.
   */
  ub_sig: UnblindedSignature;
  /**
   * The denomination public key associated with this coin.
   */
  h_denom: string;
  /**
   * The amount that is subtracted from this coin with this payment.
   */
  contribution: string;

  /**
   * URL of the exchange this coin was withdrawn from.
   */
  exchange_url: string;
}

/**
 * Information about an exchange as stored inside a
 * merchant's contract terms.
 */
export interface ExchangeHandle {
  /**
   * Master public signing key of the exchange.
   */
  master_pub: string;

  /**
   * Base URL of the exchange.
   */
  url: string;
}

export interface AuditorHandle {
  /**
   * Official name of the auditor.
   */
  name: string;

  /**
   * Master public signing key of the auditor.
   */
  auditor_pub: string;

  /**
   * Base URL of the auditor.
   */
  url: string;
}

// Delivery location, loosely modeled as a subset of
// ISO20022's PostalAddress25.
export interface Location {
  // Nation with its own government.
  country?: string;

  // Identifies a subdivision of a country such as state, region, county.
  country_subdivision?: string;

  // Identifies a subdivision within a country sub-division.
  district?: string;

  // Name of a built-up area, with defined boundaries, and a local government.
  town?: string;

  // Specific location name within the town.
  town_location?: string;

  // Identifier consisting of a group of letters and/or numbers that
  // is added to a postal address to assist the sorting of mail.
  post_code?: string;

  // Name of a street or thoroughfare.
  street?: string;

  // Name of the building or house.
  building_name?: string;

  // Number that identifies the position of a building on a street.
  building_number?: string;

  // Free-form address lines, should not exceed 7 elements.
  address_lines?: string[];
}

export interface MerchantInfo {
  name: string;
  jurisdiction?: Location;
  address?: Location;
}

export interface Tax {
  // the name of the tax
  name: string;

  // amount paid in tax
  tax: AmountString;
}

export interface Product {
  // merchant-internal identifier for the product.
  product_id?: string;

  // Human-readable product description.
  description: string;

  // Map from IETF BCP 47 language tags to localized descriptions
  description_i18n?: { [lang_tag: string]: string };

  // The number of units of the product to deliver to the customer.
  quantity?: number;

  // The unit in which the product is measured (liters, kilograms, packages, etc.)
  unit?: string;

  // The price of the product; this is the total price for quantity times unit of this product.
  price?: AmountString;

  // An optional base64-encoded product image
  image?: string;

  // a list of taxes paid by the merchant for this product. Can be empty.
  taxes?: Tax[];

  // time indicating when this product should be delivered
  delivery_date?: Timestamp;
}

export interface InternationalizedString {
  [lang_tag: string]: string;
}

/**
 * Contract terms from a merchant.
 */
export interface ContractTerms {
  /**
   * Hash of the merchant's wire details.
   */
  h_wire: string;

  /**
   * Hash of the merchant's wire details.
   */
  auto_refund?: Duration;

  /**
   * Wire method the merchant wants to use.
   */
  wire_method: string;

  /**
   * Human-readable short summary of the contract.
   */
  summary: string;

  summary_i18n?: InternationalizedString;

  /**
   * Nonce used to ensure freshness.
   */
  nonce: string;

  /**
   * Total amount payable.
   */
  amount: string;

  /**
   * Auditors accepted by the merchant.
   */
  auditors: AuditorHandle[];

  /**
   * Deadline to pay for the contract.
   */
  pay_deadline: Timestamp;

  /**
   * Maximum deposit fee covered by the merchant.
   */
  max_fee: string;

  /**
   * Information about the merchant.
   */
  merchant: MerchantInfo;

  /**
   * Public key of the merchant.
   */
  merchant_pub: string;

  /**
   * Time indicating when the order should be delivered.
   * May be overwritten by individual products.
   */
  delivery_date?: Timestamp;

  /**
   * Delivery location for (all!) products.
   */
  delivery_location?: Location;

  /**
   * List of accepted exchanges.
   */
  exchanges: ExchangeHandle[];

  /**
   * Products that are sold in this contract.
   */
  products?: Product[];

  /**
   * Deadline for refunds.
   */
  refund_deadline: Timestamp;

  /**
   * Deadline for the wire transfer.
   */
  wire_transfer_deadline: Timestamp;

  /**
   * Time when the contract was generated by the merchant.
   */
  timestamp: Timestamp;

  /**
   * Order id to uniquely identify the purchase within
   * one merchant instance.
   */
  order_id: string;

  /**
   * Base URL of the merchant's backend.
   */
  merchant_base_url: string;

  /**
   * Fulfillment URL to view the product or
   * delivery status.
   */
  fulfillment_url?: string;

  /**
   * URL meant to share the shopping cart.
   */
  public_reorder_url?: string;

  /**
   * Plain text fulfillment message in the merchant's default language.
   */
  fulfillment_message?: string;

  /**
   * Internationalized fulfillment messages.
   */
  fulfillment_message_i18n?: InternationalizedString;

  /**
   * Share of the wire fee that must be settled with one payment.
   */
  wire_fee_amortization?: number;

  /**
   * Maximum wire fee that the merchant agrees to pay for.
   */
  max_wire_fee?: string;

  /**
   * Extra data, interpreted by the mechant only.
   */
  extra?: any;
}

/**
 * Refund permission in the format that the merchant gives it to us.
 */
export interface MerchantAbortPayRefundDetails {
  /**
   * Amount to be refunded.
   */
  refund_amount: string;

  /**
   * Fee for the refund.
   */
  refund_fee: string;

  /**
   * Public key of the coin being refunded.
   */
  coin_pub: string;

  /**
   * Refund transaction ID between merchant and exchange.
   */
  rtransaction_id: number;

  /**
   * Exchange's key used for the signature.
   */
  exchange_pub?: string;

  /**
   * Exchange's signature to confirm the refund.
   */
  exchange_sig?: string;

  /**
   * Error replay from the exchange (if any).
   */
  exchange_reply?: any;

  /**
   * Error code from the exchange (if any).
   */
  exchange_code?: number;

  /**
   * HTTP status code of the exchange's response
   * to the merchant's refund request.
   */
  exchange_http_status: number;
}

/**
 * Response for a refund pickup or a /pay in abort mode.
 */
export interface MerchantRefundResponse {
  /**
   * Public key of the merchant
   */
  merchant_pub: string;

  /**
   * Contract terms hash of the contract that
   * is being refunded.
   */
  h_contract_terms: string;

  /**
   * The signed refund permissions, to be sent to the exchange.
   */
  refunds: MerchantAbortPayRefundDetails[];
}

/**
 * Planchet detail sent to the merchant.
 */
export interface TipPlanchetDetail {
  /**
   * Hashed denomination public key.
   */
  denom_pub_hash: string;

  /**
   * Coin's blinded public key.
   */
  coin_ev: string;
}

/**
 * Request sent to the merchant to pick up a tip.
 */
export interface TipPickupRequest {
  /**
   * Identifier of the tip.
   */
  tip_id: string;

  /**
   * List of planchets the wallet wants to use for the tip.
   */
  planchets: TipPlanchetDetail[];
}

/**
 * Reserve signature, defined as separate class to facilitate
 * schema validation with "@Checkable".
 */
export interface BlindSigWrapper {
  /**
   * Reserve signature.
   */
  blind_sig: string;
}

/**
 * Response of the merchant
 * to the TipPickupRequest.
 */
export interface TipResponse {
  /**
   * The order of the signatures matches the planchets list.
   */
  blind_sigs: BlindSigWrapper[];
}

/**
 * Element of the payback list that the
 * exchange gives us in /keys.
 */
export class Recoup {
  /**
   * The hash of the denomination public key for which the payback is offered.
   */
  h_denom_pub: string;
}

/**
 * Structure of one exchange signing key in the /keys response.
 */
export class ExchangeSignKeyJson {
  stamp_start: Timestamp;
  stamp_expire: Timestamp;
  stamp_end: Timestamp;
  key: EddsaPublicKeyString;
  master_sig: EddsaSignatureString;
}

/**
 * Structure that the exchange gives us in /keys.
 */
export class ExchangeKeysJson {
  /**
   * List of offered denominations.
   */
  denoms: Denomination[];

  /**
   * The exchange's master public key.
   */
  master_public_key: string;

  /**
   * The list of auditors (partially) auditing the exchange.
   */
  auditors: Auditor[];

  /**
   * Timestamp when this response was issued.
   */
  list_issue_date: Timestamp;

  /**
   * List of revoked denominations.
   */
  recoup?: Recoup[];

  /**
   * Short-lived signing keys used to sign online
   * responses.
   */
  signkeys: ExchangeSignKeyJson[];

  /**
   * Protocol version.
   */
  version: string;

  reserve_closing_delay: Duration;
}

/**
 * Wire fees as announced by the exchange.
 */
export class WireFeesJson {
  /**
   * Cost of a wire transfer.
   */
  wire_fee: string;

  /**
   * Cost of clising a reserve.
   */
  closing_fee: string;

  /**
   * Signature made with the exchange's master key.
   */
  sig: string;

  /**
   * Date from which the fee applies.
   */
  start_date: Timestamp;

  /**
   * Data after which the fee doesn't apply anymore.
   */
  end_date: Timestamp;
}

export interface AccountInfo {
  payto_uri: string;
  master_sig: string;
}

export interface ExchangeWireJson {
  accounts: AccountInfo[];
  fees: { [methodName: string]: WireFeesJson[] };
}

/**
 * Proposal returned from the contract URL.
 */
export class Proposal {
  /**
   * Contract terms for the propoal.
   * Raw, un-decoded JSON object.
   */
  contract_terms: any;

  /**
   * Signature over contract, made by the merchant.  The public key used for signing
   * must be contract_terms.merchant_pub.
   */
  sig: string;
}

/**
 * Response from the internal merchant API.
 */
export class CheckPaymentResponse {
  order_status: string;
  refunded: boolean | undefined;
  refunded_amount: string | undefined;
  contract_terms: any | undefined;
  taler_pay_uri: string | undefined;
  contract_url: string | undefined;
}

/**
 * Response from the bank.
 */
export class WithdrawOperationStatusResponse {
  selection_done: boolean;

  transfer_done: boolean;

  aborted: boolean;

  amount: string;

  sender_wire?: string;

  suggested_exchange?: string;

  confirm_transfer_url?: string;

  wire_types: string[];
}

/**
 * Response from the merchant.
 */
export class TipPickupGetResponse {
  tip_amount: string;

  exchange_url: string;

  expiration: Timestamp;
}

export enum DenomKeyType {
  Rsa = 1,
  ClauseSchnorr = 2,
}

export interface RsaBlindedDenominationSignature {
  cipher: DenomKeyType.Rsa;
  blinded_rsa_signature: string;
}

export interface CSBlindedDenominationSignature {
  cipher: DenomKeyType.ClauseSchnorr;
}

export type BlindedDenominationSignature =
  | RsaBlindedDenominationSignature
  | CSBlindedDenominationSignature;

export const codecForBlindedDenominationSignature = () =>
  buildCodecForUnion<BlindedDenominationSignature>()
    .discriminateOn("cipher")
    .alternative(1, codecForRsaBlindedDenominationSignature())
    .build("BlindedDenominationSignature");

export const codecForRsaBlindedDenominationSignature = () =>
  buildCodecForObject<RsaBlindedDenominationSignature>()
    .property("cipher", codecForConstNumber(1))
    .property("blinded_rsa_signature", codecForString())
    .build("RsaBlindedDenominationSignature");

export class WithdrawResponse {
  ev_sig: BlindedDenominationSignature;
}

/**
 * Easy to process format for the public data of coins
 * managed by the wallet.
 */
export interface CoinDumpJson {
  coins: Array<{
    /**
     * The coin's denomination's public key.
     */
    denom_pub: DenominationPubKey;
    /**
     * Hash of denom_pub.
     */
    denom_pub_hash: string;
    /**
     * Value of the denomination (without any fees).
     */
    denom_value: string;
    /**
     * Public key of the coin.
     */
    coin_pub: string;
    /**
     * Base URL of the exchange for the coin.
     */
    exchange_base_url: string;
    /**
     * Remaining value on the coin, to the knowledge of
     * the wallet.
     */
    remaining_value: string;
    /**
     * Public key of the parent coin.
     * Only present if this coin was obtained via refreshing.
     */
    refresh_parent_coin_pub: string | undefined;
    /**
     * Public key of the reserve for this coin.
     * Only present if this coin was obtained via refreshing.
     */
    withdrawal_reserve_pub: string | undefined;
    /**
     * Is the coin suspended?
     * Suspended coins are not considered for payments.
     */
    coin_suspended: boolean;
  }>;
}

export interface MerchantPayResponse {
  sig: string;
}

export interface ExchangeMeltResponse {
  /**
   * Which of the kappa indices does the client not have to reveal.
   */
  noreveal_index: number;

  /**
   * Signature of TALER_RefreshMeltConfirmationPS whereby the exchange
   * affirms the successful melt and confirming the noreveal_index
   */
  exchange_sig: EddsaSignatureString;

  /*
   * public EdDSA key of the exchange that was used to generate the signature.
   * Should match one of the exchange's signing keys from /keys.  Again given
   * explicitly as the client might otherwise be confused by clock skew as to
   * which signing key was used.
   */
  exchange_pub: EddsaPublicKeyString;

  /*
   * Base URL to use for operations on the refresh context
   * (so the reveal operation).  If not given,
   * the base URL is the same as the one used for this request.
   * Can be used if the base URL for /refreshes/ differs from that
   * for /coins/, i.e. for load balancing.  Clients SHOULD
   * respect the refresh_base_url if provided.  Any HTTP server
   * belonging to an exchange MUST generate a 307 or 308 redirection
   * to the correct base URL should a client uses the wrong base
   * URL, or if the base URL has changed since the melt.
   *
   * When melting the same coin twice (technically allowed
   * as the response might have been lost on the network),
   * the exchange may return different values for the refresh_base_url.
   */
  refresh_base_url?: string;
}

export interface ExchangeRevealItem {
  ev_sig: BlindedDenominationSignature;
}

export interface ExchangeRevealResponse {
  // List of the exchange's blinded RSA signatures on the new coins.
  ev_sigs: ExchangeRevealItem[];
}

interface MerchantOrderStatusPaid {
  /**
   * Was the payment refunded (even partially, via refund or abort)?
   */
  refunded: boolean;

  /**
   * Amount that was refunded in total.
   */
  refund_amount: AmountString;
}

interface MerchantOrderRefundResponse {
  /**
   * Amount that was refunded in total.
   */
  refund_amount: AmountString;

  /**
   * Successful refunds for this payment, empty array for none.
   */
  refunds: MerchantCoinRefundStatus[];

  /**
   * Public key of the merchant.
   */
  merchant_pub: EddsaPublicKeyString;
}

export type MerchantCoinRefundStatus =
  | MerchantCoinRefundSuccessStatus
  | MerchantCoinRefundFailureStatus;

export interface MerchantCoinRefundSuccessStatus {
  type: "success";

  // HTTP status of the exchange request, 200 (integer) required for refund confirmations.
  exchange_status: 200;

  // the EdDSA :ref:signature (binary-only) with purpose
  // TALER_SIGNATURE_EXCHANGE_CONFIRM_REFUND using a current signing key of the
  // exchange affirming the successful refund
  exchange_sig: EddsaSignatureString;

  // public EdDSA key of the exchange that was used to generate the signature.
  // Should match one of the exchange's signing keys from /keys.  It is given
  // explicitly as the client might otherwise be confused by clock skew as to
  // which signing key was used.
  exchange_pub: EddsaPublicKeyString;

  // Refund transaction ID.
  rtransaction_id: number;

  // public key of a coin that was refunded
  coin_pub: EddsaPublicKeyString;

  // Amount that was refunded, including refund fee charged by the exchange
  // to the customer.
  refund_amount: AmountString;

  execution_time: Timestamp;
}

export interface MerchantCoinRefundFailureStatus {
  type: "failure";

  // HTTP status of the exchange request, must NOT be 200.
  exchange_status: number;

  // Taler error code from the exchange reply, if available.
  exchange_code?: number;

  // If available, HTTP reply from the exchange.
  exchange_reply?: any;

  // Refund transaction ID.
  rtransaction_id: number;

  // public key of a coin that was refunded
  coin_pub: EddsaPublicKeyString;

  // Amount that was refunded, including refund fee charged by the exchange
  // to the customer.
  refund_amount: AmountString;

  execution_time: Timestamp;
}

export interface MerchantOrderStatusUnpaid {
  /**
   * URI that the wallet must process to complete the payment.
   */
  taler_pay_uri: string;

  /**
   * Alternative order ID which was paid for already in the same session.
   *
   * Only given if the same product was purchased before in the same session.
   */
  already_paid_order_id?: string;
}

/**
 * Response body for the following endpoint:
 *
 * POST {talerBankIntegrationApi}/withdrawal-operation/{wopid}
 */
export interface BankWithdrawalOperationPostResponse {
  transfer_done: boolean;
}

export type DenominationPubKey = RsaDenominationPubKey | CsDenominationPubKey;

export interface RsaDenominationPubKey {
  cipher: 1;
  rsa_public_key: string;
  age_mask?: number;
}

export interface CsDenominationPubKey {
  cipher: 2;
}

export const codecForDenominationPubKey = () =>
  buildCodecForUnion<DenominationPubKey>()
    .discriminateOn("cipher")
    .alternative(1, codecForRsaDenominationPubKey())
    .build("DenominationPubKey");

export const codecForRsaDenominationPubKey = () =>
  buildCodecForObject<RsaDenominationPubKey>()
    .property("cipher", codecForConstNumber(1))
    .property("rsa_public_key", codecForString())
    .build("DenominationPubKey");

export const codecForBankWithdrawalOperationPostResponse = (): Codec<BankWithdrawalOperationPostResponse> =>
  buildCodecForObject<BankWithdrawalOperationPostResponse>()
    .property("transfer_done", codecForBoolean())
    .build("BankWithdrawalOperationPostResponse");

export type AmountString = string;
export type Base32String = string;
export type EddsaSignatureString = string;
export type EddsaPublicKeyString = string;
export type CoinPublicKeyString = string;

export const codecForDenomination = (): Codec<Denomination> =>
  buildCodecForObject<Denomination>()
    .property("value", codecForString())
    .property("denom_pub", codecForDenominationPubKey())
    .property("fee_withdraw", codecForString())
    .property("fee_deposit", codecForString())
    .property("fee_refresh", codecForString())
    .property("fee_refund", codecForString())
    .property("stamp_start", codecForTimestamp)
    .property("stamp_expire_withdraw", codecForTimestamp)
    .property("stamp_expire_legal", codecForTimestamp)
    .property("stamp_expire_deposit", codecForTimestamp)
    .property("master_sig", codecForString())
    .build("Denomination");

export const codecForAuditorDenomSig = (): Codec<AuditorDenomSig> =>
  buildCodecForObject<AuditorDenomSig>()
    .property("denom_pub_h", codecForString())
    .property("auditor_sig", codecForString())
    .build("AuditorDenomSig");

export const codecForAuditor = (): Codec<Auditor> =>
  buildCodecForObject<Auditor>()
    .property("auditor_pub", codecForString())
    .property("auditor_url", codecForString())
    .property("denomination_keys", codecForList(codecForAuditorDenomSig()))
    .build("Auditor");

export const codecForExchangeHandle = (): Codec<ExchangeHandle> =>
  buildCodecForObject<ExchangeHandle>()
    .property("master_pub", codecForString())
    .property("url", codecForString())
    .build("ExchangeHandle");

export const codecForAuditorHandle = (): Codec<AuditorHandle> =>
  buildCodecForObject<AuditorHandle>()
    .property("name", codecForString())
    .property("auditor_pub", codecForString())
    .property("url", codecForString())
    .build("AuditorHandle");

export const codecForLocation = (): Codec<Location> =>
  buildCodecForObject<Location>()
    .property("country", codecOptional(codecForString()))
    .property("country_subdivision", codecOptional(codecForString()))
    .property("building_name", codecOptional(codecForString()))
    .property("building_number", codecOptional(codecForString()))
    .property("district", codecOptional(codecForString()))
    .property("street", codecOptional(codecForString()))
    .property("post_code", codecOptional(codecForString()))
    .property("town", codecOptional(codecForString()))
    .property("town_location", codecOptional(codecForString()))
    .property("address_lines", codecOptional(codecForList(codecForString())))
    .build("Location");

export const codecForMerchantInfo = (): Codec<MerchantInfo> =>
  buildCodecForObject<MerchantInfo>()
    .property("name", codecForString())
    .property("address", codecOptional(codecForLocation()))
    .property("jurisdiction", codecOptional(codecForLocation()))
    .build("MerchantInfo");

export const codecForTax = (): Codec<Tax> =>
  buildCodecForObject<Tax>()
    .property("name", codecForString())
    .property("tax", codecForString())
    .build("Tax");

export const codecForInternationalizedString = (): Codec<InternationalizedString> =>
  codecForMap(codecForString());

export const codecForProduct = (): Codec<Product> =>
  buildCodecForObject<Product>()
    .property("product_id", codecOptional(codecForString()))
    .property("description", codecForString())
    .property(
      "description_i18n",
      codecOptional(codecForInternationalizedString()),
    )
    .property("quantity", codecOptional(codecForNumber()))
    .property("unit", codecOptional(codecForString()))
    .property("price", codecOptional(codecForString()))
    .build("Tax");

export const codecForContractTerms = (): Codec<ContractTerms> =>
  buildCodecForObject<ContractTerms>()
    .property("order_id", codecForString())
    .property("fulfillment_url", codecOptional(codecForString()))
    .property("fulfillment_message", codecOptional(codecForString()))
    .property(
      "fulfillment_message_i18n",
      codecOptional(codecForInternationalizedString()),
    )
    .property("merchant_base_url", codecForString())
    .property("h_wire", codecForString())
    .property("auto_refund", codecOptional(codecForDuration))
    .property("wire_method", codecForString())
    .property("summary", codecForString())
    .property("summary_i18n", codecOptional(codecForInternationalizedString()))
    .property("nonce", codecForString())
    .property("amount", codecForString())
    .property("auditors", codecForList(codecForAuditorHandle()))
    .property("pay_deadline", codecForTimestamp)
    .property("refund_deadline", codecForTimestamp)
    .property("wire_transfer_deadline", codecForTimestamp)
    .property("timestamp", codecForTimestamp)
    .property("delivery_location", codecOptional(codecForLocation()))
    .property("delivery_date", codecOptional(codecForTimestamp))
    .property("max_fee", codecForString())
    .property("max_wire_fee", codecOptional(codecForString()))
    .property("merchant", codecForMerchantInfo())
    .property("merchant_pub", codecForString())
    .property("exchanges", codecForList(codecForExchangeHandle()))
    .property("products", codecOptional(codecForList(codecForProduct())))
    .property("extra", codecForAny())
    .build("ContractTerms");

export const codecForMerchantRefundPermission = (): Codec<MerchantAbortPayRefundDetails> =>
  buildCodecForObject<MerchantAbortPayRefundDetails>()
    .property("refund_amount", codecForAmountString())
    .property("refund_fee", codecForAmountString())
    .property("coin_pub", codecForString())
    .property("rtransaction_id", codecForNumber())
    .property("exchange_http_status", codecForNumber())
    .property("exchange_code", codecOptional(codecForNumber()))
    .property("exchange_reply", codecOptional(codecForAny()))
    .property("exchange_sig", codecOptional(codecForString()))
    .property("exchange_pub", codecOptional(codecForString()))
    .build("MerchantRefundPermission");

export const codecForMerchantRefundResponse = (): Codec<MerchantRefundResponse> =>
  buildCodecForObject<MerchantRefundResponse>()
    .property("merchant_pub", codecForString())
    .property("h_contract_terms", codecForString())
    .property("refunds", codecForList(codecForMerchantRefundPermission()))
    .build("MerchantRefundResponse");

export const codecForBlindSigWrapper = (): Codec<BlindSigWrapper> =>
  buildCodecForObject<BlindSigWrapper>()
    .property("blind_sig", codecForString())
    .build("BlindSigWrapper");

export const codecForTipResponse = (): Codec<TipResponse> =>
  buildCodecForObject<TipResponse>()
    .property("blind_sigs", codecForList(codecForBlindSigWrapper()))
    .build("TipResponse");

export const codecForRecoup = (): Codec<Recoup> =>
  buildCodecForObject<Recoup>()
    .property("h_denom_pub", codecForString())
    .build("Recoup");

export const codecForExchangeSigningKey = (): Codec<ExchangeSignKeyJson> =>
  buildCodecForObject<ExchangeSignKeyJson>()
    .property("key", codecForString())
    .property("master_sig", codecForString())
    .property("stamp_end", codecForTimestamp)
    .property("stamp_start", codecForTimestamp)
    .property("stamp_expire", codecForTimestamp)
    .build("ExchangeSignKeyJson");

export const codecForExchangeKeysJson = (): Codec<ExchangeKeysJson> =>
  buildCodecForObject<ExchangeKeysJson>()
    .property("denoms", codecForList(codecForDenomination()))
    .property("master_public_key", codecForString())
    .property("auditors", codecForList(codecForAuditor()))
    .property("list_issue_date", codecForTimestamp)
    .property("recoup", codecOptional(codecForList(codecForRecoup())))
    .property("signkeys", codecForList(codecForExchangeSigningKey()))
    .property("version", codecForString())
    .property("reserve_closing_delay", codecForDuration)
    .build("KeysJson");

export const codecForWireFeesJson = (): Codec<WireFeesJson> =>
  buildCodecForObject<WireFeesJson>()
    .property("wire_fee", codecForString())
    .property("closing_fee", codecForString())
    .property("sig", codecForString())
    .property("start_date", codecForTimestamp)
    .property("end_date", codecForTimestamp)
    .build("WireFeesJson");

export const codecForAccountInfo = (): Codec<AccountInfo> =>
  buildCodecForObject<AccountInfo>()
    .property("payto_uri", codecForString())
    .property("master_sig", codecForString())
    .build("AccountInfo");

export const codecForExchangeWireJson = (): Codec<ExchangeWireJson> =>
  buildCodecForObject<ExchangeWireJson>()
    .property("accounts", codecForList(codecForAccountInfo()))
    .property("fees", codecForMap(codecForList(codecForWireFeesJson())))
    .build("ExchangeWireJson");

export const codecForProposal = (): Codec<Proposal> =>
  buildCodecForObject<Proposal>()
    .property("contract_terms", codecForAny())
    .property("sig", codecForString())
    .build("Proposal");

export const codecForCheckPaymentResponse = (): Codec<CheckPaymentResponse> =>
  buildCodecForObject<CheckPaymentResponse>()
    .property("order_status", codecForString())
    .property("refunded", codecOptional(codecForBoolean()))
    .property("refunded_amount", codecOptional(codecForString()))
    .property("contract_terms", codecOptional(codecForAny()))
    .property("taler_pay_uri", codecOptional(codecForString()))
    .property("contract_url", codecOptional(codecForString()))
    .build("CheckPaymentResponse");

export const codecForWithdrawOperationStatusResponse = (): Codec<WithdrawOperationStatusResponse> =>
  buildCodecForObject<WithdrawOperationStatusResponse>()
    .property("selection_done", codecForBoolean())
    .property("transfer_done", codecForBoolean())
    .property("aborted", codecForBoolean())
    .property("amount", codecForString())
    .property("sender_wire", codecOptional(codecForString()))
    .property("suggested_exchange", codecOptional(codecForString()))
    .property("confirm_transfer_url", codecOptional(codecForString()))
    .property("wire_types", codecForList(codecForString()))
    .build("WithdrawOperationStatusResponse");

export const codecForTipPickupGetResponse = (): Codec<TipPickupGetResponse> =>
  buildCodecForObject<TipPickupGetResponse>()
    .property("tip_amount", codecForString())
    .property("exchange_url", codecForString())
    .property("expiration", codecForTimestamp)
    .build("TipPickupGetResponse");

export const codecForRecoupConfirmation = (): Codec<RecoupConfirmation> =>
  buildCodecForObject<RecoupConfirmation>()
    .property("reserve_pub", codecOptional(codecForString()))
    .property("old_coin_pub", codecOptional(codecForString()))
    .build("RecoupConfirmation");

export const codecForWithdrawResponse = (): Codec<WithdrawResponse> =>
  buildCodecForObject<WithdrawResponse>()
    .property("ev_sig", codecForBlindedDenominationSignature())
    .build("WithdrawResponse");

export const codecForMerchantPayResponse = (): Codec<MerchantPayResponse> =>
  buildCodecForObject<MerchantPayResponse>()
    .property("sig", codecForString())
    .build("MerchantPayResponse");

export const codecForExchangeMeltResponse = (): Codec<ExchangeMeltResponse> =>
  buildCodecForObject<ExchangeMeltResponse>()
    .property("exchange_pub", codecForString())
    .property("exchange_sig", codecForString())
    .property("noreveal_index", codecForNumber())
    .property("refresh_base_url", codecOptional(codecForString()))
    .build("ExchangeMeltResponse");

export const codecForExchangeRevealItem = (): Codec<ExchangeRevealItem> =>
  buildCodecForObject<ExchangeRevealItem>()
    .property("ev_sig", codecForBlindedDenominationSignature())
    .build("ExchangeRevealItem");

export const codecForExchangeRevealResponse = (): Codec<ExchangeRevealResponse> =>
  buildCodecForObject<ExchangeRevealResponse>()
    .property("ev_sigs", codecForList(codecForExchangeRevealItem()))
    .build("ExchangeRevealResponse");

export const codecForMerchantCoinRefundSuccessStatus = (): Codec<MerchantCoinRefundSuccessStatus> =>
  buildCodecForObject<MerchantCoinRefundSuccessStatus>()
    .property("type", codecForConstString("success"))
    .property("coin_pub", codecForString())
    .property("exchange_status", codecForConstNumber(200))
    .property("exchange_sig", codecForString())
    .property("rtransaction_id", codecForNumber())
    .property("refund_amount", codecForString())
    .property("exchange_pub", codecForString())
    .property("execution_time", codecForTimestamp)
    .build("MerchantCoinRefundSuccessStatus");

export const codecForMerchantCoinRefundFailureStatus = (): Codec<MerchantCoinRefundFailureStatus> =>
  buildCodecForObject<MerchantCoinRefundFailureStatus>()
    .property("type", codecForConstString("failure"))
    .property("coin_pub", codecForString())
    .property("exchange_status", codecForNumber())
    .property("rtransaction_id", codecForNumber())
    .property("refund_amount", codecForString())
    .property("exchange_code", codecOptional(codecForNumber()))
    .property("exchange_reply", codecOptional(codecForAny()))
    .property("execution_time", codecForTimestamp)
    .build("MerchantCoinRefundFailureStatus");

export const codecForMerchantCoinRefundStatus = (): Codec<MerchantCoinRefundStatus> =>
  buildCodecForUnion<MerchantCoinRefundStatus>()
    .discriminateOn("type")
    .alternative("success", codecForMerchantCoinRefundSuccessStatus())
    .alternative("failure", codecForMerchantCoinRefundFailureStatus())
    .build("MerchantCoinRefundStatus");

export const codecForMerchantOrderStatusPaid = (): Codec<MerchantOrderStatusPaid> =>
  buildCodecForObject<MerchantOrderStatusPaid>()
    .property("refund_amount", codecForString())
    .property("refunded", codecForBoolean())
    .build("MerchantOrderStatusPaid");

export const codecForMerchantOrderRefundPickupResponse = (): Codec<MerchantOrderRefundResponse> =>
  buildCodecForObject<MerchantOrderRefundResponse>()
    .property("merchant_pub", codecForString())
    .property("refund_amount", codecForString())
    .property("refunds", codecForList(codecForMerchantCoinRefundStatus()))
    .build("MerchantOrderRefundPickupResponse");

export const codecForMerchantOrderStatusUnpaid = (): Codec<MerchantOrderStatusUnpaid> =>
  buildCodecForObject<MerchantOrderStatusUnpaid>()
    .property("taler_pay_uri", codecForString())
    .property("already_paid_order_id", codecOptional(codecForString()))
    .build("MerchantOrderStatusUnpaid");

export interface AbortRequest {
  // hash of the order's contract terms (this is used to authenticate the
  // wallet/customer in case $ORDER_ID is guessable).
  h_contract: string;

  // List of coins the wallet would like to see refunds for.
  // (Should be limited to the coins for which the original
  // payment succeeded, as far as the wallet knows.)
  coins: AbortingCoin[];
}

export interface AbortingCoin {
  // Public key of a coin for which the wallet is requesting an abort-related refund.
  coin_pub: EddsaPublicKeyString;

  // The amount to be refunded (matches the original contribution)
  contribution: AmountString;

  // URL of the exchange this coin was withdrawn from.
  exchange_url: string;
}

export interface AbortResponse {
  // List of refund responses about the coins that the wallet
  // requested an abort for.  In the same order as the 'coins'
  // from the original request.
  // The rtransaction_id is implied to be 0.
  refunds: MerchantAbortPayRefundStatus[];
}

export const codecForAbortResponse = (): Codec<AbortResponse> =>
  buildCodecForObject<AbortResponse>()
    .property("refunds", codecForList(codecForMerchantAbortPayRefundStatus()))
    .build("AbortResponse");

export type MerchantAbortPayRefundStatus =
  | MerchantAbortPayRefundSuccessStatus
  | MerchantAbortPayRefundFailureStatus;

// Details about why a refund failed.
export interface MerchantAbortPayRefundFailureStatus {
  // Used as tag for the sum type RefundStatus sum type.
  type: "failure";

  // HTTP status of the exchange request, must NOT be 200.
  exchange_status: number;

  // Taler error code from the exchange reply, if available.
  exchange_code?: number;

  // If available, HTTP reply from the exchange.
  exchange_reply?: unknown;
}

// Additional details needed to verify the refund confirmation signature
// (h_contract_terms and merchant_pub) are already known
// to the wallet and thus not included.
export interface MerchantAbortPayRefundSuccessStatus {
  // Used as tag for the sum type MerchantCoinRefundStatus sum type.
  type: "success";

  // HTTP status of the exchange request, 200 (integer) required for refund confirmations.
  exchange_status: 200;

  // the EdDSA :ref:signature (binary-only) with purpose
  // TALER_SIGNATURE_EXCHANGE_CONFIRM_REFUND using a current signing key of the
  // exchange affirming the successful refund
  exchange_sig: string;

  // public EdDSA key of the exchange that was used to generate the signature.
  // Should match one of the exchange's signing keys from /keys.  It is given
  // explicitly as the client might otherwise be confused by clock skew as to
  // which signing key was used.
  exchange_pub: string;
}

export const codecForMerchantAbortPayRefundSuccessStatus = (): Codec<MerchantAbortPayRefundSuccessStatus> =>
  buildCodecForObject<MerchantAbortPayRefundSuccessStatus>()
    .property("exchange_pub", codecForString())
    .property("exchange_sig", codecForString())
    .property("exchange_status", codecForConstNumber(200))
    .property("type", codecForConstString("success"))
    .build("MerchantAbortPayRefundSuccessStatus");

export const codecForMerchantAbortPayRefundFailureStatus = (): Codec<MerchantAbortPayRefundFailureStatus> =>
  buildCodecForObject<MerchantAbortPayRefundFailureStatus>()
    .property("exchange_code", codecForNumber())
    .property("exchange_reply", codecForAny())
    .property("exchange_status", codecForNumber())
    .property("type", codecForConstString("failure"))
    .build("MerchantAbortPayRefundFailureStatus");

export const codecForMerchantAbortPayRefundStatus = (): Codec<MerchantAbortPayRefundStatus> =>
  buildCodecForUnion<MerchantAbortPayRefundStatus>()
    .discriminateOn("type")
    .alternative("success", codecForMerchantAbortPayRefundSuccessStatus())
    .alternative("failure", codecForMerchantAbortPayRefundFailureStatus())
    .build("MerchantAbortPayRefundStatus");

export interface TalerConfigResponse {
  name: string;
  version: string;
  currency?: string;
}

export const codecForTalerConfigResponse = (): Codec<TalerConfigResponse> =>
  buildCodecForObject<TalerConfigResponse>()
    .property("name", codecForString())
    .property("version", codecForString())
    .property("currency", codecOptional(codecForString()))
    .build("TalerConfigResponse");

export interface FutureKeysResponse {
  future_denoms: any[];

  future_signkeys: any[];

  master_pub: string;

  denom_secmod_public_key: string;

  // Public key of the signkey security module.
  signkey_secmod_public_key: string;
}

export const codecForKeysManagementResponse = (): Codec<FutureKeysResponse> =>
  buildCodecForObject<FutureKeysResponse>()
    .property("master_pub", codecForString())
    .property("future_signkeys", codecForList(codecForAny()))
    .property("future_denoms", codecForList(codecForAny()))
    .property("denom_secmod_public_key", codecForAny())
    .property("signkey_secmod_public_key", codecForAny())
    .build("FutureKeysResponse");
