..
  This file is part of Anastasis
  Copyright (C) 2019-2021 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU Affero General Public License as published by the Free Software
  Foundation; either version 2.1, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with
  Anastasis; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>

  @author Christian Grothoff
  @author Dominik Meister
  @author Dennis Neufeld


========
REST API
========

.. include:: core/api-common.rst

.. _salt:
.. _config:


-----------------------
Receiving Configuration
-----------------------

.. http:get:: /config

  Obtain the configuration details of the escrow provider.

  **Response:**

  Returns an `EscrowConfigurationResponse`_.


  .. _EscrowConfigurationResponse:
  .. ts:def:: EscrowConfigurationResponse

    interface EscrowConfigurationResponse {

      // Protocol identifier, clarifies that this is an Anastasis provider.
      name: "anastasis";

      // libtool-style representation of the Exchange protocol version, see
      // https://www.gnu.org/software/libtool/manual/html_node/Versioning.html#Versioning
      // The format is "current:revision:age".
      version: string;

      // Currency in which this provider processes payments.
      currency: string;

      // Supported authorization methods.
      methods: AuthorizationMethodConfig[];

      // Maximum policy upload size supported.
      storage_limit_in_megabytes: number;

      // Payment required to maintain an account to store policy documents for a year.
      // Users can pay more, in which case the storage time will go up proportionally.
      annual_fee: Amount;

      // Payment required to upload truth.  To be paid per upload.
      truth_upload_fee: Amount;

      // Limit on the liability that the provider is offering with
      // respect to the services provided.
      liability_limit: Amount;

      // Salt value with 128 bits of entropy.
      // Different providers
      // will use different high-entropy salt values. The resulting
      // **provider salt** is then used in various operations to ensure
      // cryptographic operations differ by provider.  A provider must
      // never change its salt value.
      server_salt: string;

    }

  .. _AuthorizationMethodConfig:
  .. ts:def:: AuthorizationMethodConfig

    interface AuthorizationMethodConfig {
      // Name of the authorization method.
      type: string;

      // Fee for accessing key share using this method.
      cost: Amount;

    }

.. _terms:

--------------------------
Receiving Terms of Service
--------------------------

.. http:get:: /terms

  Obtain the terms of service provided by the escrow provider.

  **Response:**

  Returns the terms of service of the provider, in the best language
  and format available based on the client's request.

.. http:get:: /privacy

  Obtain the privacy policy of the service provided by the escrow provider.

  **Response:**

  Returns the privacy policy of the provider, in the best language
  and format available based on the client's request.


.. _manage-policy:


---------------
Managing policy
---------------

This API is used by the Anastasis client to deposit or request encrypted
recovery documents with the escrow provider.  Generally, a client will deposit
the same encrypted recovery document with each escrow provider, but provide
a different truth to each escrow provider.

Operations by the client are identified and authorized by ``$ACCOUNT_PUB``, which
should be kept secret from third parties. ``$ACCOUNT_PUB`` should be an account
public key using the Crockford base32-encoding.

In the following, UUID is always defined and used according to `RFC 4122`_.

.. _`RFC 4122`: https://tools.ietf.org/html/rfc4122

.. http:get:: /policy/$ACCOUNT_PUB[?version=$NUMBER]

  Get the customer's encrypted recovery document.  If ``version``
  is not specified, the server returns the latest available version.  If
  ``version`` is specified, returns the policy with the respective
  ``version``.  The response must begin with the nonce and
  an AES-GCM tag and continue with the ciphertext.  Once decrypted, the
  plaintext is expected to contain:

  * the escrow policy
  * the separately encrypted master public key

  Note that the key shares required to decrypt the master public key are
  not included, as for this the client needs to obtain authorization.
  The policy does provide sufficient information for the client to determine
  how to authorize requests for **truth**.

  The client MAY provide an ``If-None-Match`` header with an Etag.
  In that case, the server MUST additionally respond with an ``304`` status
  code in case the resource matches the provided Etag.

  **Response**:

  :http:statuscode:`200 OK`:
    The escrow provider responds with an EncryptedRecoveryDocument_ object.
  :http:statuscode:`304 Not modified`:
    The client requested the same resource it already knows.
  :http:statuscode:`400 Bad request`:
    The ``$ACCOUNT_PUB`` is not an EdDSA public key.
  :http:statuscode:`402 Payment Required`:
    The account's balance is too low for the specified operation.
    See the Taler payment protocol specification for how to pay.
  :http:statuscode:`403 Forbidden`:
    The required account signature was invalid.
  :http:statuscode:`404 Not found`:
    The requested resource was not found.

  *Anastasis-Version*: $NUMBER --- The server must return actual version of the encrypted recovery document via this header.
  If the client specified a version number in the header of the request, the server must return that version. If the client
  did not specify a version in the request, the server returns latest version of the EncryptedRecoveryDocument_.

  *Etag*: Set by the server to the Base32-encoded SHA512 hash of the body. Used for caching and to prevent redundancies. The server MUST send the Etag if the status code is ``200 OK``.

  *If-None-Match*: If this is not the very first request of the client, this contains the Etag-value which the client has received before from the server.
  The client SHOULD send this header with every request (except for the first request) to avoid unnecessary downloads.


.. http:post:: /policy/$ACCOUNT_PUB

  Upload a new version of the customer's encrypted recovery document.
  While the document's structure is described in JSON below, the upload
  should just be the bytestream of the raw data (i.e. 32-byte nonce followed
  by 16-byte tag followed by the encrypted document).
  If the request has been seen before, the server should do nothing, and otherwise store the new version.
  The body must begin with a nonce, an AES-GCM tag and continue with the ciphertext.  The format
  is the same as specified for the response of the GET method. The
  Anastasis server cannot fully validate the format, but MAY impose
  minimum and maximum size limits.

  **Request**:

  :query storage_duration=YEARS:
     For how many years from now would the client like us to
     store the recovery document? Defaults to 0 (that is, do
     not extend / prolong existing storage contract).
     The server will respond with a ``402 Payment required``, but only
     if the rest of the request is well-formed (account
     signature must match).  Clients that do not actually
     intend to make a new upload but that only want to pay
     may attempt to upload the latest backup again, as this
     option will be checked before the ``304 Not modified``
     case.
  :query timeout_ms=NUMBER: *Optional.*  If specified, the Anastasis server will
    wait up to ``timeout_ms`` milliseconds for completion of the payment before
    sending the HTTP response.  A client must never rely on this behavior, as the
    backend may return a response immediately.

  *If-None-Match*: This header MUST be present and set to the SHA512 hash (Etag) of the body by the client.
  The client SHOULD also set the ``Expect: 100-Continue`` header and wait for ``100 continue``
  before uploading the body.  The server MUST
  use the Etag to check whether it already knows the encrypted recovery document that is about to be uploaded.
  The server MUST refuse the upload with a ``304`` status code if the Etag matches
  the latest version already known to the server.

  *Anastasis-Policy-Signature*: The client must provide Base-32 encoded EdDSA signature over hash of body with ``$ACCOUNT_PRIV``, affirming desire to upload an encrypted recovery document.

  *Payment-Identifier*: Base-32 encoded 32-byte payment identifier that was included in a previous payment (see ``402`` status code). Used to allow the server to check that the client paid for the upload (to protect the server against DoS attacks) and that the client knows a real secret of financial value (as the **kdf_id** might be known to an attacker). If this header is missing in the client's request (or the associated payment has exceeded the upload limit), the server must return a ``402`` response.  When making payments, the server must include a fresh, randomly-generated payment-identifier in the payment request.

  **Response**:

  :http:statuscode:`204 No content`:
    The encrypted recovery document was accepted and stored.  ``Anastasis-Version``
    indicates what version was assigned to this encrypted recovery document upload by the server.
    ``Anastasis-Policy-Expiration`` indicates the time until the server promises to store the policy,
    in seconds since epoch.
  :http:statuscode:`304 Not modified`:
    The same encrypted recovery document was previously accepted and stored.  ``Anastasis-Version`` header
    indicates what version was previously assigned to this encrypted recovery document.
  :http:statuscode:`400 Bad request`:
    The ``$ACCOUNT_PUB`` is not an EdDSA public key or mandatory headers are missing.
    The response body MUST elaborate on the error using a Taler error code in the typical JSON encoding.
  :http:statuscode:`402 Payment required`:
    The account's balance is too low for the specified operation.
    See the Taler payment protocol specification for how to pay.
    The response body MAY provide alternative means for payment.
  :http:statuscode:`403 Forbidden`:
    The required account signature was invalid.  The response body may elaborate on the error.
  :http:statuscode:`413 Request entity too large`:
    The upload is too large *or* too small. The response body may elaborate on the error.

  **Details:**

  .. _EncryptedRecoveryDocument:
  .. ts:def:: EncryptedRecoveryDocument

    interface EncryptedRecoveryDocument {
      // Nonce used to compute the (iv,key) pair for encryption of the
      // encrypted_compressed_recovery_document.
      nonce: [32]; //bytearray

      // Authentication tag.
      aes_gcm_tag: [16]; //bytearray

      // Variable-size encrypted recovery document. After decryption,
      // this contains a gzip compressed JSON-encoded `RecoveryDocument`.
      // The salt of the HKDF for this encryption must include the
      // string "erd".
      encrypted_compressed_recovery_document: []; //bytearray of undefined length

    }

  .. _RecoveryDocument:
  .. ts:def:: RecoveryDocument

    interface RecoveryDocument {
      // Human-readable name of the secret
      secret_name?: string;

      // Encrypted core secret.
      encrypted_core_secret: string; // bytearray of undefined length

      // List of escrow providers and selected authentication method.
      escrow_methods: EscrowMethod[];

      // List of possible decryption policies.
      policies: DecryptionPolicy[];

    }

  .. _EscrowMethod:
  .. ts:def:: EscrowMethod

    interface EscrowMethod {
      // URL of the escrow provider (including possibly this Anastasis server).
      url : string;

      // Type of the escrow method (e.g. security question, SMS etc.).
      escrow_type: string;

      // UUID of the escrow method (see /truth/ API below).
      uuid: string;

      // Key used to encrypt the `Truth` this `EscrowMethod` is related to.
      // Client has to provide this key to the server when using ``/truth/``.
      truth_key: [32]; //bytearray

      // Salt used to hash the security answer if appliccable.
      truth_salt: [32]; //bytearray

      // Salt from the provider to derive the user ID
      // at this provider.
      provider_salt: [32]; //bytearray

      // The instructions to give to the user (i.e. the security question
      // if this is challenge-response).
      // (Q: as string in base32 encoding?)
      // (Q: what is the mime-type of this value?)
      //
      // The plaintext challenge is not revealed to the
      // Anastasis server.
      instructions: string;

    }

  .. _DecryptionPolicy:
  .. ts:def:: DecryptionPolicy

    interface DecryptionPolicy {
      // Salt included to encrypt master key share when
      // using this decryption policy.
      salt: [32]; //bytearray

      // Master key, AES-encrypted with key derived from
      // salt and keyshares revealed by the following list of
      // escrow methods identified by UUID.
      master_key: [32]; //bytearray

      // List of escrow methods identified by their UUID.
      uuids: string[];

    }

.. _Truth:

--------------
Managing truth
--------------

Truth always consists of an encrypted key share and encrypted
authentication data.  The key share and the authentication data
are encrypted using different keys. Additionally, truth includes
the name of the authentication method, the mime-type of the
authentication data, and an expiration time in
cleartext.

This API is used by the Anastasis client to deposit **truth** or request a (encrypted) **key share** with
the escrow provider.

An **escrow method** specifies an Anastasis provider and how the user should
authorize themself.  The **truth** API allows the user to provide the
(encrypted) key share to the respective escrow provider, as well as auxiliary
data required for such a respective escrow method.

An Anastasis-server may store truth for free for a certain time period, or
charge per truth operation using GNU Taler.

.. http:post:: /truth/$UUID

  Upload a `TruthUploadRequest`_-Object according to the policy the client created before (see `RecoveryDocument`_).
  If request has been seen before, the server should do nothing, and otherwise store the new object.

  **Request:**

  :query timeout_ms=NUMBER: *Optional.*  If specified, the Anastasis server will
    wait up to ``timeout_ms`` milliseconds for completion of the payment before
    sending the HTTP response.  A client must never rely on this behavior, as the
    backend may return a response immediately.

  **Response:**

  :http:statuscode:`204 No content`:
    Truth stored successfully.
  :http:statuscode:`304 Not modified`:
    The same truth was previously accepted and stored under this UUID.  The
    Anastasis server must still update the expiration time for the truth when returning
    this response code.
  :http:statuscode:`402 Payment required`:
    This server requires payment to store truth per item.
    See the Taler payment protocol specification for how to pay.
    The response body MAY provide alternative means for payment.
  :http:statuscode:`409 Conflict`:
    The server already has some truth stored under this UUID. The client should check that it
    is generating UUIDs with enough entropy.
  :http:statuscode:`412 Precondition failed`:
    The selected authentication method is not supported on this provider.


  **Details:**

  .. _TruthUploadRequest:
  .. ts:def:: TruthUploadRequest

    interface TruthUploadRequest {
      // Contains the information of an interface `EncryptedKeyShare`, but simply
      // as one binary block (in Crockford Base32 encoding for JSON).
      key_share_data: []; //bytearray

      // Key share method, i.e. "security question", "SMS", "e-mail", ...
      type: string;

      // Variable-size truth. After decryption,
      // this contains the ground truth, i.e. H(challenge answer),
      // phone number, e-mail address, picture, fingerprint, ...
      // **base32 encoded**.
      //
      // The nonce of the HKDF for this encryption must include the
      // string "ECT".
      encrypted_truth: []; //bytearray

      // MIME type of truth, i.e. text/ascii, image/jpeg, etc.
      truth_mime?: string;

      // For how many years from now would the client like us to
      // store the truth?
      storage_duration_years: Integer;

    }

.. http:get:: /truth/$UUID

  Get the stored encrypted key share.
  Also, the user has to provide the correct *truth_encryption_key* with every get request (see below).
  The encrypted key share is returned simply as a byte array and not in JSON format.

  :query response=H_RESPONSE: *Optional.*  If ``$H_RESPONSE`` is specified by the client,
    the server checks if ``$H_RESPONSE`` matches the expected response. This can be the
    hash of the security question (as specified before by the client
    within the `TruthUploadRequest`_ (see ``encrypted_truth``)), or the hash of the
    PIN code sent via SMS, E-mail or postal communication channels.
    When ``$H_RESPONSE`` is correct, the server responds with the encrypted key share.
  :query timeout_ms=NUMBER: *Optional.*  If specified, the Anastasis server will
    wait up to ``timeout_ms`` milliseconds for completion of the payment or the
    challenge before sending the HTTP response.  A client must never rely on this
    behavior, as the backend may return a response immediately.

  **Response**:

  :http:statuscode:`200 OK`:
    `EncryptedKeyShare`_ is returned in body (in binary).
  :http:statuscode:`202 Accepted`:
    The escrow provider will respond out-of-band (i.e. SMS).
    The body may contain human- or machine-readable instructions on next steps.
    In case the response is in JSON, the format is given
    by `ChallengeInstructionMessage`_.
  :http:statuscode:`208 Already Reported`:
    An authentication challenge was recently send, client should
    simply respond to the pending challenge.
  :http:statuscode:`303 See other`:
    The provider redirects for authentication (i.e. video identification/WebRTC).
    If the client is not a browser, it should launch a browser at the URL
    given in the ``Location`` header and allow the user to re-try the operation
    after successful authorization.
  :http:statuscode:`402 Payment required`:
    The service requires payment for access to truth.
    See the Taler payment protocol specification for how to pay.
    The response body MAY provide alternative means for payment.
  :http:statuscode:`403 Forbidden`:
    The server requires a valid "response" to the challenge associated with the UUID.
  :http:statuscode:`404 Not found`:
    The server does not know any truth under the given UUID.
  :http:statuscode:`408 Request Timeout`:
    Accessing this truth requires satisfying an external authentication challenge
    (and not merely passing a response in the request) and this has not happened
    before the timeout was reached.
  :http:statuscode:`410 Gone`:
    The server has not (recently) issued a challenge under the given UUID,
    but a reply was provided. (This does not apply for secure question.)
  :http:statuscode:`417 Expectation Failed`:
    The decrypted ``truth`` does not match the expectations of the authentication
    backend, i.e. a phone number for sending an SMS is not a number, or
    an e-mail address for sending an E-mail is not a valid e-mail address.
  :http:statuscode:`503 Service Unavailable`:
    Server is out of Service.

  *Anastasis-Truth-Decryption-Key*: Key used to encrypt the **truth** (see encrypted_truth within `TruthUploadRequest`_) and which has to provided by the user. The key is stored with
  the according `EscrowMethod`_. The server needs this key to get the info out of `TruthUploadRequest`_ needed to verify the ``$RESPONSE``.

  **Details:**

  .. _EncryptedKeyShare:
  .. ts:def:: EncryptedKeyShare

    interface EncryptedKeyShare {
      // Nonce used to compute the decryption (iv,key) pair.
      nonce_i: [32]; //bytearray

      // Authentication tag.
      aes_gcm_tag_i: [16]; //bytearray

      // Encrypted key-share in base32 encoding.
      // After decryption, this yields a `KeyShare`.  Note that
      // the `KeyShare` MUST be encoded as a fixed-size binary
      // block (instead of in JSON encoding).
      //
      // HKDF for the key generation must include the
      // string "eks" as salt.
      // Depending on the method,
      // the HKDF may additionally include
      // bits from the response (i.e. some hash over the
      // answer to the security question).
      encrypted_key_share_i: [32]; //bytearray

    }


    interface KeyShare {
      // Key material to derive the key to decrypt the master key.
      key_share: [32]; //bytearray
    }


  .. _ChallengeInstructionMessage:
  .. ts:def:: ChallengeInstructionMessage

    type ChallengeInstructionMessage =
      | IbanChallengeInstructionMessage;

    interface IbanChallengeInstructionMessage {

      // What kind of challenge is this?
      method: "iban";

      // How much should be wired?
      amount: Amount;

      // What is the target IBAN?
      credit_iban: string;

      // What is the receiver name?
      business_name: string;

      // What is the expected wire transfer subject?
      wire_transfer_subject: Integer;

      // Hint about the origin account that must be used.
      debit_account_hint: string;

    }
