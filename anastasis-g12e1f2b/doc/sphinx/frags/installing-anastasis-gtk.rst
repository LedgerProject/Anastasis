The following steps assume at least the GNUnet, gnunet-gtk and Anastasis
dependencies are installed.

First, unpack the anastasis-gtk tarball and change into the resulting
directory.  Then, use the following commands to build and install
anastasis-gtk:

.. code-block:: console

     $ ./configure [--prefix=PFX] \
                   [--with-gnunet=GNUNETPFX] \
                   [--with-exchange=EXCHANGEPFX] \
                   [--with-anastasis=ANASTASISPFX]
     $ # Each dependency can be fetched from non standard locations via
     $ # the '--with-<LIBNAME>' option. See './configure --help'.
     $ make
     # make install

If you did not specify a prefix, anastasis-gtk will be installed to
``/usr/local``, which requires you to run the last step as ``root``.

You have to specify ``-with-anastasis=/usr/local``, ``--with-exchange=/usr/local`` and/or
``--with-gnunet=/usr/local`` if you installed the exchange and/or
GNUnet to ``/usr/local`` in the previous steps.

Depending on the prefixes you specified for the installation and the
distribution you are using, you may have to edit ``/etc/ld.so.conf``, adding
lines for ``GNUNETPFX/lib/`` and ``EXCHANGEPFX/lib/`` and ``PFX/lib/``
(replace the prefixes with the actual paths you used). Afterwards, you should
run ``ldconfig``. Without this step, it is possible that the linker may not
find the installed libraries and launching anastasis-gtk would then fail.
