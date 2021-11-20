anastasis-reducer(1)
####################

.. only:: html

   Name
   ====

   **anastasis-reducer** - CLI for Anastasis

Synopsis
========

**anastasis-reducer**
[**-a**_*JSON*_|_**--arguments=\ \ *JSON*]
[**-b**_|_**--backup]
[**-c** *FILENAME* | **––config=**\ ‌\ *FILENAME*]
[**-h** | **––help**]
[**-L** *LOGLEVEL* | **––loglevel=**\ ‌\ *LOGLEVEL*]
[**-l** *FILENAME* | **––logfile=**\ ‌\ *FILENAME*]
[**-r**_|_**--restore]
[**-v** | **––version**] COMMAND


Description
===========

**anastasis-reducer** is a command-line tool to run Anastasis
key recover and backup operations using a reducer-style interface.
The reducer will read the current state from standard input and
write the resulting state to standard output.  A COMMAND must
be given on the command line.  The arguments (if any) are to
be given in JSON format to the **-a** option.  A list of
commands can be found in the :doc:`../reducer`
chapter.

**-a** *JSON* \| **––arguments=**\ \ *JSON*
   Provide JSON inputs for the given command.

**-b** \| **--backup**
   Begin fresh reducer operation for a back up operation.

**-c** *FILENAME* \| **––config=**\ ‌\ *FILENAME*
   Use the configuration from *FILENAME*.

**-h** \| **––help**
   Print short help on options.

**-L** *LOGLEVEL* \| **––loglevel=**\ ‌\ *LOGLEVEL*
   Specifies the log level to use. Accepted values are: ``DEBUG``, ``INFO``,
   ``WARNING``, ``ERROR``.

**-l** *FILENAME* \| **––logfile=**\ ‌\ *FILENAME*
   Send logging output to *FILENAME*.

**-r** \| **--restore**
   Begin fresh reducer operation for a restore operation.

**-v** \| **––version**
   Print version information.

See Also
========

anastasis-gtk(1), anastasis-httpd(1), anastasis.conf(5).

Bugs
====

Report bugs by using https://bugs.anastasis.lu/ or by sending electronic
mail to <contact@anastasis.lu>.
