The following steps assume at least the GNUnet and Gtk+ dependencies are installed.

First, unpack the gnunet-gtk tarball and change into the resulting directory.
Then, use the following commands to build and install gnunet-gtk:

.. code-block:: console

     $ ./configure [--prefix=$PFX] \
                   [--with-gnunet=$GNUNETPFX]
     $ # Each dependency can be fetched from non standard locations via
     $ # the '--with-<LIBNAME>' option. See './configure --help'.
     $ make
     # make install

It is highly recommended to use the same prefix ($PFX) for gnunet-gtk that was
used for GNUnet ($GNUNETPFX).  If you did not specify a prefix, gnunet-gtk
will be installed to ``/usr/local``, which requires you to run the last step
as ``root``.

You have to specify ``--with-gnunet=/usr/local`` if you installed
GNUnet to ``/usr/local`` in the previous steps.

Depending on the prefixes you specified for the installation and the
distribution you are using, you may have to edit ``/etc/ld.so.conf``, adding
lines for ``$GNUNETPFX/lib/`` and ``$PFX/lib/`` (replace the prefixes with the
actual paths you used). Afterwards, you should run ``ldconfig``. Without this
step, it is possible that the linker may not find the installed libraries and
launching gnunet-gtk would then fail.
