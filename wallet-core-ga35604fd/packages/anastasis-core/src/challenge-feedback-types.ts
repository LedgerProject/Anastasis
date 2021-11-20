import { AmountString, HttpStatusCode } from "@gnu-taler/taler-util";

export enum ChallengeFeedbackStatus {
  Solved = "solved",
  ServerFailure = "server-failure",
  TruthUnknown = "truth-unknown",
  Redirect = "redirect",
  Payment = "payment",
  Pending = "pending",
  Message = "message",
  Unsupported = "unsupported",
  RateLimitExceeded = "rate-limit-exceeded",
  AuthIban = "auth-iban",
}

export type ChallengeFeedback =
  | ChallengeFeedbackSolved
  | ChallengeFeedbackPending
  | ChallengeFeedbackPayment
  | ChallengeFeedbackServerFailure
  | ChallengeFeedbackRateLimitExceeded
  | ChallengeFeedbackTruthUnknown
  | ChallengeFeedbackRedirect
  | ChallengeFeedbackMessage
  | ChallengeFeedbackUnsupported
  | ChallengeFeedbackAuthIban;

/**
 * Challenge has been solved and the key share has
 * been retrieved.
 */
export interface ChallengeFeedbackSolved {
  state: ChallengeFeedbackStatus.Solved;
}

/**
 * The challenge given by the server is unsupported
 * by the current anastasis client.
 */
export interface ChallengeFeedbackUnsupported {
  state: ChallengeFeedbackStatus.Unsupported;
  http_status: HttpStatusCode;
  /**
   * Human-readable identifier of the unsupported method.
   */
  unsupported_method: string;
}

/**
 * The user tried to answer too often with a wrong answer.
 */
export interface ChallengeFeedbackRateLimitExceeded {
  state: ChallengeFeedbackStatus.RateLimitExceeded;
}

/**
 * Instructions for performing authentication via an
 * IBAN bank transfer.
 */
export interface ChallengeFeedbackAuthIban {
  state: ChallengeFeedbackStatus.AuthIban;

  /**
   * Amount that should be transfered for a successful authentication.
   */
  challenge_amount: AmountString;

  /**
   * Account that should be credited.
   */
  credit_iban: string;

  /**
   * Creditor name.
   */
  business_name: string;

  /**
   * Unstructured remittance information that should
   * be contained in the bank transfer.
   */
  wire_transfer_subject: string;

  /**
   * FIXME: This field is only present for compatibility with
   * the C reducer test suite.
   */
  method: "iban";

  answer_code: number;

  /**
   * FIXME: This field is only present for compatibility with
   * the C reducer test suite.
   */
  details: {
    challenge_amount: AmountString;
    credit_iban: string;
    business_name: string;
    wire_transfer_subject: string;
  };
}

/**
 * Challenge still needs to be solved.
 */
export interface ChallengeFeedbackPending {
  state: ChallengeFeedbackStatus.Pending;
}

/**
 * Human-readable response from the provider
 * after the user failed to solve the challenge
 * correctly.
 */
export interface ChallengeFeedbackMessage {
  state: ChallengeFeedbackStatus.Message;
  message: string;
}

/**
 * The server experienced a temporary failure.
 */
export interface ChallengeFeedbackServerFailure {
  state: ChallengeFeedbackStatus.ServerFailure;
  http_status: HttpStatusCode | 0;

  /**
   * Taler-style error response, if available.
   */
  error_response?: any;
}

/**
 * The truth is unknown to the provider.  There
 * is no reason to continue trying to solve any
 * challenges in the policy.
 */
export interface ChallengeFeedbackTruthUnknown {
  state: ChallengeFeedbackStatus.TruthUnknown;
}

/**
 * The user should be asked to go to a URL
 * to complete the authentication there.
 */
export interface ChallengeFeedbackRedirect {
  state: ChallengeFeedbackStatus.Redirect;
  http_status: number;
  redirect_url: string;
}

/**
 * A payment is required before the user can
 * even attempt to solve the challenge.
 */
export interface ChallengeFeedbackPayment {
  state: ChallengeFeedbackStatus.Payment;

  taler_pay_uri: string;

  provider: string;

  /**
   * FIXME: Why is this required?!
   */
  payment_secret: string;
}
