#!/bin/bash

# This file is part of TALER
# (C) 2014, 2015, 2016 INRIA
# TALER is free software; you can redistribute it and/or modify it under the
# terms of the GNU Affero General Public License as published by the Free Software
# Foundation; either version 3, or (at your option) any later version.
# TALER is distributed in the hope that it will be useful, but WITHOUT ANY
# WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
# A PARTICULAR PURPOSE.  See the GNU General Public License for more details.
# You should have received a copy of the GNU General Public License along with
# TALER; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>

# @author Marcello Stanisci
# @brief Walkthrough configuration steps

echo -e "\nThis script will set and show all the configuration\n\
values needed to run an example backend. The backend will listen on port 8888\n\
and cooperate with exchange at https://exchange.demo.taler.net/.\n\
Additionally, the script will also generate the backend's private\n\
key and banking details' file.\n\n"

# FIXME:
#       1) banking details generator missing

echo -n "Press ENTER to start > "
read
echo 

echo -n "Setting section [merchant]<ENTER> "
read
echo 

echo -n "taler-config -s merchant -o serve -V TCP<ENTER> "
read
echo 
taler-config -s merchant -o serve -V TCP

echo -n "taler-config -s merchant -o port -V 8888<ENTER> "
read
echo 
taler-config -s merchant -o port -V 8888

echo -n "taler-config -s merchant -o database -V postgres<ENTER> "
read
echo 
taler-config -s merchant -o database -V postgres

echo -n "taler-config -s merchant -o currency -V KUDOS<ENTER> "
read
echo 
taler-config -s merchant -o currency -V KUDOS

echo -n "taler-config -s merchant -o wireformat -V TEST<ENTER> "
read
echo 
taler-config -s merchant -o wireformat -V TEST

echo -n "Setting section [merchant-instance-default]<ENTER> "
read
echo 

echo -ne "taler-config -s merchant-instance-default -o keyfile -V \${TALER_DATA_HOME}/key.priv\n\n\
(The key will be dynamically generated once the backend starts)<ENTER> "
read
echo 
taler-config -s merchant-instance-default -o keyfile -V '${TALER_DATA_HOME}/key.priv'

echo -n "Setting section [merchant-instance-wireformat-default]<ENTER> "
read
echo 

echo -n "taler-config -s merchant-instance-wireformat-default -o test_response_file -V \${TALER_DATA_HOME}/test.json<ENTER> "
read
echo 
taler-config -s merchant-instance-wireformat-default -o test_response_file -V '${TALER_DATA_HOME}/test.json'

sleep 1
echo -ne "Generating test.json..\n\n"
DEST=$(taler-config -s merchant-instance-wireformat-default -o test_response_file -f)
echo '{
  "type": "test",
  "bank_uri": "https://bank.test.taler.net/",
  "sig": "MERCHANTSIGNATURE",
  "account_number": 6,
  "salt": "SALT"
  }' > $DEST

echo -n "Setting section [merchantdb-postgres]<ENTER> "
read
echo 

echo -n "taler-config -s merchantdb-postgres -o config -V postgres:///donations<ENTER> "
read
echo 
taler-config -s merchantdb-postgres -o config -V "postgres:///donations"

echo -n "Setting section [merchant-demoexchange]<ENTER> "
read
echo 

echo -n "taler-config -s merchant-demoexchange -o uri -V https://exchange.demo.taler.net/<ENTER> "
read
echo 
taler-config -s merchant-demoexchange -o uri -V "https://exchange.demo.taler.net/"

echo -n "taler-config -s merchant-demoexchange -o master_key -V CQQZ9DY3MZ1ARMN5K1VKDETS04Y2QCKMMCFHZSWJWWVN82BTTH00<ENTER> "
read
echo 
taler-config -s merchant-demoexchange -o master_key -V "CQQZ9DY3MZ1ARMN5K1VKDETS04Y2QCKMMCFHZSWJWWVN82BTTH00"

echo -ne "Done. Launch the backend with:\n\
\$ taler-merchant-httpd\n\nTest it with:\n\
\$ curl http://127.0.0.1:8888/\n\nIf everything worked \
fine, you should see:\n\n\
'Hello, I'm a merchant's Taler backend. This HTTP server is not for humans.'\n\n"
