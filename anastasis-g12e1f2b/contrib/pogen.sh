#!/bin/sh
find src -name "*.c" | sort  > po/POTFILES.in
find contrib -name "*.json" | sort >> po/POTFILES.in
