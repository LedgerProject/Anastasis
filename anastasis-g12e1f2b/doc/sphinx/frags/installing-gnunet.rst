Before you install GNUnet, you must download and install the dependencies
mentioned in the previous section, otherwise the build may succeed, but could
fail to export some of the tooling required by GNU Taler.

To install GNUnet, unpack the tarball and change
into the resulting directory, then proceed as follows:

.. code-block:: console

   $ ./configure [--prefix=GNUNETPFX]
   $ # Each dependency can be fetched from non standard locations via
   $ # the '--with-<LIBNAME>' option. See './configure --help'.
   $ make
   # make install
   # ldconfig

If you did not specify a prefix, GNUnet will install to ``/usr/local``,
which requires you to run the last step as ``root``.
The ``ldconfig`` command (also run as ``root``) makes the
shared object libraries (``.so`` files)
visible to the various installed programs.
