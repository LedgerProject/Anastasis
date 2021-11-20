..
  This file is part of Anastasis

  Copyright (C) 2014-2021 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU Affero Public License as published by the Free Software
  Foundation; either version 2.1, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with
  Anastasis; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>

  @author Christian Grothoff

.. _http-common:


-------------------------
HTTP Request and Response
-------------------------

Certain response formats are common for all requests. They are documented here
instead of with each individual request.  Furthermore, we note that clients may
theoretically fail to receive any response.  In this case, the client should
verify that the Internet connection is working properly, and then proceed to
handle the error as if an internal error (500) had been returned.

.. http:any:: /*


  **Request:**

  Unless specified otherwise, HTTP requests that carry a message body must
  have the content type ``application/json``.

  :reqheader Content-Type: application/json

  **Response:**

  :resheader Content-Type: application/json

  :http:statuscode:`200 Ok`:
    The request was successful.
  :http:statuscode:`400 Bad request`:
    One of the arguments to the request is missing or malformed.
  :http:statuscode:`500 Internal server error`:
    This always indicates some serious internal operational error of the Anastasis
    provider, such as a program bug, database problems, etc., and must not be used for
    client-side problems.  When facing an internal server error, clients should
    retry their request after some delay.  We recommended initially trying after
    1s, twice more at randomized times within 1 minute, then the user should be
    informed and another three retries should be scheduled within the next 24h.
    If the error persists, a report should ultimately be made to the auditor,
    although the auditor API for this is not yet specified.  However, as internal
    server errors are always reported to the exchange operator, a good operator
    should naturally be able to address them in a timely fashion, especially
    within 24h.

  Unless specified otherwise, all error status codes (4xx and 5xx) have a message
  body with an `ErrorDetail` JSON object.

  **Details:**

  .. ts:def:: ErrorDetail

    interface ErrorDetail {

      // Numeric error code unique to the condition, see ``gnu-taler-error-codes`` in GANA.
      // The other arguments are specific to the error value reported here.
      code: number;

      // Human-readable description of the error, i.e. "missing parameter", "commitment violation", ...
      // Should give a human-readable hint about the error's nature. Optional, may change without notice!
      hint?: string;

    }

-----------------------
Protocol Version Ranges
-----------------------

Anastasis services expose the range of API versions they support.  Clients in
turn have an API version range they support.  These version ranges are written
down in the `libtool version format
<https://www.gnu.org/software/libtool/manual/html_node/Libtool-versioning.html>`__.

A protocol version is a positive, non-zero integer.  A protocol version range consists of three components:

1. The ``current`` version.  This is the latest version of the protocol supported by the client or service.
2. The ``revision`` number.  This value should usually not be interpreted by the client/server, but serves
   purely as a comment.  Each time a service/client for a protocol is updated while supporting the same
   set of protocol versions, the revision should be increased.
   In rare cases, the revision number can be used to work around unintended breakage in deployed
   versions of a service.  This is discouraged and should only be used in exceptional situations.
3. The ``age`` number.  This non-zero integer identifies with how many previous protocol versions this
   implementation is compatible.  An ``age`` of 0 implies that the implementation only supports
   the ``current`` protocol version.  The ``age`` must be less or equal than the ``current`` protocol version.

To avoid confusion with semantic versions, the protocol version range is written down in the following format:

.. code:: none

  current[:revision[:age]]

The angle brackets mark optional components. If either ``revision`` or ``age`` are omitted, they default to 0.

Examples:

* "1" and "1" are compatible
* "1" and "2" are **incompatible**
* "2:0:1" and "1:0:0" are compatible
* "2:5:1" and "1:10:0" are compatible
* "4:0:1" and "2:0:0" are **incompatible**
* "4:0:1" and "3:0:0" are compatible

.. note::

  `Semantic versions <https://semver.org/>`__ are not a good tool for this job, as we concisely want to express
  that the client/server supports the last ``n`` versions of the protocol.
  Semantic versions don't support this, and semantic version ranges are too complex for this.

.. warning::

  A client doesn't have one single protocol version range.  Instead, it has
  a protocol version range for each type of service it talks to.

.. warning::

  For privacy reasons, the protocol version range of a client should not be
  sent to the service.  Instead, the client should just use the two version ranges
  to decide whether it will talk to the service.


.. _encodings-ref:

----------------
Common encodings
----------------

This section describes how certain types of values are represented throughout the API.

.. _base32:

Binary Data
^^^^^^^^^^^

.. ts:def:: foobase

  type Base32 = string;

Binary data is generally encoded using Crockford's variant of Base32
(http://www.crockford.com/wrmg/base32.html), except that "U" is not excluded
but also decodes to "V" to make OCR easy.  We will still simply use the JSON
type "base32" and the term "Crockford Base32" in the text to refer to the
resulting encoding.


Hash codes
^^^^^^^^^^
Hash codes are strings representing base32 encoding of the respective
hashed data. See `base32`_.

.. ts:def:: HashCode

  // 64-byte hash code.
  type HashCode = string;

.. ts:def:: ShortHashCode

  // 32-byte hash code.
  type ShortHashCode = string;



Large numbers
^^^^^^^^^^^^^

Large numbers such as 256 bit keys, are transmitted as other binary data in
Crockford Base32 encoding.


Timestamps
^^^^^^^^^^

Timestamps are represented by the following structure:

.. ts:def:: Timestamp

  interface Timestamp {
    // Milliseconds since epoch, or the special
    // value "never" to represent an event that will
    // never happen.
    t_ms: number | "never";
  }

.. ts:def:: RelativeTime

  interface Duration {
    // Duration in milliseconds or "forever"
    // to represent an infinite duration.
    d_ms: number | "forever";
  }


.. _public\ key:


Integers
^^^^^^^^

.. ts:def:: Integer

  // JavaScript numbers restricted to integers.
  type Integer = number;

Objects
^^^^^^^

.. ts:def:: Object

  // JavaScript objects, no further restrictions.
  type Object = object;

Keys
^^^^

.. ts:def:: EddsaPublicKey

   // EdDSA and ECDHE public keys always point on Curve25519
   // and represented  using the standard 256 bits Ed25519 compact format,
   // converted to Crockford `Base32`.
   type EddsaPublicKey = string;

.. ts:def:: EddsaPrivateKey

   // EdDSA and ECDHE public keys always point on Curve25519
   // and represented  using the standard 256 bits Ed25519 compact format,
   // converted to Crockford `Base32`.
   type EddsaPrivateKey = string;

.. _signature:

Signatures
^^^^^^^^^^


.. ts:def:: EddsaSignature

  // EdDSA signatures are transmitted as 64-bytes `base32`
  // binary-encoded objects with just the R and S values (base32_ binary-only).
  type EddsaSignature = string;

.. _amount:

Amounts
^^^^^^^

.. ts:def:: Amount

  type Amount = string;

Amounts of currency are serialized as a string of the format
``<Currency>:<DecimalAmount>``.  Taler treats monetary amounts as
fixed-precision numbers, with 8 decimal places.  Unlike floating point numbers,
this allows accurate representation of monetary amounts.

The following constrains apply for a valid amount:

1. The ``<Currency>`` part must be at most 11 characters long and may only consist
   of ASCII letters (``a-zA-Z``).
2. The integer part of ``<DecimalAmount>`` may be at most 2^52.
3. The fractional part of ``<DecimalAmount>`` may contain at most 8 decimal digits.

.. note::

  "EUR:1.50" and "EUR:10" are valid amounts.  These are all invalid amounts: "A:B:1.5", "EUR:4503599627370501.0", "EUR:1.", "EUR:.1".

An amount that is prefixed with a ``+`` or ``-`` character is also used in certain contexts.
When no sign is present, the amount is assumed to be positive.


Time
^^^^

In signed messages, time is represented using 64-bit big-endian values,
denoting microseconds since the UNIX Epoch.  ``UINT64_MAX`` represents "never".

.. sourcecode:: c

  struct GNUNET_TIME_Absolute {
    uint64_t timestamp_us;
  };
  struct GNUNET_TIME_AbsoluteNBO {
    uint64_t abs_value_us__;       // in network byte order
  };

Cryptographic primitives
^^^^^^^^^^^^^^^^^^^^^^^^

All elliptic curve operations are on Curve25519.  Public and private keys are
thus 32 bytes, and signatures 64 bytes.  For hashing, including HKDFs, Taler
uses 512-bit hash codes (64 bytes).

.. sourcecode:: c

   struct GNUNET_HashCode {
     uint8_t hash[64];      // usually SHA-512
   };

.. _TALER_EcdhEphemeralPublicKeyP:
.. sourcecode:: c

   struct TALER_EcdhEphemeralPublicKeyP {
     uint8_t ecdh_pub[32];
   };

.. sourcecode:: c

   struct UUID {
     uint32_t value[4];
   };

.. _Signatures:

Signatures
^^^^^^^^^^
Any piece of signed data, complies to the abstract data structure given below.

.. sourcecode:: c

  struct Data {
    struct GNUNET_CRYPTO_EccSignaturePurpose purpose;
    type1_t payload1;
    type2_t payload2;
    ...
  };

  /*From gnunet_crypto_lib.h*/
  struct GNUNET_CRYPTO_EccSignaturePurpose {
    /**

    The following constraints apply for a valid amount:

     * This field is used to express the context in
     * which the signature is made, ensuring that a
     * signature cannot be lifted from one part of the protocol
     * to another. See `src/include/taler_signatures.h` within the
     * exchange's codebase (git://taler.net/exchange).
     */
    uint32_t purpose;
    /**
     * This field equals the number of bytes being signed,
     * namely 'sizeof (struct Data)'.
     */
    uint32_t size;
  };
