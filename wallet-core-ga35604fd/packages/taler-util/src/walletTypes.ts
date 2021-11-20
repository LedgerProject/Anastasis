/*
 This file is part of GNU Taler
 (C) 2015-2020 Taler Systems SA

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
 * Types used by clients of the wallet.
 *
 * These types are defined in a separate file make tree shaking easier, since
 * some components use these types (via RPC) but do not depend on the wallet
 * code directly.
 *
 * @author Florian Dold <dold@taler.net>
 */

/**
 * Imports.
 */
import {
  AmountJson,
  codecForAmountJson,
  codecForAmountString,
} from "./amounts.js";
import { Timestamp, codecForTimestamp } from "./time.js";
import {
  buildCodecForObject,
  codecForString,
  codecOptional,
  Codec,
  codecForList,
  codecForBoolean,
  codecForConstString,
  codecForAny,
  buildCodecForUnion,
} from "./codec.js";
import {
  AmountString,
  codecForContractTerms,
  ContractTerms,
  DenominationPubKey,
  UnblindedSignature,
} from "./talerTypes.js";
import { OrderShortInfo, codecForOrderShortInfo } from "./transactionsTypes.js";
import { BackupRecovery } from "./backupTypes.js";

/**
 * Response for the create reserve request to the wallet.
 */
export class CreateReserveResponse {
  /**
   * Exchange URL where the bank should create the reserve.
   * The URL is canonicalized in the response.
   */
  exchange: string;

  /**
   * Reserve public key of the newly created reserve.
   */
  reservePub: string;
}

export interface Balance {
  available: AmountString;
  pendingIncoming: AmountString;
  pendingOutgoing: AmountString;

  // Does the balance for this currency have a pending
  // transaction?
  hasPendingTransactions: boolean;

  // Is there a pending transaction that would affect the balance
  // and requires user input?
  requiresUserInput: boolean;
}

export interface BalancesResponse {
  balances: Balance[];
}

export const codecForBalance = (): Codec<Balance> =>
  buildCodecForObject<Balance>()
    .property("available", codecForString())
    .property("hasPendingTransactions", codecForBoolean())
    .property("pendingIncoming", codecForString())
    .property("pendingOutgoing", codecForString())
    .property("requiresUserInput", codecForBoolean())
    .build("Balance");

export const codecForBalancesResponse = (): Codec<BalancesResponse> =>
  buildCodecForObject<BalancesResponse>()
    .property("balances", codecForList(codecForBalance()))
    .build("BalancesResponse");

/**
 * For terseness.
 */
export function mkAmount(
  value: number,
  fraction: number,
  currency: string,
): AmountJson {
  return { value, fraction, currency };
}

export enum ConfirmPayResultType {
  Done = "done",
  Pending = "pending",
}

/**
 * Result for confirmPay
 */
export interface ConfirmPayResultDone {
  type: ConfirmPayResultType.Done;
  contractTerms: ContractTerms;
}

export interface ConfirmPayResultPending {
  type: ConfirmPayResultType.Pending;

  lastError: TalerErrorDetails;
}

export type ConfirmPayResult = ConfirmPayResultDone | ConfirmPayResultPending;

export const codecForConfirmPayResultPending = (): Codec<ConfirmPayResultPending> =>
  buildCodecForObject<ConfirmPayResultPending>()
    .property("lastError", codecForAny())
    .property("type", codecForConstString(ConfirmPayResultType.Pending))
    .build("ConfirmPayResultPending");

export const codecForConfirmPayResultDone = (): Codec<ConfirmPayResultDone> =>
  buildCodecForObject<ConfirmPayResultDone>()
    .property("type", codecForConstString(ConfirmPayResultType.Done))
    .property("contractTerms", codecForContractTerms())
    .build("ConfirmPayResultDone");

export const codecForConfirmPayResult = (): Codec<ConfirmPayResult> =>
  buildCodecForUnion<ConfirmPayResult>()
    .discriminateOn("type")
    .alternative(
      ConfirmPayResultType.Pending,
      codecForConfirmPayResultPending(),
    )
    .alternative(ConfirmPayResultType.Done, codecForConfirmPayResultDone())
    .build("ConfirmPayResult");

/**
 * Information about all sender wire details known to the wallet,
 * as well as exchanges that accept these wire types.
 */
export interface SenderWireInfos {
  /**
   * Mapping from exchange base url to list of accepted
   * wire types.
   */
  exchangeWireTypes: { [exchangeBaseUrl: string]: string[] };

  /**
   * Sender wire information stored in the wallet.
   */
  senderWires: string[];
}

/**
 * Request to create a reserve.
 */
export interface CreateReserveRequest {
  /**
   * The initial amount for the reserve.
   */
  amount: AmountJson;

  /**
   * Exchange URL where the bank should create the reserve.
   */
  exchange: string;

  /**
   * Payto URI that identifies the exchange's account that the funds
   * for this reserve go into.
   */
  exchangePaytoUri?: string;

  /**
   * Wire details (as a payto URI) for the bank account that sent the funds to
   * the exchange.
   */
  senderWire?: string;

  /**
   * URL to fetch the withdraw status from the bank.
   */
  bankWithdrawStatusUrl?: string;
}

export const codecForCreateReserveRequest = (): Codec<CreateReserveRequest> =>
  buildCodecForObject<CreateReserveRequest>()
    .property("amount", codecForAmountJson())
    .property("exchange", codecForString())
    .property("exchangePaytoUri", codecForString())
    .property("senderWire", codecOptional(codecForString()))
    .property("bankWithdrawStatusUrl", codecOptional(codecForString()))
    .build("CreateReserveRequest");

/**
 * Request to mark a reserve as confirmed.
 */
export interface ConfirmReserveRequest {
  /**
   * Public key of then reserve that should be marked
   * as confirmed.
   */
  reservePub: string;
}

export const codecForConfirmReserveRequest = (): Codec<ConfirmReserveRequest> =>
  buildCodecForObject<ConfirmReserveRequest>()
    .property("reservePub", codecForString())
    .build("ConfirmReserveRequest");

/**
 * Wire coins to the user's own bank account.
 */
export class ReturnCoinsRequest {
  /**
   * The amount to wire.
   */
  amount: AmountJson;

  /**
   * The exchange to take the coins from.
   */
  exchange: string;

  /**
   * Wire details for the bank account of the customer that will
   * receive the funds.
   */
  senderWire?: string;

  /**
   * Verify that a value matches the schema of this class and convert it into a
   * member.
   */
  static checked: (obj: any) => ReturnCoinsRequest;
}

export interface PrepareTipResult {
  /**
   * Unique ID for the tip assigned by the wallet.
   * Typically different from the merchant-generated tip ID.
   */
  walletTipId: string;

  /**
   * Has the tip already been accepted?
   */
  accepted: boolean;

  /**
   * Amount that the merchant gave.
   */
  tipAmountRaw: AmountString;

  /**
   * Amount that arrived at the wallet.
   * Might be lower than the raw amount due to fees.
   */
  tipAmountEffective: AmountString;

  /**
   * Base URL of the merchant backend giving then tip.
   */
  merchantBaseUrl: string;

  /**
   * Base URL of the exchange that is used to withdraw the tip.
   * Determined by the merchant, the wallet/user has no choice here.
   */
  exchangeBaseUrl: string;

  /**
   * Time when the tip will expire.  After it expired, it can't be picked
   * up anymore.
   */
  expirationTimestamp: Timestamp;
}

export const codecForPrepareTipResult = (): Codec<PrepareTipResult> =>
  buildCodecForObject<PrepareTipResult>()
    .property("accepted", codecForBoolean())
    .property("tipAmountRaw", codecForAmountString())
    .property("tipAmountEffective", codecForAmountString())
    .property("exchangeBaseUrl", codecForString())
    .property("merchantBaseUrl", codecForString())
    .property("expirationTimestamp", codecForTimestamp)
    .property("walletTipId", codecForString())
    .build("PrepareTipResult");

export interface BenchmarkResult {
  time: { [s: string]: number };
  repetitions: number;
}

export enum PreparePayResultType {
  PaymentPossible = "payment-possible",
  InsufficientBalance = "insufficient-balance",
  AlreadyConfirmed = "already-confirmed",
}

export const codecForPreparePayResultPaymentPossible = (): Codec<PreparePayResultPaymentPossible> =>
  buildCodecForObject<PreparePayResultPaymentPossible>()
    .property("amountEffective", codecForAmountString())
    .property("amountRaw", codecForAmountString())
    .property("contractTerms", codecForContractTerms())
    .property("proposalId", codecForString())
    .property("contractTermsHash", codecForString())
    .property("noncePriv", codecForString())
    .property(
      "status",
      codecForConstString(PreparePayResultType.PaymentPossible),
    )
    .build("PreparePayResultPaymentPossible");

export const codecForPreparePayResultInsufficientBalance = (): Codec<PreparePayResultInsufficientBalance> =>
  buildCodecForObject<PreparePayResultInsufficientBalance>()
    .property("amountRaw", codecForAmountString())
    .property("contractTerms", codecForAny())
    .property("proposalId", codecForString())
    .property("noncePriv", codecForString())
    .property(
      "status",
      codecForConstString(PreparePayResultType.InsufficientBalance),
    )
    .build("PreparePayResultInsufficientBalance");

export const codecForPreparePayResultAlreadyConfirmed = (): Codec<PreparePayResultAlreadyConfirmed> =>
  buildCodecForObject<PreparePayResultAlreadyConfirmed>()
    .property(
      "status",
      codecForConstString(PreparePayResultType.AlreadyConfirmed),
    )
    .property("amountEffective", codecForAmountString())
    .property("amountRaw", codecForAmountString())
    .property("paid", codecForBoolean())
    .property("contractTerms", codecForAny())
    .property("contractTermsHash", codecForString())
    .property("proposalId", codecForString())
    .build("PreparePayResultAlreadyConfirmed");

export const codecForPreparePayResult = (): Codec<PreparePayResult> =>
  buildCodecForUnion<PreparePayResult>()
    .discriminateOn("status")
    .alternative(
      PreparePayResultType.AlreadyConfirmed,
      codecForPreparePayResultAlreadyConfirmed(),
    )
    .alternative(
      PreparePayResultType.InsufficientBalance,
      codecForPreparePayResultInsufficientBalance(),
    )
    .alternative(
      PreparePayResultType.PaymentPossible,
      codecForPreparePayResultPaymentPossible(),
    )
    .build("PreparePayResult");

export type PreparePayResult =
  | PreparePayResultInsufficientBalance
  | PreparePayResultAlreadyConfirmed
  | PreparePayResultPaymentPossible;

export interface PreparePayResultPaymentPossible {
  status: PreparePayResultType.PaymentPossible;
  proposalId: string;
  contractTerms: ContractTerms;
  contractTermsHash: string;
  amountRaw: string;
  amountEffective: string;
  noncePriv: string;
}

export interface PreparePayResultInsufficientBalance {
  status: PreparePayResultType.InsufficientBalance;
  proposalId: string;
  contractTerms: ContractTerms;
  amountRaw: string;
  noncePriv: string;
}

export interface PreparePayResultAlreadyConfirmed {
  status: PreparePayResultType.AlreadyConfirmed;
  contractTerms: ContractTerms;
  paid: boolean;
  amountRaw: string;
  amountEffective: string;
  contractTermsHash: string;
  proposalId: string;
}

export interface BankWithdrawDetails {
  selectionDone: boolean;
  transferDone: boolean;
  amount: AmountJson;
  senderWire?: string;
  suggestedExchange?: string;
  confirmTransferUrl?: string;
  wireTypes: string[];
  extractedStatusUrl: string;
}

export interface AcceptWithdrawalResponse {
  reservePub: string;
  confirmTransferUrl?: string;
}

/**
 * Details about a purchase, including refund status.
 */
export interface PurchaseDetails {
  contractTerms: Record<string, undefined>;
  hasRefund: boolean;
  totalRefundAmount: AmountJson;
  totalRefundAndRefreshFees: AmountJson;
}

export interface WalletDiagnostics {
  walletManifestVersion: string;
  walletManifestDisplayVersion: string;
  errors: string[];
  firefoxIdbProblem: boolean;
  dbOutdated: boolean;
}

export interface TalerErrorDetails {
  code: number;
  hint: string;
  message: string;
  details: unknown;
}

export interface PlanchetCreationResult {
  coinPub: string;
  coinPriv: string;
  reservePub: string;
  denomPubHash: string;
  denomPub: DenominationPubKey;
  blindingKey: string;
  withdrawSig: string;
  coinEv: string;
  coinValue: AmountJson;
  coinEvHash: string;
}

export interface PlanchetCreationRequest {
  secretSeed: string;
  coinIndex: number;
  value: AmountJson;
  feeWithdraw: AmountJson;
  denomPub: DenominationPubKey;
  reservePub: string;
  reservePriv: string;
}

/**
 * Reasons for why a coin is being refreshed.
 */
export enum RefreshReason {
  Manual = "manual",
  Pay = "pay",
  Refund = "refund",
  AbortPay = "abort-pay",
  Recoup = "recoup",
  BackupRestored = "backup-restored",
  Scheduled = "scheduled",
}

/**
 * Wrapper for coin public keys.
 */
export interface CoinPublicKey {
  readonly coinPub: string;
}

/**
 * Wrapper for refresh group IDs.
 */
export interface RefreshGroupId {
  readonly refreshGroupId: string;
}

/**
 * Private data required to make a deposit permission.
 */
export interface DepositInfo {
  exchangeBaseUrl: string;
  contractTermsHash: string;
  coinPub: string;
  coinPriv: string;
  spendAmount: AmountJson;
  timestamp: Timestamp;
  refundDeadline: Timestamp;
  merchantPub: string;
  feeDeposit: AmountJson;
  wireInfoHash: string;
  denomPubHash: string;
  denomSig: UnblindedSignature;
}

export interface ExchangesListRespose {
  exchanges: ExchangeListItem[];
}

export interface ExchangeListItem {
  exchangeBaseUrl: string;
  currency: string;
  paytoUris: string[];
}

export const codecForExchangeListItem = (): Codec<ExchangeListItem> =>
  buildCodecForObject<ExchangeListItem>()
    .property("currency", codecForString())
    .property("exchangeBaseUrl", codecForString())
    .property("paytoUris", codecForList(codecForString()))
    .build("ExchangeListItem");

export const codecForExchangesListResponse = (): Codec<ExchangesListRespose> =>
  buildCodecForObject<ExchangesListRespose>()
    .property("exchanges", codecForList(codecForExchangeListItem()))
    .build("ExchangesListRespose");

export interface AcceptManualWithdrawalResult {
  /**
   * Payto URIs that can be used to fund the withdrawal.
   */
  exchangePaytoUris: string[];

  /**
   * Public key of the newly created reserve.
   */
  reservePub: string;
}

export interface ManualWithdrawalDetails {
  /**
   * Did the user accept the current version of the exchange's
   * terms of service?
   */
  tosAccepted: boolean;

  /**
   * Amount that the user will transfer to the exchange.
   */
  amountRaw: AmountString;

  /**
   * Amount that will be added to the user's wallet balance.
   */
  amountEffective: AmountString;

  /**
   * Ways to pay the exchange.
   */
  paytoUris: string[];
}

export interface GetExchangeTosResult {
  /**
   * Markdown version of the current ToS.
   */
  content: string;

  /**
   * Version tag of the current ToS.
   */
  currentEtag: string;

  /**
   * Version tag of the last ToS that the user has accepted,
   * if any.
   */
  acceptedEtag: string | undefined;

  /**
   * Accepted content type
   */
  contentType: string;
}

export interface TestPayArgs {
  merchantBaseUrl: string;
  merchantAuthToken?: string;
  amount: string;
  summary: string;
}

export const codecForTestPayArgs = (): Codec<TestPayArgs> =>
  buildCodecForObject<TestPayArgs>()
    .property("merchantBaseUrl", codecForString())
    .property("merchantAuthToken", codecOptional(codecForString()))
    .property("amount", codecForString())
    .property("summary", codecForString())
    .build("TestPayArgs");

export interface IntegrationTestArgs {
  exchangeBaseUrl: string;
  bankBaseUrl: string;
  merchantBaseUrl: string;
  merchantAuthToken?: string;
  amountToWithdraw: string;
  amountToSpend: string;
}

export const codecForIntegrationTestArgs = (): Codec<IntegrationTestArgs> =>
  buildCodecForObject<IntegrationTestArgs>()
    .property("exchangeBaseUrl", codecForString())
    .property("bankBaseUrl", codecForString())
    .property("merchantBaseUrl", codecForString())
    .property("merchantAuthToken", codecOptional(codecForString()))
    .property("amountToSpend", codecForAmountString())
    .property("amountToWithdraw", codecForAmountString())
    .build("IntegrationTestArgs");

export interface AddExchangeRequest {
  exchangeBaseUrl: string;
  forceUpdate?: boolean;
}

export const codecForAddExchangeRequest = (): Codec<AddExchangeRequest> =>
  buildCodecForObject<AddExchangeRequest>()
    .property("exchangeBaseUrl", codecForString())
    .property("forceUpdate", codecOptional(codecForBoolean()))
    .build("AddExchangeRequest");

export interface ForceExchangeUpdateRequest {
  exchangeBaseUrl: string;
}

export const codecForForceExchangeUpdateRequest = (): Codec<AddExchangeRequest> =>
  buildCodecForObject<AddExchangeRequest>()
    .property("exchangeBaseUrl", codecForString())
    .build("AddExchangeRequest");

export interface GetExchangeTosRequest {
  exchangeBaseUrl: string;
  acceptedFormat?: string[];
}

export const codecForGetExchangeTosRequest = (): Codec<GetExchangeTosRequest> =>
  buildCodecForObject<GetExchangeTosRequest>()
    .property("exchangeBaseUrl", codecForString())
    .property("acceptedFormat", codecOptional(codecForList(codecForString())))
    .build("GetExchangeTosRequest");

export interface AcceptManualWithdrawalRequest {
  exchangeBaseUrl: string;
  amount: string;
}

export const codecForAcceptManualWithdrawalRequet = (): Codec<AcceptManualWithdrawalRequest> =>
  buildCodecForObject<AcceptManualWithdrawalRequest>()
    .property("exchangeBaseUrl", codecForString())
    .property("amount", codecForString())
    .build("AcceptManualWithdrawalRequest");

export interface GetWithdrawalDetailsForAmountRequest {
  exchangeBaseUrl: string;
  amount: string;
}

export interface AcceptBankIntegratedWithdrawalRequest {
  talerWithdrawUri: string;
  exchangeBaseUrl: string;
}

export const codecForAcceptBankIntegratedWithdrawalRequest = (): Codec<AcceptBankIntegratedWithdrawalRequest> =>
  buildCodecForObject<AcceptBankIntegratedWithdrawalRequest>()
    .property("exchangeBaseUrl", codecForString())
    .property("talerWithdrawUri", codecForString())
    .build("AcceptBankIntegratedWithdrawalRequest");

export const codecForGetWithdrawalDetailsForAmountRequest = (): Codec<GetWithdrawalDetailsForAmountRequest> =>
  buildCodecForObject<GetWithdrawalDetailsForAmountRequest>()
    .property("exchangeBaseUrl", codecForString())
    .property("amount", codecForString())
    .build("GetWithdrawalDetailsForAmountRequest");

export interface AcceptExchangeTosRequest {
  exchangeBaseUrl: string;
  etag: string;
}

export const codecForAcceptExchangeTosRequest = (): Codec<AcceptExchangeTosRequest> =>
  buildCodecForObject<AcceptExchangeTosRequest>()
    .property("exchangeBaseUrl", codecForString())
    .property("etag", codecForString())
    .build("AcceptExchangeTosRequest");

export interface ApplyRefundRequest {
  talerRefundUri: string;
}

export const codecForApplyRefundRequest = (): Codec<ApplyRefundRequest> =>
  buildCodecForObject<ApplyRefundRequest>()
    .property("talerRefundUri", codecForString())
    .build("ApplyRefundRequest");

export interface GetWithdrawalDetailsForUriRequest {
  talerWithdrawUri: string;
}

export const codecForGetWithdrawalDetailsForUri = (): Codec<GetWithdrawalDetailsForUriRequest> =>
  buildCodecForObject<GetWithdrawalDetailsForUriRequest>()
    .property("talerWithdrawUri", codecForString())
    .build("GetWithdrawalDetailsForUriRequest");

export interface GetExchangeWithdrawalInfo {
  exchangeBaseUrl: string;
  amount: AmountJson;
  tosAcceptedFormat?: string[];
}

export const codecForGetExchangeWithdrawalInfo = (): Codec<GetExchangeWithdrawalInfo> =>
  buildCodecForObject<GetExchangeWithdrawalInfo>()
    .property("exchangeBaseUrl", codecForString())
    .property("amount", codecForAmountJson())
    .property(
      "tosAcceptedFormat",
      codecOptional(codecForList(codecForString())),
    )
    .build("GetExchangeWithdrawalInfo");

export interface AbortProposalRequest {
  proposalId: string;
}

export const codecForAbortProposalRequest = (): Codec<AbortProposalRequest> =>
  buildCodecForObject<AbortProposalRequest>()
    .property("proposalId", codecForString())
    .build("AbortProposalRequest");

export interface PreparePayRequest {
  talerPayUri: string;
}

export const codecForPreparePayRequest = (): Codec<PreparePayRequest> =>
  buildCodecForObject<PreparePayRequest>()
    .property("talerPayUri", codecForString())
    .build("PreparePay");

export interface ConfirmPayRequest {
  proposalId: string;
  sessionId?: string;
}

export const codecForConfirmPayRequest = (): Codec<ConfirmPayRequest> =>
  buildCodecForObject<ConfirmPayRequest>()
    .property("proposalId", codecForString())
    .property("sessionId", codecOptional(codecForString()))
    .build("ConfirmPay");

export type CoreApiResponse = CoreApiResponseSuccess | CoreApiResponseError;

export type CoreApiEnvelope = CoreApiResponse | CoreApiNotification;

export interface CoreApiNotification {
  type: "notification";
  payload: unknown;
}

export interface CoreApiResponseSuccess {
  // To distinguish the message from notifications
  type: "response";
  operation: string;
  id: string;
  result: unknown;
}

export interface CoreApiResponseError {
  // To distinguish the message from notifications
  type: "error";
  operation: string;
  id: string;
  error: TalerErrorDetails;
}

export interface WithdrawTestBalanceRequest {
  amount: string;
  bankBaseUrl: string;
  exchangeBaseUrl: string;
}

export const withdrawTestBalanceDefaults = {
  amount: "TESTKUDOS:10",
  bankBaseUrl: "https://bank.test.taler.net/",
  exchangeBaseUrl: "https://exchange.test.taler.net/",
};

/**
 * Request to the crypto worker to make a sync signature.
 */
export interface MakeSyncSignatureRequest {
  accountPriv: string;
  oldHash: string | undefined;
  newHash: string;
}

/**
 * Planchet for a coin during refresh.
 */
export interface RefreshPlanchetInfo {
  /**
   * Public key for the coin.
   */
  publicKey: string;

  /**
   * Private key for the coin.
   */
  privateKey: string;

  /**
   * Blinded public key.
   */
  coinEv: string;

  coinEvHash: string;

  /**
   * Blinding key used.
   */
  blindingKey: string;
}

/**
 * Strategy for loading recovery information.
 */
export enum RecoveryMergeStrategy {
  /**
   * Keep the local wallet root key, import and take over providers.
   */
  Ours = "ours",

  /**
   * Migrate to the wallet root key from the recovery information.
   */
  Theirs = "theirs",
}

/**
 * Load recovery information into the wallet.
 */
export interface RecoveryLoadRequest {
  recovery: BackupRecovery;
  strategy?: RecoveryMergeStrategy;
}

export const codecForWithdrawTestBalance = (): Codec<WithdrawTestBalanceRequest> =>
  buildCodecForObject<WithdrawTestBalanceRequest>()
    .property("amount", codecForString())
    .property("bankBaseUrl", codecForString())
    .property("exchangeBaseUrl", codecForString())
    .build("WithdrawTestBalanceRequest");

export interface ApplyRefundResponse {
  contractTermsHash: string;

  proposalId: string;

  amountEffectivePaid: AmountString;

  amountRefundGranted: AmountString;

  amountRefundGone: AmountString;

  pendingAtExchange: boolean;

  info: OrderShortInfo;
}

export const codecForApplyRefundResponse = (): Codec<ApplyRefundResponse> =>
  buildCodecForObject<ApplyRefundResponse>()
    .property("amountEffectivePaid", codecForAmountString())
    .property("amountRefundGone", codecForAmountString())
    .property("amountRefundGranted", codecForAmountString())
    .property("contractTermsHash", codecForString())
    .property("pendingAtExchange", codecForBoolean())
    .property("proposalId", codecForString())
    .property("info", codecForOrderShortInfo())
    .build("ApplyRefundResponse");

export interface SetCoinSuspendedRequest {
  coinPub: string;
  suspended: boolean;
}

export const codecForSetCoinSuspendedRequest = (): Codec<SetCoinSuspendedRequest> =>
  buildCodecForObject<SetCoinSuspendedRequest>()
    .property("coinPub", codecForString())
    .property("suspended", codecForBoolean())
    .build("SetCoinSuspendedRequest");

export interface ForceRefreshRequest {
  coinPubList: string[];
}

export const codecForForceRefreshRequest = (): Codec<ForceRefreshRequest> =>
  buildCodecForObject<ForceRefreshRequest>()
    .property("coinPubList", codecForList(codecForString()))
    .build("ForceRefreshRequest");

export interface PrepareTipRequest {
  talerTipUri: string;
}

export const codecForPrepareTipRequest = (): Codec<PrepareTipRequest> =>
  buildCodecForObject<PrepareTipRequest>()
    .property("talerTipUri", codecForString())
    .build("PrepareTipRequest");

export interface AcceptTipRequest {
  walletTipId: string;
}

export const codecForAcceptTipRequest = (): Codec<AcceptTipRequest> =>
  buildCodecForObject<AcceptTipRequest>()
    .property("walletTipId", codecForString())
    .build("AcceptTipRequest");

export interface AbortPayWithRefundRequest {
  proposalId: string;
}

export const codecForAbortPayWithRefundRequest = (): Codec<AbortPayWithRefundRequest> =>
  buildCodecForObject<AbortPayWithRefundRequest>()
    .property("proposalId", codecForString())
    .build("AbortPayWithRefundRequest");

export interface CreateDepositGroupRequest {
  depositPaytoUri: string;
  amount: string;
}

export const codecForCreateDepositGroupRequest = (): Codec<CreateDepositGroupRequest> =>
  buildCodecForObject<CreateDepositGroupRequest>()
    .property("amount", codecForAmountString())
    .property("depositPaytoUri", codecForString())
    .build("CreateDepositGroupRequest");

export interface CreateDepositGroupResponse {
  depositGroupId: string;
}

export interface TrackDepositGroupRequest {
  depositGroupId: string;
}

export interface TrackDepositGroupResponse {
  responses: {
    status: number;
    body: any;
  }[];
}

export const codecForTrackDepositGroupRequest = (): Codec<TrackDepositGroupRequest> =>
  buildCodecForObject<TrackDepositGroupRequest>()
    .property("depositGroupId", codecForAmountString())
    .build("TrackDepositGroupRequest");

export interface WithdrawUriInfoResponse {
  amount: AmountString;
  defaultExchangeBaseUrl?: string;
  possibleExchanges: ExchangeListItem[];
}

export const codecForWithdrawUriInfoResponse = (): Codec<WithdrawUriInfoResponse> =>
  buildCodecForObject<WithdrawUriInfoResponse>()
    .property("amount", codecForAmountString())
    .property("defaultExchangeBaseUrl", codecOptional(codecForString()))
    .property("possibleExchanges", codecForList(codecForExchangeListItem()))
    .build("WithdrawUriInfoResponse");

export interface WalletCurrencyInfo {
  trustedAuditors: {
    currency: string;
    auditorPub: string;
    auditorBaseUrl: string;
  }[];
  trustedExchanges: {
    currency: string;
    exchangeMasterPub: string;
    exchangeBaseUrl: string;
  }[];
}

export interface DeleteTransactionRequest {
  transactionId: string;
}

export interface RetryTransactionRequest {
  transactionId: string;
}

export const codecForDeleteTransactionRequest = (): Codec<DeleteTransactionRequest> =>
  buildCodecForObject<DeleteTransactionRequest>()
    .property("transactionId", codecForString())
    .build("DeleteTransactionRequest");

export const codecForRetryTransactionRequest = (): Codec<RetryTransactionRequest> =>
  buildCodecForObject<RetryTransactionRequest>()
    .property("transactionId", codecForString())
    .build("RetryTransactionRequest");

export interface SetWalletDeviceIdRequest {
  /**
   * New wallet device ID to set.
   */
  walletDeviceId: string;
}

export const codecForSetWalletDeviceIdRequest = (): Codec<SetWalletDeviceIdRequest> =>
  buildCodecForObject<SetWalletDeviceIdRequest>()
    .property("walletDeviceId", codecForString())
    .build("SetWalletDeviceIdRequest");

export interface WithdrawFakebankRequest {
  amount: AmountString;
  exchange: string;
  bank: string;
}

export const codecForWithdrawFakebankRequest = (): Codec<WithdrawFakebankRequest> =>
  buildCodecForObject<WithdrawFakebankRequest>()
    .property("amount", codecForAmountString())
    .property("bank", codecForString())
    .property("exchange", codecForString())
    .build("WithdrawFakebankRequest");
