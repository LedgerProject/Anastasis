The following steps assume all dependencies are installed.

First, unpack the Anastasis tarball and change into
the resulting directory.
Then, use the following commands to build and install Anastasis:

.. code-block:: console

     $ ./configure [--prefix=PFX] \
                   [--with-gnunet=GNUNETPFX] \
                   [--with-exchange=EXCHANGEPFX]
     $ # Each dependency can be fetched from non standard locations via
     $ # the '--with-<LIBNAME>' option. See './configure --help'.
     $ make
     # make install

If you did not specify a prefix, Anastasis will be installed to
``/usr/local``, which requires you to run the last step as ``root``.

You have to specify ``--with-exchange=/usr/local`` and/or
``--with-gnunet=/usr/local`` if you installed the exchange and/or
GNUnet to ``/usr/local`` in the previous steps.

Depending on the prefixes you specified for the installation and the
distribution you are using, you may have to edit ``/etc/ld.so.conf``, adding
lines for ``GNUNETPFX/lib/`` and ``EXCHANGEPFX/lib/`` and ``PFX/lib/``
(replace the prefixes with the actual paths you used). Afterwards, you should
run ``ldconfig``. Without this step, it is possible that the linker may not
find the installed libraries and launching the Anastasis backend would
then fail.
