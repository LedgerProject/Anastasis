anastasis.conf(5)
#################

.. only:: html

   Name
   ====

   **anastasis.conf** - Anastasis configuration file


Description
===========

The configuration file is line-oriented.
Blank lines and whitespace at the beginning and end of a line are ignored.
Comments start with ``#`` or ``%`` in the first column
(after any beginning-of-line whitespace) and go to the end of the line.

The file is split into sections.
Every section begins with “[SECTIONNAME]” and
contains a number of options of the form “OPTION=VALUE”.
There may be whitespace around the ``=`` (equal sign).
Section names and options are *case-insensitive*.

The values, however, are *case-sensitive*.
In particular, boolean values are one of ``YES`` or ``NO``.
Values can include whitespace by surrounding
the entire value with ``"`` (double quote).
Note, however, that there are no escape characters in such strings;
all characters between the double quotes (including other double quotes)
are taken verbatim.

Values that represent filenames can begin with a ``/bin/sh``-like
variable reference.
This can be simple, such as ``$TMPDIR/foo``, or complex,
such as ``${TMPDIR:-${TMP:-/tmp}}/foo``.
See ``[PATHS]`` (below).

Values that represent a time duration are represented as a series of one or
more ``NUMBER UNIT`` pairs, e.g. ``60 s``, ``4 weeks 1 day``, ``5 years 2 minutes``.

Values that represent an amount are in the usual amount syntax:
``CURRENCY:VALUE.FRACTION``, e.g. ``EUR:1.50``.
The ``FRACTION`` portion may extend up to 8 places.

Files containing default values for many of the options described below
are installed under ``$ANASTASIS_PREFIX/share/taler/config.d/``.
The configuration file given with **-c** to Anastasis binaries
overrides these defaults.

A configuration file may include another, by using the ``@INLINE@`` directive,
for example, in ``main.conf``, you could write ``@INLINE@ sub.conf`` to
include the entirety of ``sub.conf`` at that point in ``main.conf``.
.. TODO: Document ‘anastasis-config -V’ in light of ‘@INLINE@’ in taler-config(1).


GLOBAL OPTIONS
--------------

The following options are from the ``[anastasis]`` section and used by
the **anastasis-httpd** service.

ANNUAL_FEE
  Annual fee to be paid for policy uploads, i.e. "EUR:1.5".

TRUTH_UPLOAD_FEE
  Annual fee to be paid for truth uploads, i.e. "EUR:1.5".

INSURANCE
  Amount up to which key shares are warranted, i.e. "EUR:1000000".

DB
  Database backend to use, only ``postgres`` is supported right now.

UPLOAD_LIMIT_MB
  Maximum upload size for policy uploads in megabytes. Default is 1.

ANNUAL_POLICY_UPLOAD_LIMIT
  Maximum number of policies uploaded per year of service. Default is 42.

BUSINESS_NAME
  Name of the business.

SERVER_SALT
  Must be set to a high-entropy random server salt that the provider must never
  change after the initial configuration.

PORT
  TCP port on which the HTTP service should listen on.


Backend options
---------------

The following options are from the ``[anastasis-merchant-backend]`` section and used by
the **anastasis-httpd** service.

PAYMENT_BACKEND_URL
  Base-URL of the Taler merchant backend instance to use for payments.

API_KEY
  API key to transmit to the merchant backend for authentication.



Authorization options
---------------------

For each active authorization plugin, options must be configured in a
section called ``[authorization-$PLUGIN]`` where ``$PLUGIN`` is the
name of the authorization plugin.  Specific plugins may require
additional options, which are described in the respective sections
below.

COST
  Fee the user has to pay to obtain a challenge from this
  authorization plugin during recovery.

ENABLED
  ``yes`` to enable this plugin, ``no`` to disable.


SMS Authorization options
^^^^^^^^^^^^^^^^^^^^^^^^^

COMMAND
  Helper command to run to send SMS.

Email Authorization options
^^^^^^^^^^^^^^^^^^^^^^^^^^^

COMMAND
  Helper command to run to send E-mail.


Post Authorization options
^^^^^^^^^^^^^^^^^^^^^^^^^^

COMMAND
  Helper command to run to send physical mail.


IBAN Authorization options
^^^^^^^^^^^^^^^^^^^^^^^^^^

CREDIT_IBAN
  IBAN number where the consumers must
  wire the money to for authentication.

BUSINESS_NAME
  Name of the account holder.

WIRE_GATEWAY_URL
  Base URL of the LibEuFin wire gateway (Anastasis facade).

WIRE_GATEWAY_AUTH_METHOD
  Authentication method used to talk to the LibEuFin wire gateway, i.e. 'basic' for HTTP basic authentication.

USERNAME
  Username to use when using HTTP basic authentication.

PASSWORD
  Password to use when using HTTP basic authentication.


Postgres database configuration
-------------------------------

The following options must be in the section ``[statis-postgres]`` if
``postgres`` was used for the database under ``DB`` in the
``[anastasis]`` section.

CONFIG
  Path under which the Postgres database is that the service
  should use, i.e. ``postgres://anastasis``.


SEE ALSO
========

anastasis-httpd(1), anastasis-config(1)

BUGS
====

Report bugs by using https://bugs.anastasis.lu/ or by sending electronic
mail to <contact@anastasis.lu>.
