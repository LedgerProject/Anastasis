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

------------
Cryptography
------------

When a user needs to interact with Anastasis, the system first derives some key
material, but not the master secret, from the user's **identifier** using
different HKDFs.  These HKDFs are salted using the respective escrow
provider's **server salt**, which ensures that the accounts for the same user
cannot be easily correlated across the various Anastasis servers.

Each Anastasis server uses an EdDSA **account key** to identify the account of
the user.  The account private key is derived from the user's **identifier** using
a computationally expensive cryptographic hash function.  Using an
expensive hash algorithm is assumed to make it infeasible for a weak adversary to
determine account keys by brute force (without knowing the user's identifier).
However, it is assumed that a strong adversary performing a targeted attack can
compute the account key pair.

The public account key is Crockford base32-encoded in the URI to identify the
account, and used to sign requests.  These signatures are also provided in
base32-encoding and transmitted using the HTTP header
``Anastasis-Account-Signature``.

When confidential data is uploaded to an Anastasis server, the respective
payload is encrypted using AES-GCM with a symmetric key and initialization
vector derived from the **identifier** and a high-entropy **nonce**.  The
nonce and the GCM tag are prepended to the ciphertext before being uploaded to
the Anastasis server.  This is done whenever confidential data is stored with
the server.

The **core secret** of the user is (AES) encrypted using a symmetric **master
key**.  Recovering this master key requires the user to satisfy a particular
**policy**.  Policies specify a set of **escrow methods**, each of which leads
the user to a **key share**. Combining those key shares (by hashing) allows
the user to obtain a **policy key**, which can be used to decrypt the **master
key**.  There can be many policies, satisfying any of these will allow the
user to recover the master key.  A **recovery document** contains the
encrypted **core secret**, a set of escrow methods and a set of policies.




Key derivations
^^^^^^^^^^^^^^^

EdDSA and ECDHE public keys are always points on Curve25519 and represented
using the standard 256 bit Ed25519 compact format.  The binary representation
is converted to Crockford Base32 when transmitted inside JSON or as part of
URLs.

To start, a user provides their private, unique and unforgettable
**identifier** as a seed to identify their account.  For example, this could
be a social security number together with their full name.  Specifics may
depend on the cultural context, in this document we will simply refer to this
information as the **identifier**.

This identifier will be first hashed with Argon2, to provide a **kdf_id**
which will be used to derive other keys later. The Hash must also include the
respective **server_salt**. This also ensures that the **kdf_id** is different
on each server. The use of Argon2 and the respective **server_salt** is intended
to make it difficult to brute-force **kdf_id** values and help protect the user's
privacy. Also this ensures that the **kdf_id**\ s on every server differs. However,
we do not assume that the **identifier** or the **kdf_id** cannot be
determined by an adversary performing a targeted attack, as a user's
**identifier** is likely to always be known to state actors and may
likely also be available to other actors.


.. code-block:: none

    kdf_id := Argon2( identifier, server_salt, keysize )

**identifier**: The secret defined from the user beforehand.

**server_salt**: The salt from the Server.

**keysize**: The desired output size of the KDF, here 32 bytes.


Verification
------------

For users to authorize "policy" operations we need an EdDSA key pair.  As we
cannot assure that the corresponding private key is truly secret, such policy
operations must never be destructive: Should an adversary learn the private
key, they could access (and with the **kdf_id**, decrypt) the user's policy (but
not the core secret), or upload a new version of the
**encrypted recovery document** (but not delete an existing version).

For the generation of the private key we use the **kdf_id** as the entropy source,
hash it to derive a base secret which will then be processed to fit the
requirements for EdDSA private keys.  From the private key we can then
generate the corresponding public key.  Here, "ver" is used as a salt for the
HKDF to ensure that the result differs from other cases where we hash
**kdf_id**.

.. code-block:: none

    ver_secret := HKDF(kdf_id, "ver", keysize)
    eddsa_priv := ver_secret
    eddsa_pub := get_EdDSA_Pub(eddsa_priv)


**HKDF()**: The HKDF-function uses two phases: First we use HMAC-SHA512 for the extraction phase, then HMAC-SHA256 is used for expansion phase.

**kdf_id**: Hashed identifier.

**key_size**: Size of the output, here 32 bytes.

**ver_secret**: Derived key from the ``kdf_id``, serves as intermediate step for the generation of the private key.

**eddsa_priv**: The generated EdDSA private key.

**eddsa_pub**: The generated EdDSA public key.


Encryption
----------

For symmetric encryption of data we use AES256-GCM. For this we need a
symmetric key and an initialization vector (IV).  To ensure that the
symmetric key changes for each encryption operation, we compute the
key material using an HKDF over a ``nonce`` and the ``kdf_id``.

.. code-block:: none

    (iv,key) := HKDF(kdf_id, nonce, keysize + ivsize)

**HKDF()**: The HKDF-function uses two phases: First we use HMAC-SHA512 for the extraction phase, then HMAC-SHA256 is used for expansion phase.

**kdf_id**: Hashed identifier.

**keysize**: Size of the AES symmetric key, here 32 bytes.

**ivsize**: Size of the AES GCM IV, here 12 bytes.

**prekey**: Original key material.

**nonce**: 32-byte nonce, must never match "ver" (which it cannot as the length is different). Of course, we must
avoid key reuse. So, we have to use different nonces to get different keys and IVs (see below).

**key**: Symmetric key which is later used to encrypt the documents with AES256-GCM.

**iv**: IV which will be used for AES-GCM.



Key Usage
^^^^^^^^^

The keys we have generated are then used to encrypt the **recovery document** and
the **key_share** of the user.


Encryption
----------

Before every encryption a 32-byte nonce is generated.
From this the symmetric key is computed as described above.
We use AES256-GCM for the encryption of the **recovery document** and
the **key_share**.  To ensure that the key derivation for the encryption
of the **recovery document** differs fundamentally from that of an
individual **key share**, we use different salts ("erd" and "eks", respectively).

.. code-block:: none

    (iv0, key0) := HKDF(key_id, nonce0, "erd", keysize + ivsize)
    (encrypted_recovery_document, aes_gcm_tag) := AES256_GCM(recovery_document, key0, iv0)
    (iv_i, key_i) := HKDF(key_id, nonce_i, "eks", [optional data], keysize + ivsize)
    (encrypted_key_share_i, aes_gcm_tag_i) := AES256_GCM(key_share_i, key_i, iv_i)

**encrypted_recovery_document**: The encrypted **recovery document** which contains the escrow methods, policies
and the encrypted **core secret**.

**nonce0**: Nonce which is used to generate *key0* and *iv0* which are used for the encryption of the *recovery document*.
This key derivation must be done using the salt "erd".

**optional data**: Key material that optionally is contributed from the authentication method to further obfuscate the key share from the escrow provider.

**encrypted_key_share_i**: The encrypted **key_share** which the escrow provider must release upon successful authentication.
Here, **i** must be a positive number used to iterate over the various **key shares** used for the various **escrow methods**
at the various providers.

**nonce_i**: Nonce which is used to generate *key_i* and *iv_i* which are used for the encryption of the **key share**. **i** must be
the same number as specified above for *encrypted_key_share_i*.
Key derivation must be done using the salt "eks".

As a special rule, when a **security question** is used to authorize access to an
**encrypted_key_share_i**, then the salt "eks" is replaced with an (expensive) hash
of the answer to the security question as an additional way to make the key share
inaccessible to those who do not have the answer:

.. code-block:: none

   powh := POW_HASH (qsalt, answer)
   ekss := HKDF("Anastasis-secure-question-uuid-salting",
                powh,
                uuid);
   (iv_i, key_i) := HKDF(key_id, nonce_i, ekss, [optional data], keysize + ivsize)


**qsalt**: Salt value used to hash answer to satisfy the challenge to prevent the provider from determining the answer via guessing.

**answer**: Answer to the security question, in UTF-8, as entered by the user.

**powh**: Result of the (expensive, proof-of-work) hash algorithm.

**uuid**: UUID of the challenge associated with the security question and the encrypted key share.

**ekss**: Replacement salt to be used instead of "eks" when deriving the key to encrypt/decrypt the key share.


Signatures
----------

The EdDSA keys are used to sign the data sent from the client to the
server. This signature ensures that an adversary that observes the upload is not
able to upload a new version of the policy without knowing the user's identity attributes.
The signature is made over a hash of the request body. The following
algorithm is equivalent for **Anastasis-Policy-Signature**.

.. code-block:: none

    (anastasis-account-signature) := eddsa_sign(h_body, eddsa_priv)
    ver_res := eddsa_verifiy(h_body, anastasis-account-signature, eddsa_pub)

**anastasis-account-signature**: Signature over the SHA-512 hash of the body using the purpose code ``TALER_SIGNATURE_ANASTASIS_POLICY_UPLOAD`` (1400) (see GNUnet EdDSA signature API for the use of purpose).

**h_body**: The hashed body.

**ver_res**: A boolean value. True: Signature verification passed, False: Signature verification failed.


Availability Considerations
^^^^^^^^^^^^^^^^^^^^^^^^^^^

Anastasis considers two main threats against availability. First, the
Anastasis server operators must be protected against denial-of-service attacks
where an adversary attempts to exhaust the operator's resources.  The API protects
against these attacks by allowing operators to set fees for all
operations. Furthermore, all data stored comes with an expiration logic, so an
attacker cannot force servers to store data indefinitely.

A second availability issue arises from strong adversaries that may be able to
compute the account keys of some user.  While we assume that such an adversary
cannot successfully authenticate against the truth, the account key does
inherently enable these adversaries to upload a new policy for the account.
This cannot be prevented, as the legitimate user must be able to set or change
a policy using only the account key.  To ensure that an adversary cannot
exploit this, policy uploads first of all never delete existing policies, but
merely create another version.  This way, even if an adversary uploads a
malicious policy, a user can still retrieve an older version of the policy to
recover access to their data.  This append-only storage for policies still
leaves a strong adversary with the option of uploading many policies to
exhaust the Anastasis server's capacity.  We limit this attack by requiring a
policy upload to include a reference to a **payment identifier** from a payment
made by the user.  Thus, a policy upload requires both knowledge of the
**identity** and making a payment.  This effectively prevents an adversary
from using the append-only policy storage from exhausting Anastasis server
capacity.
