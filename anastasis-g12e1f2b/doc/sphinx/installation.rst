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
Installation
------------

.. note::

  Currently, GNU Anastasis is released as alpha-quality software.
  When testing Anastasis, please choose ``demoland`` as
  your country of residence!
  **It is not yet production ready! You cannot rely on it to keep
  your secrets recoverable today!**  In particular, we need to
  still review the various country-specific questions used to create
  unique user identifiers at the beginning of the backup and
  recovery process.  Community feedback on those inputs would be
  particularly welcome!



Please install the following packages before proceeding with the
exchange compilation.

.. include:: frags/list-of-dependencies.rst

-  GNU Taler exchange

-  GNU Taler merchant backend

Except for the last two, these are available in most GNU/Linux distributions
and should just be installed using the respective package manager.


Installing from source
----------------------

The following instructions will show how to install libgnunetutil and
the GNU Taler exchange from source.

Installing GNUnet
^^^^^^^^^^^^^^^^^

.. include:: frags/installing-gnunet.rst

Installing the Taler Exchange
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. include:: frags/installing-taler-exchange.rst

Installing the Taler Merchant
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. include:: frags/installing-taler-merchant.rst

Installing Anastasis
^^^^^^^^^^^^^^^^^^^^

.. include:: frags/installing-anastasis.rst

Installing GNUnet-gtk
^^^^^^^^^^^^^^^^^^^^^

.. include:: frags/installing-gnunet-gtk.rst

Installing Anastasis-gtk
^^^^^^^^^^^^^^^^^^^^^^^^

.. include:: frags/installing-anastasis-gtk.rst



Installing Anastasis binary packages on Debian
----------------------------------------------

.. include:: frags/installing-debian.rst


Installing the graphical front-end
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

To install the Anastasis Gtk+ frontend, you can simply run:

.. code-block:: console

   # apt install anastasis-gtk

To use ``anastasis-gtk``, you can simply run:

.. code-block:: console

   $ anastasis-gtk


Installing the backend
^^^^^^^^^^^^^^^^^^^^^^

If you want to install the Anastasis backend-end (which normal users do not
need), you should run:

.. code-block:: console

   # apt install -t sid anastasis-httpd

Note that the latter package does not perform all of the configuration work.
It does setup the user users and the systemd service scripts, but you still
must configure the database backup, HTTP reverse proxy (typically with TLS
certificates), Taler merchant backend for payments, authentication services,
prices and the terms of service.

Sample configuration files for the HTTP reverse proxy can be found in
``/etc/anastasis.conf``.

Note that the package does not complete the integration of the backend
with the HTTP reverse proxy (typically with TLS certificates).  A
configuration fragment for Nginx or Apache will be placed in
``/etc/{apache,nginx}/conf-available/anastasis.conf``.

To operate an Anastasis backend with payments, you additionally
need to install a Taler merchant backend via:

.. code-block:: console

   # apt install -t sid taler-merchant-httpd



Installing Anastasis binary packages on Ubuntu
----------------------------------------------

.. include:: frags/installing-ubuntu.rst

Installing the graphical front-end
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

To install the Anastasis front-end, you can now simply run:

.. code-block:: console

   # apt install -t focal-fossa anastasis-gtk

To use ``anastasis-gtk``, you can simply run:

.. code-block:: console

   $ anastasis-gtk


Installing the backend
^^^^^^^^^^^^^^^^^^^^^^

If you want to install the Anastasis backend-end (which normal users do not
need), you should run:

.. code-block:: console

   # apt install -t focal-fossa anastasis-httpd

Note that the latter package does not perform all of the configuration work.
It does setup the user users and the systemd service scripts, but you still
must configure the database backup, HTTP reverse proxy (typically with TLS
certificates), Taler merchant backend for payments, authentication services,
prices and the terms of service.

Sample configuration files for the HTTP reverse proxy can be found in
``/etc/anastasis.conf``.

To operate an Anastasis backend with payments, you additionally
need to install a Taler merchant backend via:

.. code-block:: console

   # apt install -t sid taler-merchant-httpd
