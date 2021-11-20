#!/bin/sh
# This file is in the public domain.
find src -name "*.c" | sort  > po/POTFILES.in
find contrib -name "*.glade" | sort >> po/POTFILES.in
