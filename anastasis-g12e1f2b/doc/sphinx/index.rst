..
  This file is part of GNU Anastasis.
  Copyright (C) 2020-2021 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU Affero General Public License as published by the Free Software
  Foundation; either version 2.1, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU Lesser General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with
  Anastasis; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>

  @author Christian Grothoff

Anastasis Documentation
=======================

Anastasis is a Free Software protocol and implementation that allows
users to securely deposit **core secrets** with an open set of escrow
providers and to recover these secrets if their original copies are
lost.

Anastasis is intended for users that want to make backups of key
material, such as OpenPGP encryption keys, hard disk encryption keys
or master keys of electronic wallets. Anastasis is NOT intended to
store large amounts of secret data, it is only designed to safeguard
key material.

Anastasis solves the issue of keeping key material both available
to the authorized user(s), and confidential from anyone else.

With Anastasis, the **core secrets** are protected from the Anastasis
escrow providers by encrypting each with a **master key**.  The
**master key** can be split and distributed across the escrow
providers to ensure that no single escrow provider can recover the
**master key** on its own.  Which subset(s) of Anastasis providers
must be contacted to recover a **master key** is freely configurable.

With Anastasis, users can reliably recover their **core secret**,
while Anastasis makes this difficult for everyone else.  This is even
true if the user is unable to reliably remember any secret with
sufficiently high entropy: Anastasis does not simply reduce the
problem to encrypting the **core secret** using some other key
material in possession of the user.



Documentation Overview
----------------------

.. toctree::
  :numbered:
  :maxdepth: 2

  introduction
  installation
  configuration
  cryptography
  rest
  reducer
  authentication
  db
  global-licensing
  manindex
  genindex

.. toctree::
  :hidden:

  fdl-1.3
