Configuration format
--------------------

In Taler realm, any component obeys to the same pattern to get
configuration values. According to this pattern, once the component has
been installed, the installation deploys default values in
${prefix}/share/taler/config.d/, in .conf files. In order to override
these defaults, the user can write a custom .conf file and either pass
it to the component at execution time, or name it taler.conf and place
it under $HOME/.config/.

A config file is a text file containing sections, and each section
contains its values. The right format follows:

.. code-block:: ini

   [section1]
   value1 = string
   value2 = 23

   [section2]
   value21 = string
   value22 = /path22

Throughout any configuration file, it is possible to use ``$``-prefixed
variables, like ``$VAR``, especially when they represent filesystem
paths. It is also possible to provide defaults values for those
variables that are unset, by using the following syntax:
``${VAR:-default}``. However, there are two ways a user can set
``$``-prefixable variables:

by defining them under a ``[paths]`` section, see example below,

.. code-block:: ini

   [paths]
   TALER_DEPLOYMENT_SHARED = ${HOME}/shared-data
   ..
   [section-x]
   path-x = ${TALER_DEPLOYMENT_SHARED}/x

or by setting them in the environment:

.. code-block:: console

   $ export VAR=/x

The configuration loader will give precedence to variables set under
``[path]``, though.

The utility ``taler-config``, which gets installed along with the
exchange, serves to get and set configuration values without directly
editing the .conf. The option ``-f`` is particularly useful to resolve
pathnames, when they use several levels of ``$``-expanded variables. See
``taler-config --help``.

Note that, in this stage of development, the file
``$HOME/.config/taler.conf`` can contain sections for *all* the
component. For example, both an exchange and a bank can read values from
it.

The repository ``git://taler.net/deployment`` contains examples of
configuration file used in our demos. See under ``deployment/config``.

   **Note**

   Expectably, some components will not work just by using default
   values, as their work is often interdependent. For example, a
   merchant needs to know an exchange URL, or a database name.
