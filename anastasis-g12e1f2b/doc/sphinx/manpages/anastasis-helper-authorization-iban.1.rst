anastasis-helper-authorization-iban(1)
######################################

.. only:: html

   Name
   ====

   **anastasis-helper-authorization-iban** - Helper for IBAN authentication

Synopsis
========

**anastasis-helper-authorization-iban**
[**-c** *FILENAME* | **––config=**\ ‌\ *FILENAME*]
[**-h** | **––help**]
[**-L** *LOGLEVEL* | **––loglevel=**\ ‌\ *LOGLEVEL*]
[**-l** *FILENAME* | **––logfile=**\ ‌\ *FILENAME*]
[**-t** | **––test**]
[**-v** | **––version**]


Description
===========

**anastasis-helper-authorization-iban** monitors the Anastasis provider's bank account for incoming wire transfers. This process supports the IBAN authentication method.  It must be configured with the respective wire configuration to talk to LibEuFin/Nexus.


**-c** *FILENAME* \| **––config=**\ ‌\ *FILENAME*
   Use the configuration from *FILENAME*.

**-h** \| **––help**
   Print short help on options.

**-L** *LOGLEVEL* \| **––loglevel=**\ ‌\ *LOGLEVEL*
   Specifies the log level to use. Accepted values are: ``DEBUG``, ``INFO``,
   ``WARNING``, ``ERROR``.

**-l** *FILENAME* \| **––logfile=**\ ‌\ *FILENAME*
   Send logging output to *FILENAME*.

**-t** \| **––test**
   Run in test mode. Causes the process to terminate after importing current wire transfers instead of running forever in the background.

**-v** \| **––version**
   Print version information.

See Also
========

anastasis-httpd(1), anastasis.conf(5).

Bugs
====

Report bugs by using https://bugs.anastasis.lu/ or by sending electronic
mail to <contact@anastasis.lu>.
