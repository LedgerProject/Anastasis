anastasis-config(1)
###################

.. only:: html

   Name
   ====

   **anastasis-config** - manipulate Anastasis configuration files

Synopsis
========

**anastasis-config**
[**-b** *backend* | **––supported-backend=**\ \ *backend*]
[**-c** *filename* | **––config=**\ \ *filename*]
[**-f** | **––filename**]
[**-F** | **––full**]
[**-h** | **––help**]
[**-L** *loglevel* | **––loglevel=**\ \ *loglevel*]
[**-l** *filename* | **––logfile=**\ ‌\ *filename*]
[**-o** *option* | **––option=**\ \ *option*]
[**-r** | **––rewrite**]
[**-S** | **––list-sections**]
[**-s** *section* | **––section=**\ \ *section*]
[**-V** *value* | **––value=**\ \ *value*]
[**-v** | **––version**]


Description
===========

**anastasis-config** can be used to read or modify Anastasis configuration files.

**-b** *BACKEND* \| **––supported-backend=**\ \ *BACKEND*
    Tests whether the specified *BACKEND* is supported by the current installation.
    The backend must match the name of a plugin, i.e. "namestore_postgres" for
    the Postgres database backend of the "NAMESTORE" service.  If *BACKEND* is
    supported, anastasis-config will return a status code of 0 (success), otherwise
    77 (unsupported).  When this option is specified, no other options may be
    specified. Specifying this option together with other options will cause
    anastasis-config to return a status code of 1 (error).

**-c** *FILENAME* \| **––config=**\ \ *FILENAME*
    Use the configuration file *FILENAME*.

**-f** \| **––filename**
    Try to perform expansions as if the option values represent filenames (will
    also be applied even if the option is not really a filename).

**-F** \| **––full**
    Write the full configuration file, not just the differences to the defaults.

**-h** \| **––help**
    Print short help on options.

**-L** *LOGLEVEL* \| **––loglevel=**\ \ *LOGLEVEL*
    Use *LOGLEVEL* for logging.
    Valid values are ``DEBUG``, ``INFO``, ``WARNING``, and ``ERROR``.

**-l** *FILENAME* \| **––logfile=**\ ‌\ *FILENAME*
    Send logging output to *FILENAME*.

**-o** *OPTION* \| **––option=**\ \ *OPTION*
    Which configuration option should be accessed or edited.  Required to set a
    value.  If not given, all values of a given section will be printed in the
    format "OPTION = VALUE".

**-r** \| **––rewrite**
    Write the configuration file even if nothing changed. Will remove all comments!

**-S** \| **––list-sections**
    List available configuration sections for use with ``--section``.

**-s** *SECTION* \| **––section=**\ \ *SECTION*
    Which configuration section should be accessed or edited.
    Required option.

**-V** *VALUE* \| **––value=**\ \ *VALUE*
    Configuration value to store in the given section under the given option.
    Must only be given together with ``-s`` and ``-o`` options.

    Note:
       Changing the configuration file with ``-V`` will remove comments
       and may reorder sections and remove ``@INLINE@`` directives.

**-v** \| **––version**
    Print Anastasis version number.



See Also
========

anastasis.conf(5)

Bugs
====

Report bugs by using https://bugs.anastasis.lu or by sending electronic
mail to <contact@anastasis.lu>.
