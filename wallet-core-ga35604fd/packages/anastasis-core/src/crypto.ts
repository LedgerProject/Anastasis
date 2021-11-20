import {
  bytesToString,
  canonicalJson,
  decodeCrock,
  encodeCrock,
  getRandomBytes,
  kdf,
  kdfKw,
  secretbox,
  crypto_sign_keyPair_fromSeed,
  stringToBytes,
  secretbox_open,
  hash,
} from "@gnu-taler/taler-util";
import { argon2id } from "hash-wasm";

export type Flavor<T, FlavorT extends string> = T & {
  _flavor?: `anastasis.${FlavorT}`;
};
export type FlavorP<T, FlavorT extends string, S extends number> = T & {
  _flavor?: `anastasis.${FlavorT}`;
  _size?: S;
};

export type UserIdentifier = Flavor<string, "UserIdentifier">;
export type ServerSalt = Flavor<string, "ServerSalt">;
export type PolicySalt = Flavor<string, "PolicySalt">;
export type PolicyKey = FlavorP<string, "PolicyKey", 64>;
export type KeyShare = Flavor<string, "KeyShare">;
export type EncryptedKeyShare = Flavor<string, "EncryptedKeyShare">;
export type EncryptedTruth = Flavor<string, "EncryptedTruth">;
export type EncryptedCoreSecret = Flavor<string, "EncryptedCoreSecret">;
export type EncryptedMasterKey = Flavor<string, "EncryptedMasterKey">;
export type EddsaPublicKey = Flavor<string, "EddsaPublicKey">;
export type EddsaPrivateKey = Flavor<string, "EddsaPrivateKey">;
export type TruthUuid = Flavor<string, "TruthUuid">;
export type SecureAnswerHash = Flavor<string, "SecureAnswerHash">;
/**
 * Truth-specific randomness, also called question salt sometimes.
 */
export type TruthSalt = Flavor<string, "TruthSalt">;
/**
 * Truth key, found in the recovery document.
 */
export type TruthKey = Flavor<string, "TruthKey">;
export type EncryptionNonce = Flavor<string, "EncryptionNonce">;
export type OpaqueData = Flavor<string, "OpaqueData">;

const nonceSize = 24;
const masterKeySize = 64;

export async function userIdentifierDerive(
  idData: any,
  serverSalt: ServerSalt,
): Promise<UserIdentifier> {
  const canonIdData = canonicalJson(idData);
  const hashInput = stringToBytes(canonIdData);
  const result = await argon2id({
    hashLength: 64,
    iterations: 3,
    memorySize: 1024 /* kibibytes */,
    parallelism: 1,
    password: hashInput,
    salt: decodeCrock(serverSalt),
    outputType: "binary",
  });
  return encodeCrock(result);
}

export interface AccountKeyPair {
  priv: EddsaPrivateKey;
  pub: EddsaPublicKey;
}

export function accountKeypairDerive(userId: UserIdentifier): AccountKeyPair {
  // FIXME: the KDF invocation looks fishy, but that's what the C code presently does.
  const d = kdfKw({
    outputLength: 32,
    ikm: decodeCrock(userId),
    info: stringToBytes("ver"),
  });
  const pair = crypto_sign_keyPair_fromSeed(d);
  return {
    priv: encodeCrock(d),
    pub: encodeCrock(pair.publicKey),
  };
}

/**
 * Encrypt the recovery document.
 *
 * The caller should first compress the recovery doc.
 */
export async function encryptRecoveryDocument(
  userId: UserIdentifier,
  recoveryDocData: OpaqueData,
): Promise<OpaqueData> {
  const nonce = encodeCrock(getRandomBytes(nonceSize));
  return anastasisEncrypt(nonce, asOpaque(userId), recoveryDocData, "erd");
}

/**
 * Encrypt the recovery document.
 *
 * The caller should first compress the recovery doc.
 */
export async function decryptRecoveryDocument(
  userId: UserIdentifier,
  recoveryDocData: OpaqueData,
): Promise<OpaqueData> {
  return anastasisDecrypt(asOpaque(userId), recoveryDocData, "erd");
}

export function typedArrayConcat(chunks: Uint8Array[]): Uint8Array {
  let payloadLen = 0;
  for (const c of chunks) {
    payloadLen += c.byteLength;
  }
  const buf = new ArrayBuffer(payloadLen);
  const u8buf = new Uint8Array(buf);
  let p = 0;
  for (const c of chunks) {
    u8buf.set(c, p);
    p += c.byteLength;
  }
  return u8buf;
}

export async function policyKeyDerive(
  keyShares: KeyShare[],
  policySalt: PolicySalt,
): Promise<PolicyKey> {
  const chunks = keyShares.map((x) => decodeCrock(x));
  const polKey = kdfKw({
    outputLength: 64,
    ikm: typedArrayConcat(chunks),
    salt: decodeCrock(policySalt),
    info: stringToBytes("anastasis-policy-key-derive"),
  });

  return encodeCrock(polKey);
}

async function deriveKey(
  keySeed: OpaqueData,
  nonce: EncryptionNonce,
  salt: string,
): Promise<Uint8Array> {
  return kdfKw({
    outputLength: 32,
    salt: decodeCrock(nonce),
    ikm: decodeCrock(keySeed),
    info: stringToBytes(salt),
  });
}

async function anastasisEncrypt(
  nonce: EncryptionNonce,
  keySeed: OpaqueData,
  plaintext: OpaqueData,
  salt: string,
): Promise<OpaqueData> {
  const key = await deriveKey(keySeed, nonce, salt);
  const nonceBuf = decodeCrock(nonce);
  const cipherText = secretbox(decodeCrock(plaintext), decodeCrock(nonce), key);
  return encodeCrock(typedArrayConcat([nonceBuf, cipherText]));
}

async function anastasisDecrypt(
  keySeed: OpaqueData,
  ciphertext: OpaqueData,
  salt: string,
): Promise<OpaqueData> {
  const ctBuf = decodeCrock(ciphertext);
  const nonceBuf = ctBuf.slice(0, nonceSize);
  const enc = ctBuf.slice(nonceSize);
  const key = await deriveKey(keySeed, encodeCrock(nonceBuf), salt);
  const cipherText = secretbox_open(enc, nonceBuf, key);
  if (!cipherText) {
    throw Error("could not decrypt");
  }
  return encodeCrock(cipherText);
}

export const asOpaque = (x: string): OpaqueData => x;
const asEncryptedKeyShare = (x: OpaqueData): EncryptedKeyShare => x as string;
const asEncryptedTruth = (x: OpaqueData): EncryptedTruth => x as string;
const asKeyShare = (x: OpaqueData): KeyShare => x as string;

export async function encryptKeyshare(
  keyShare: KeyShare,
  userId: UserIdentifier,
  answerSalt?: string,
): Promise<EncryptedKeyShare> {
  const s = answerSalt ?? "eks";
  const nonce = encodeCrock(getRandomBytes(24));
  return asEncryptedKeyShare(
    await anastasisEncrypt(nonce, asOpaque(userId), asOpaque(keyShare), s),
  );
}

export async function decryptKeyShare(
  encKeyShare: EncryptedKeyShare,
  userId: UserIdentifier,
  answerSalt?: string,
): Promise<KeyShare> {
  const s = answerSalt ?? "eks";
  return asKeyShare(
    await anastasisDecrypt(asOpaque(userId), asOpaque(encKeyShare), s),
  );
}

export async function encryptTruth(
  nonce: EncryptionNonce,
  truthEncKey: TruthKey,
  truth: OpaqueData,
): Promise<EncryptedTruth> {
  const salt = "ect";
  return asEncryptedTruth(
    await anastasisEncrypt(nonce, asOpaque(truthEncKey), truth, salt),
  );
}

export async function decryptTruth(
  truthEncKey: TruthKey,
  truthEnc: EncryptedTruth,
): Promise<OpaqueData> {
  const salt = "ect";
  return await anastasisDecrypt(
    asOpaque(truthEncKey),
    asOpaque(truthEnc),
    salt,
  );
}

export interface CoreSecretEncResult {
  encCoreSecret: EncryptedCoreSecret;
  encMasterKeys: EncryptedMasterKey[];
}

export async function coreSecretRecover(args: {
  encryptedMasterKey: OpaqueData;
  policyKey: PolicyKey;
  encryptedCoreSecret: OpaqueData;
}): Promise<OpaqueData> {
  const masterKey = await anastasisDecrypt(
    asOpaque(args.policyKey),
    args.encryptedMasterKey,
    "emk",
  );
  return await anastasisDecrypt(masterKey, args.encryptedCoreSecret, "cse");
}

export async function coreSecretEncrypt(
  policyKeys: PolicyKey[],
  coreSecret: OpaqueData,
): Promise<CoreSecretEncResult> {
  const masterKey = getRandomBytes(masterKeySize);
  const nonce = encodeCrock(getRandomBytes(nonceSize));
  const coreSecretEncSalt = "cse";
  const masterKeyEncSalt = "emk";
  const encCoreSecret = (await anastasisEncrypt(
    nonce,
    encodeCrock(masterKey),
    coreSecret,
    coreSecretEncSalt,
  )) as string;
  const encMasterKeys: EncryptedMasterKey[] = [];
  for (let i = 0; i < policyKeys.length; i++) {
    const polNonce = encodeCrock(getRandomBytes(nonceSize));
    const encMasterKey = await anastasisEncrypt(
      polNonce,
      asOpaque(policyKeys[i]),
      encodeCrock(masterKey),
      masterKeyEncSalt,
    );
    encMasterKeys.push(encMasterKey as string);
  }
  return {
    encCoreSecret,
    encMasterKeys,
  };
}

export async function pinAnswerHash(pin: number): Promise<SecureAnswerHash> {
  return encodeCrock(hash(stringToBytes(pin.toString())));
}

export async function secureAnswerHash(
  answer: string,
  truthUuid: TruthUuid,
  questionSalt: TruthSalt,
): Promise<SecureAnswerHash> {
  const powResult = await argon2id({
    hashLength: 64,
    iterations: 3,
    memorySize: 1024 /* kibibytes */,
    parallelism: 1,
    password: stringToBytes(answer),
    salt: decodeCrock(questionSalt),
    outputType: "binary",
  });
  const kdfResult = kdfKw({
    outputLength: 64,
    salt: decodeCrock(truthUuid),
    ikm: powResult,
    info: stringToBytes("anastasis-secure-question-hashing"),
  });
  return encodeCrock(kdfResult);
}
