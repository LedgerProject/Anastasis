#!/bin/sh
# This file is in the public domain.
# Gets the version number from VCS, or from the contents of the file $1
version=
if test -f "$1"
then
  version=$(cat $1)
fi
if test "x$version" = "x" -a -d "./.git"
then
    version=$(git log -1 | grep 'commit [a-f0-9]\+' | sed -e 's/commit //')
    if test ! "x$version" = "x"
    then
      version="git-$version"
    fi
fi
if test "x$version" = "x"
then
  version="unknown"
fi
echo $version
