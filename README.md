# Anastasis
Password-less key recovery via multi-factor multi-party authentication

# Documentation

Documentation about the system and for installing the Anastasis binaries
can be found at
https://docs.anastasis.lu/

# Installation on Debian 11

As root, run:

echo 'deb https://deb.taler.net/apt/debian/ bullseye main' > /etc/apt/sources.list/taler.list
wget -O - https://taler.net/taler-systems.gpg.key | apt-key add -
apt update
apt install anastasis-gtk

# Installation on Ubuntu 20.04

Run:

sudo echo 'deb https://deb.taler.net/apt/ubuntu/ focal-fossa main' > /etc/apt/sources.list/taler.list
wget -O - https://taler.net/taler-systems.gpg.key | sudo apt-key add -
sudo apt update
sudo apt install anastasis-gtk

# Trying it out

At this point, you must claim to live in 'Demoland' to
test the client software.  In lieu of a social security
number, you need to pick a prime number (2, 3, 5, 7, ...)
to generate a unique identifier in 'Demoland'.

# Building Anastasis from the source code

After checking out this repository, run

  $ git submodule init
  $ git submodule update

in the resulting directory and then follow the build instructions in the

* anastasis/
* anastasis-gtk/

subdirectories.
