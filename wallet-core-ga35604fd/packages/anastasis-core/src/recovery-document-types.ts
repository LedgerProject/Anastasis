import { TruthKey, TruthSalt, TruthUuid } from "./crypto.js";

export enum ChallengeType {
  Question = "question",
  Sms = "sms",
  Email = "email",
  Post = "post",
  Totp = "totp",
  Iban = "iban",
}

export interface RecoveryDocument {
  /**
   * Human-readable name of the secret
   * FIXME: Why is this optional?
   */
  secret_name?: string;

  /**
   * Encrypted core secret.
   *
   * Variable-size length, base32-crock encoded.
   */
  encrypted_core_secret: string;

  /**
   * List of escrow providers and selected authentication method.
   */
  escrow_methods: EscrowMethod[];

  /**
   * List of possible decryption policies.
   */
  policies: DecryptionPolicy[];
}

export interface DecryptionPolicy {
  /**
   * Salt included to encrypt master key share when
   * using this decryption policy.
   *
   * FIXME: Rename to policy_salt
   */
  salt: string;

  /**
   * Master key, AES-encrypted with key derived from
   * salt and keyshares revealed by the following list of
   * escrow methods identified by UUID.
   */
  master_key: string;

  /**
   * List of escrow methods identified by their UUID.
   */
  uuids: string[];
}

export interface EscrowMethod {
  /**
   * URL of the escrow provider (including possibly this Anastasis server).
   */
  url: string;

  /**
   * Type of the escrow method (e.g. security question, SMS etc.).
   */
  escrow_type: ChallengeType;

  /**
   * UUID of the escrow method.
   * 16 bytes base32-crock encoded.
   */
  uuid: TruthUuid;

  /**
   * Key used to encrypt the Truth this EscrowMethod is related to.
   * Client has to provide this key to the server when using /truth/.
   */
  truth_key: TruthKey;

  /**
   * Salt to hash the security question answer if applicable.
   */
  truth_salt: TruthSalt;

  // Salt from the provider to derive the user ID
  // at this provider.
  provider_salt: string;

  /**
   * The instructions to give to the user (i.e. the security question
   * if this is challenge-response).
   */
  instructions: string;
}
