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


.. _anastasis-auth-methods:

----------------------
Authentication Methods
----------------------

This section describes the supported authentication methods in detail.  We
note that the server implements rate limiting for all authentication methods
to ensure that malicious strong attackers cannot guess the values by
brute-force. Typically, a user is given three attempts per hour to enter the
correct code from 2^63 possible values.  Transmitted codes also come with an
expiration date. If the user re-requests a challenge to be sent, the same
challenge may be transmitted (with the three attempts counter not increasing!)
for a limited period of time (depending on the authentication method) before
the service eventually rotates to a fresh random code with a fresh retry
counter. Given the default value range and time intervals (which providers are
at liberty to adjust), brute-force attacks against this are expected to
succeed with a 50% probability after about 200000 years of attempts at the
maximum permissible frequency.


SMS (sms)
^^^^^^^^^

Sends an SMS with a code (prefixed with ``A-``) to the user's phone, including
a UUID which identifies the challenge the code is for.  The user must send
this code back with his request (see ``$RESPONSE`` under :ref:`Truth`).
If the transmitted code is correct, the server responses with the requested
encrypted key share.



Email verification (email)
^^^^^^^^^^^^^^^^^^^^^^^^^^

Sends an email with a code (prefixed with ``A-``) to the user's mail address,
including a UUID which identifies the challenge the code is for.  The user
must send this code back with his request (see ``$RESPONSE`` under :ref:`Truth`).
If the transmitted code is correct, the server responses with the
requested encrypted key share.


Video identification (vid)
^^^^^^^^^^^^^^^^^^^^^^^^^^

Requires the user to identify via video-call.  In the video-call, the
user is told the code (prefixed with ``A-``) needed to authenticate.

The user is expected to delete all metadata revealing personal information
from the images before uploading them. Since the respective images must be
passed on to the video identification service in the event of password
recovery, it should be ensured that no further information about the user can
be derived from them.

Video identification will typically result in the Anastasis provider
requesting the user to be redirected to a Web site (or other URL) for the
video-call.



Security question (qa)
^^^^^^^^^^^^^^^^^^^^^^

Asks the user a security question.  The user sends back a **salted**
hash over the answer.  The **question-salt** is stored encrypted as
part of the recovery document and never revealed to the providers. This
ensures that providers cannot derive the answer from the hash value.
Furthermore, the security question itself is also only in the recovery
document and never given to the Anastasis provider.  A moderately expensive
hash function is used to further limit strong attackers that have obtained
the recovery document from brute-forcing the answer.

If the hash value matches with the one the server is expecting, the server
answers with the requested encrypted key share.  However, unlike other
encrypted key shares, the encrypted key share of a security question uses a
special variation of the Anastasis encryption: Here, a different hash function
over the security answer is used to provide an additional **key-salt** for the
decryption of the (encrypted) **key share**.  This ensures that the key share
remains irrecoverable without the answer even if the Anastasis provider
storing the security question is malicious.


Snail mail verification (post)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Sends physical mail (snail mail) with a code (prefixed with ``A-``) to the
user's mail address, including a UUID which identifies the challenge the code
is for.  The user must send this code back with their request (see
``$RESPONSE`` under :ref:`Truth`).  If the transmitted code is correct,
the server responds with the requested encrypted key share.
