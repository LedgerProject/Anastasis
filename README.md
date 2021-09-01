## GNU Anastasis

Password-less key recovery via multi-factor multi-party authentication.

## Table of contents

* [Documentation](#docs)
* [Built with](#built-with)
* [Software used](#dependencies)
* [Directory structure](#directory-structure)
* [Installation instructions](#installation)
* [Trying it out](#use)


## Documentation

Documentation about the system and for installing the Anastasis binaries
can be found at
https://docs.anastasis.lu/.

## Built with

* [GCC](https://gcc.gnu.org/)

## Software used

* [GNUnet](https://gnunet.org/)
* [GNU Taler](https://taler.net/)
* [GNU libmicrohttpd](https://www.gnu.org/s/libmicrohttpd/)
* and many other GNU packages (gcc, autoconf, gettext, gtk+, make, ...)

## Directory structure

* anastasis: core logic and backend
* anastasis-gtk: Gtk+ graphical user interface

## Installation instructions

### Installation on Debian 11

As root, run:

```sh
echo 'deb https://deb.taler.net/apt/debian/ bullseye main' > /etc/apt/sources.list/taler.list
wget -O - https://taler.net/taler-systems.gpg.key | apt-key add -
apt update
apt install anastasis-gtk
```

### Installation on Ubuntu 20.04

Run:

```sh
sudo echo 'deb https://deb.taler.net/apt/ubuntu/ focal-fossa main' > /etc/apt/sources.list/taler.list
wget -O - https://taler.net/taler-systems.gpg.key | sudo apt-key add -
sudo apt update
sudo apt install anastasis-gtk
```

### Building GNU Anastasis from source

After checking out this repository, run

```sh
git submodule init
git submodule update
```

in the resulting directory and then follow the build instructions in the

* anastasis/
* anastasis-gtk/

subdirectories.


## Trying it out

At this point, you must claim to live in 'Demoland' to
test the client software.  In lieu of a social security
number, you need to pick a prime number (2, 3, 5, 7, ...)
to generate a unique identifier in 'Demoland'.

If you want to run your own service, anastasis-gtk contains
a script ``src/testing/test_prepare.sh`` that can be used
to start four Anastasis backends on localhost. In this case,
you should claim to live in 'Testland' and you will need
a square number (0, 1, 4, 9, 16, ...).
