After installing GNUnet, unpack the GNU Taler exchange tarball,
change into the resulting directory, and proceed as follows:

.. code-block:: console

   $ ./configure [--prefix=EXCHANGEPFX] \
                 [--with-gnunet=GNUNETPFX]
   $ # Each dependency can be fetched from non standard locations via
   $ # the '--with-<LIBNAME>' option. See './configure --help'.
   $ make
   # make install

If you did not specify a prefix, the exchange will install to ``/usr/local``,
which requires you to run the last step as ``root``.  You have to specify
``--with-gnunet=/usr/local`` if you installed GNUnet to ``/usr/local`` in the
previous step.
