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

============
Introduction
============

To understand how Anastasis works, you need to understand three key
concepts: user identifiers, our adversary model and the role of the
recovery document.


User Identifiers
----------------

To uniquely identify users, an "unforgettable" **identifier** is used.  This
identifier should be difficult to guess for anybody but the user. However, the
**identifier** is not expected to have sufficient entropy or secrecy to be
cryptographically secure. Examples for such identifier would be a
concatenation of the full name of the user and their social security or
passport number(s).  For Swiss citizens, the AHV number could also be used.


Adversary models
----------------

The adversary model of Anastasis has two types of adversaries: weak
adversaries which do not know the user's **identifier**, and strong
adversaries which somehow do know a user's **identifier**.  For weak
adversaries the system guarantees full confidentiality.  For strong
adversaries, breaking confidentiality additionally requires that Anastasis
escrow providers must have colluded.  The user is able to specify a set of
**policies** which determine which Anastasis escrow providers would need to
collude to break confidentiality. These policies also set the bar for the user
to recover their core secret.


The recovery document
---------------------

A **recovery document** includes all of the information a user needs
to recover access to their core secret.  It specifies a set of
**escrow methods**, which specify how the user should convince the
Anastasis server that they are "real".  Escrow methods can for example
include SMS-based verification, video identification or a security
question.  For each escrow method, the Anastasis server is provided
with **truth**, that is data the Anastasis operator may learn during
the recovery process.  Truth always consists of an encrypted key share
and associated data to authenticate the user.  Examples for truth
would be a phone number (for SMS), a picture of the user (for video
identification), or the (hash of) a security answer.  A strong
adversary is assumed to be able to learn the truth, while weak
adversaries must not.  In addition to a set of escrow methods and
associated Anastasis server operators, the **recovery document** also
specifies **policies**, which describe the combination(s) of the
escrow methods that suffice to obtain access to the core secret.  For
example, a **policy** could say that the escrow methods (A and B)
suffice, and a second policy may permit (A and C).  A different user
may choose to use the policy that (A and B and C) are all required.
Anastasis imposes no limit on the number of policies in a **recovery
document**, or the set of providers or escrow methods involved in
guarding a user's secret.  Weak adversaries must not be able to deduce
information about a user's **recovery document** (except for its
length, which may be exposed to an adversary which monitors the user's
network traffic).
