To install the GNU Taler Debian packages, first ensure that you have
the right Debian distribution. At this time, the packages are built for
Bullseye.

You need to add a file to import the GNU Taler packages. Typically,
this is done by adding a file ``/etc/apt/sources.list.d/taler.list`` that
looks like this:

.. code-block::

   deb https://deb.taler.net/apt/debian bullseye main

Next, you must import the Taler Systems SA public package signing key
into your keyring and update the package lists:

.. code-block:: console

   # wget -O - https://taler.net/taler-systems.gpg.key | apt-key add -
   # apt update

.. note::

   You may want to verify the correctness of the Taler Systems key out-of-band.

Now your system is ready to install the official GNU Taler binary packages
using apt.
