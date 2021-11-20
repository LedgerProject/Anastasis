/*
  This file is part of Anastasis
  Copyright (C) 2020, 2021 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

  You should have received a copy of the GNU General Public License along with
  Anastasis; see the file COPYING.GPL.  If not, see <http://www.gnu.org/licenses/>
*/
/**
 * @file include/anastasis_crypto_lib.h
 * @brief anastasis crypto api
 * @author Christian Grothoff
 * @author Dominik Meister
 * @author Dennis Neufeld
 */
#include <jansson.h>
#include <gnunet/gnunet_crypto_lib.h>


/**
 * Server to client: this is the policy version.
 */
#define ANASTASIS_HTTP_HEADER_POLICY_VERSION "Anastasis-Version"

/**
 * Server to client: this is the policy expiration time.
 */
#define ANASTASIS_HTTP_HEADER_POLICY_EXPIRATION "Anastasis-Policy-Expiration"

/**
 * Client to server: use this to decrypt the truth.
 */
#define ANASTASIS_HTTP_HEADER_TRUTH_DECRYPTION_KEY \
  "Anastasis-Truth-Decryption-Key"

/**
 * Client to server: I paid using this payment secret.
 */
#define ANASTASIS_HTTP_HEADER_PAYMENT_IDENTIFIER "Anastasis-Payment-Identifier"

/**
 * Client to server: I am authorized to update this policy, or
 * server to client: I prove this is a valid policy.
 */
#define ANASTASIS_HTTP_HEADER_POLICY_SIGNATURE "Anastasis-Policy-Signature"

/**
 * Server to client: Taler Payto-URI.
 */
#define ANASTASIS_HTTP_HEADER_TALER "Taler"


GNUNET_NETWORK_STRUCT_BEGIN

/**
 * An EdDSA public key that is used to identify a user's account.
 */
struct ANASTASIS_CRYPTO_AccountPublicKeyP
{
  struct GNUNET_CRYPTO_EddsaPublicKey pub;
};


/**
 * An EdDSA private key that is used to identify a user's account.
 */
struct ANASTASIS_CRYPTO_AccountPrivateKeyP
{
  struct GNUNET_CRYPTO_EddsaPrivateKey priv;
};


/**
 * A UUID that is used to identify a truth object
 */
struct ANASTASIS_CRYPTO_TruthUUIDP
{
  struct GNUNET_ShortHashCode uuid;
};


/**
 * Specifies a TruthKey which is used to decrypt the Truth stored by the user.
 */
struct ANASTASIS_CRYPTO_TruthKeyP
{
  struct GNUNET_HashCode key GNUNET_PACKED;
};


/**
 * Specifies a salt value used to encrypt the master public key.
 */
struct ANASTASIS_CRYPTO_MasterSaltP
{
  struct GNUNET_HashCode salt GNUNET_PACKED;
};


/**
 * Specifies a salt value used for salting the answer to a security question.
 */
struct ANASTASIS_CRYPTO_QuestionSaltP
{
  struct GNUNET_CRYPTO_PowSalt pow_salt;
};


/**
 * Specifies a salt value provided by an Anastasis provider,
 * used for deriving the provider-specific user ID.
 */
struct ANASTASIS_CRYPTO_ProviderSaltP
{
  struct GNUNET_CRYPTO_PowSalt salt;
};


/**
 * Specifies a policy key which is used to decrypt the master key
 */
struct ANASTASIS_CRYPTO_PolicyKeyP
{
  struct GNUNET_HashCode key GNUNET_PACKED;
};


/**
 * Nonce used for encryption, 24 bytes.
 */
struct ANASTASIS_CRYPTO_NonceP
{
  uint8_t nonce[crypto_secretbox_NONCEBYTES];
};


/**
 * Header that is prepended to a ciphertext, consisting of nonce and MAC.
 */
struct ANASTASIS_CRYPTO_CiphertextHeaderP
{
  uint8_t header[crypto_secretbox_NONCEBYTES + crypto_secretbox_MACBYTES];
};


/**
 * Specifies a key used for symmetric encryption, 32 bytes.
 */
struct ANASTASIS_CRYPTO_SymKeyP
{
  uint32_t key[8];
};


/**
 * Specifies a Key Share from an escrow provider, the combined
 * keyshares generate the EscrowMasterKey which is used to decrypt the
 * Secret from the user.
 */
struct ANASTASIS_CRYPTO_KeyShareP
{
  uint32_t key[8];
};


/**
 * Specifies an encrypted KeyShare
 */
struct ANASTASIS_CRYPTO_EncryptedKeyShareP
{
  /**
   * Ciphertext.
   */
  struct ANASTASIS_CRYPTO_CiphertextHeaderP header;

  /**
   * The actual key share, encrypted.
   */
  struct ANASTASIS_CRYPTO_KeyShareP keyshare;
};


/**
 * The escrow master key is the key used to encrypt the user secret (MasterKey).
 */
struct ANASTASIS_CRYPTO_EscrowMasterKeyP
{
  uint32_t key[8];
};


/**
 * The user identifier consists of user information and the server salt. It is used as
 * entropy source to generate the account public key and the encryption keys.
 */
struct ANASTASIS_CRYPTO_UserIdentifierP
{
  struct GNUNET_HashCode hash GNUNET_PACKED;
};


/**
 * Random identifier used to later charge a payment.
 */
struct ANASTASIS_PaymentSecretP
{
  uint32_t id[8];
};


/**
 * Data signed by the account public key of a sync client to
 * authorize the upload of the backup.
 */
struct ANASTASIS_UploadSignaturePS
{
  /**
   * Set to #TALER_SIGNATURE_ANASTASIS_POLICY_UPLOAD.
   */
  struct GNUNET_CRYPTO_EccSignaturePurpose purpose;

  /**
   * Hash of the new backup.
   */
  struct GNUNET_HashCode new_recovery_data_hash;

};


/**
 * Signature made with an account's public key.
 */
struct ANASTASIS_AccountSignatureP
{
  /**
   * We use EdDSA.
   */
  struct GNUNET_CRYPTO_EddsaSignature eddsa_sig;
};


GNUNET_NETWORK_STRUCT_END

/**
 * Result of encrypting the core secret.
 */
struct ANASTASIS_CoreSecretEncryptionResult
{
  /**
   * Encrypted core secret.
   */
  void *enc_core_secret;

  /**
   * Size of the encrypted core secret.
   */
  size_t enc_core_secret_size;

  /**
   * Array of encrypted master keys.  Each key is encrypted
   * to a different policy key.
   */
  void **enc_master_keys;

  /**
   * Sizes of the encrypted master keys.
   */
  size_t *enc_master_key_sizes;
};


/**
 * Hash a numerical answer to compute the hash value to be submitted
 * to the server for verification. Useful for PINs and SMS-TANs and
 * other numbers submitted for challenges.
 *
 * @param code the numeric value to hash
 * @param[out] hashed_code the resulting hash value to submit to the Anastasis server
 */
void
ANASTASIS_hash_answer (uint64_t code,
                       struct GNUNET_HashCode *hashed_code);


/**
 * Creates the UserIdentifier, it is used as entropy source for the
 * encryption keys and for the public and private key for signing the
 * data.
 *
 * @param id_data JSON encoded data, which contains the raw user secret
 * @param server_salt salt from the server (escrow provider)
 * @param[out] id reference to the id which was created
 */
void
ANASTASIS_CRYPTO_user_identifier_derive (
  const json_t *id_data,
  const struct ANASTASIS_CRYPTO_ProviderSaltP *server_salt,
  struct ANASTASIS_CRYPTO_UserIdentifierP *id);


/**
 * Generates the eddsa public Key used as the account identifier on the providers
 *
 * @param id holds a hashed user secret which is used as entropy source for the public key generation
 * @param[out] pub_key handle for the generated public key
 */
void
ANASTASIS_CRYPTO_account_public_key_derive (
  const struct ANASTASIS_CRYPTO_UserIdentifierP *id,
  struct ANASTASIS_CRYPTO_AccountPublicKeyP *pub_key);


/**
 * //FIXME combine these two
 * Generates the eddsa public Key used as the account identifier on the providers
 *
 * @param id holds a hashed user secret which is used as entropy source for the public key generation
 * @param[out] priv_key handle for the generated private key
 */
void
ANASTASIS_CRYPTO_account_private_key_derive (
  const struct ANASTASIS_CRYPTO_UserIdentifierP *id,
  struct ANASTASIS_CRYPTO_AccountPrivateKeyP *priv_key);


/**
 * Hash @a answer to security question with @a salt and @a uuid to compute
 * @a result that would be sent to the service for authorization.
 *
 * @param answer human answer to a security question
 * @param uuid the truth UUID (known to the service)
 * @param salt random salt value, unknown to the service
 * @param[out] result where to write the resulting hash
 */
void
ANASTASIS_CRYPTO_secure_answer_hash (
  const char *answer,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *uuid,
  const struct ANASTASIS_CRYPTO_QuestionSaltP *salt,
  struct GNUNET_HashCode *result);


/**
 * Encrypt and signs the recovery document, the recovery
 * document is encrypted with a derivation from the user identifier
 * and the salt "erd".
 *
 * @param id Hashed User input, used for the generation of the encryption key
 * @param rec_doc contains the recovery document as raw data
 * @param rd_size defines the size of the recovery document inside data
 * @param[out] enc_rec_doc return from the result, which contains the encrypted recovery document
 *            and the nonce and iv used for the encryption as Additional Data
 * @param[out] erd_size size of the result
 */
void
ANASTASIS_CRYPTO_recovery_document_encrypt (
  const struct ANASTASIS_CRYPTO_UserIdentifierP *id,
  const void *rec_doc,
  size_t rd_size,
  void **enc_rec_doc,
  size_t *erd_size);


/**
 * Decrypts the recovery document, the decryption key is generated with
 * the user identifier provided by the user and the salt "erd". The nonce and IV used for the encryption
 * are the first 48 bytes of the data.
 *
 * @param id Hashed User input, used for the generation of the encryption key
 * @param enc_rec_doc contains the encrypted recovery document and the nonce and iv used for the encryption.
 * @param erd_size size of the data
 * @param[out] rec_doc return from the result, which contains the encrypted recovery document
 *            and the nonce and iv used for the encryption as Additional Data
 * @param[out] rd_size size of the result
 */
void
ANASTASIS_CRYPTO_recovery_document_decrypt (
  const struct ANASTASIS_CRYPTO_UserIdentifierP *id,
  const void *enc_rec_doc,
  size_t erd_size,
  void **rec_doc,
  size_t *rd_size);


/**
 * Encrypts a keyshare with a key generated with the user identification as entropy and the salt "eks".
 *
 * @param key_share the key share which is afterwards encrypted
 * @param id the user identification which is the entropy source for the key generation
 * @param xsalt answer to security question, otherwise NULL; used as extra salt in KDF
 * @param[out] enc_key_share holds the encrypted share, the first 48 Bytes are the used nonce and tag
 */
void
ANASTASIS_CRYPTO_keyshare_encrypt (
  const struct ANASTASIS_CRYPTO_KeyShareP *key_share,
  const struct ANASTASIS_CRYPTO_UserIdentifierP *id,
  const char *xsalt,
  struct ANASTASIS_CRYPTO_EncryptedKeyShareP *enc_key_share);


/**
 * Decrypts a keyshare with a key generated with the user identification as entropy and the salt "eks".
 *
 * @param enc_key_share holds the encrypted share, the first 48 Bytes are the used nonce and tag
 * @param id the user identification which is the entropy source for the key generation
 * @param xsalt answer to security question, otherwise NULL; used as extra salt in KDF
 * @param[out] key_share the result of decryption
 */
void
ANASTASIS_CRYPTO_keyshare_decrypt (
  const struct ANASTASIS_CRYPTO_EncryptedKeyShareP *enc_key_share,
  const struct ANASTASIS_CRYPTO_UserIdentifierP *id,
  const char *xsalt,
  struct ANASTASIS_CRYPTO_KeyShareP *key_share);


/**
 * Encrypts the truth data which contains the hashed answer or the
 * phone number.  It is encrypted with xsalsa20-poly1305, the key is generated
 * with the user identification as entropy source and the salt "ect".
 *
 * @param nonce value to use for the nonce
 * @param truth_enc_key master key used for encryption of the truth (see interface EscrowMethod)
 * @param truth truth which will be encrypted
 * @param truth_size size of the truth
 * @param[out] enc_truth return from the result, which contains the encrypted truth
 *            and the nonce and iv used for the encryption as Additional Data
 * @param[out] ect_size size of the result
 */
void
ANASTASIS_CRYPTO_truth_encrypt (
  const struct ANASTASIS_CRYPTO_NonceP *nonce,
  const struct ANASTASIS_CRYPTO_TruthKeyP *truth_enc_key,
  const void *truth,
  size_t truth_size,
  void **enc_truth,
  size_t *ect_size);


/**
 * Decrypts the truth data which contains the hashed answer or the phone number..
 * It is decrypted with xsalsa20-poly1305, the key is generated with the user identification as
 * entropy source and the salt "ect".
 *
 * @param truth_enc_key master key used for encryption of the truth (see interface EscrowMethod)
 * @param enc_truth truth holds the encrypted truth which will be decrypted
 * @param ect_size size of the truth data
 * @param truth return from the result, which contains the truth
 * @param truth_size size of the result
 */
void
ANASTASIS_CRYPTO_truth_decrypt (
  const struct ANASTASIS_CRYPTO_TruthKeyP *truth_enc_key,
  const void *enc_truth,
  size_t ect_size,
  void **truth,
  size_t *truth_size);


/**
 * A key share is randomly generated, one key share is generated for every
 * truth a policy contains.
 *
 * @param[out] key_share reference to the created key share.
 */
void
ANASTASIS_CRYPTO_keyshare_create (
  struct ANASTASIS_CRYPTO_KeyShareP *key_share);


/**
 * Once per policy a policy key is derived. The policy key consists of
 * multiple key shares which are combined and hashed.
 *
 * @param key_shares list of key shares which are combined
 * @param keyshare_length amount of key shares inside the array
 * @param salt salt value
 * @param[out] policy_key reference to the created key
 */
void
ANASTASIS_CRYPTO_policy_key_derive (
  const struct ANASTASIS_CRYPTO_KeyShareP *key_shares,
  unsigned int keyshare_length,
  const struct ANASTASIS_CRYPTO_MasterSaltP *salt,
  struct ANASTASIS_CRYPTO_PolicyKeyP *policy_key);


/**
 * The core secret is the user provided secret which will be saved with Anastasis.
 * The secret will be encrypted with the master key, the master key is a random key which will
 * be generated. The master key afterwards will be encrypted with the different policy keys.
 * Encryption is performed with xsalsa20-poly1305.
 *
 * @param policy_keys an array of policy keys which are used to encrypt the master key
 * @param policy_keys_length defines the amount of policy keys and also the amount of encrypted master keys
 * @param core_secret the user provided core secret which is secured by anastasis
 * @param core_secret_size the size of the core secret
 * @returns result of the encryption, must be freed with #ANASTASIS_CRYPTO_destroy_encrypted_core_secret
 */
struct ANASTASIS_CoreSecretEncryptionResult *
ANASTASIS_CRYPTO_core_secret_encrypt (
  const struct ANASTASIS_CRYPTO_PolicyKeyP *policy_keys,
  unsigned int policy_keys_length,
  const void *core_secret,
  size_t core_secret_size);


/**
 * Destroy a core secret encryption result.
 *
 * @param cser the result to destroy
 */
void
ANASTASIS_CRYPTO_destroy_encrypted_core_secret (
  struct ANASTASIS_CoreSecretEncryptionResult *cser);


/**
 * Decrypts the core secret with the master key. First the master key is decrypted with the provided policy key.
 * Afterwards the core secret is encrypted with the master key. The core secret is returned.
 *
 * @param encrypted_master_key master key for decrypting the core secret, is itself encrypted by the policy key
 * @param encrypted_master_key_size size of the encrypted master key
 * @param policy_key built policy key which will decrypt the master key
 * @param encrypted_core_secret the encrypted core secret from the user, will be encrypted with the policy key
 * @param encrypted_core_secret_size size of the encrypted core secret
 * @param[out] core_secret decrypted core secret will be returned
 * @param[out] core_secret_size size of core secret
 */
void
ANASTASIS_CRYPTO_core_secret_recover (
  const void *encrypted_master_key,
  size_t encrypted_master_key_size,
  const struct ANASTASIS_CRYPTO_PolicyKeyP *policy_key,
  const void *encrypted_core_secret,
  size_t encrypted_core_secret_size,
  void **core_secret,
  size_t *core_secret_size);


/**
 * Convert a @a uuid to a shortened, human-readable string
 * useful to show to users to identify the truth.
 * Note that the return value is in a global variable and
 * only valid until the next invocation of this function.
 *
 * @param uuid UUID to convert
 * @return string representation
 */
const char *
ANASTASIS_CRYPTO_uuid2s (const struct ANASTASIS_CRYPTO_TruthUUIDP *uuid);
