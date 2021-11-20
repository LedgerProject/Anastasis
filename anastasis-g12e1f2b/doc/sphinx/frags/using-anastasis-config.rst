Using anastasis-config
----------------------

The tool ``anastasis-config`` can be used to extract or manipulate
configuration values; however, the configuration use the well-known INI
file format and can also be edited by hand.

Run

.. code-block:: console

   $ anastasis-config -s $SECTION

to list all of the configuration values in section ``$SECTION``.

Run

.. code-block:: console

   $ anastasis-config -s $section -o $option

to extract the respective configuration value for option ``$option`` in
section ``$section``.

Finally, to change a setting, run

.. code-block:: console

   $ anastasis-config -s $section -o $option -V $value

to set the respective configuration value to ``$value``. Note that you
have to manually restart the Taler backend after you change the
configuration to make the new configuration go into effect.

Some default options will use $-variables, such as ``$DATADIR`` within
their value. To expand the ``$DATADIR`` or other $-variables in the
configuration, pass the ``-f`` option to ``anastasis-config``. For example,
compare:

.. code-block:: console

   $ anastasis-config -s ACCOUNT-bank \
                  -o WIRE_RESPONSE
   $ anastasis-config -f -s ACCOUNT-bank \
                  -o WIRE_RESPONSE

While the configuration file is typically located at
``$HOME/.config/taler.conf``, an alternative location can be specified
to ``taler-merchant-httpd`` and ``anastasis-config`` using the ``-c``
option.
