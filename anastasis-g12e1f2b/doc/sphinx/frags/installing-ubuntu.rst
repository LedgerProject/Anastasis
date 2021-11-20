To install the GNU Taler Ubuntu packages, first ensure that you have
the right Ubuntu distribution. At this time, the packages are built for
Ubuntu 20.04 LTS (Focal Fossa).

A typical ``/etc/apt/sources.list.d/taler.list`` file for this setup
would look like this:

.. code-block::

   deb https://deb.taler.net/apt/ubuntu/ focal-fossa main

The last line is crucial, as it adds the GNU Taler packages.

Next, you must import the Taler Systems SA public package signing key
into your keyring and update the package lists:

.. code-block:: console

   # wget -O - https://taler.net/taler-systems.gpg.key | apt-key add -
   # apt update

.. note::

   You may want to verify the correctness of the Taler Systems key out-of-band.

Now your system is ready to install the official GNU Taler binary packages
using apt.
