anastasis-httpd(1)
##################

.. only:: html

  Name
  ====

  **anastasis-httpd** - run Anastasis backend (with RESTful API)


Synopsis
========

**anastasis-httpd**

Description
===========

Banastasis-httpd is a command line tool to run the Anastasis (HTTP
backend).  The required configuration and database must exist before
running this command.

Its options are as follows:

**-C** \| **--connection-close**
   Force each HTTP connection to be closed after each request.

**-c** *FILENAME* \| **––config=**\ ‌\ *FILENAME*
   Use the configuration and other resources for the merchant to operate
   from FILENAME.

**-h** \| **––help**
   Print short help on options.

**-v** \| **––version**
   Print version information.


Signals
=======

**anastasis-httpd** responds to the following signals:

``SIGTERM``
    Sending a SIGTERM to the process will cause it to shutdown cleanly.

See also
========

anastasis-dbinit(1), anastasis-config(1), anastasis-gtk(1), anastasis-reducer(1)


Bugs
====

Report bugs by using https://bugs.anastasis.lu or by sending
electronic mail to <contact@anastasis.lu>.
