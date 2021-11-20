#!/bin/sh
# This file is in the public domain

# Should be called with the list of languages to generate, i.e.
# $ ./update-pp.sh en de fr it

# Error checking on
set -eu
echo "Generating PP for ETag $VERSION"

rm -f sphinx.log sphinx.err
# We process inputs using Makefile in tos/ directory
cd pp
for l in $@
do
    mkdir -p $l
    echo Generating PP for language $l
    # 'f' is for the supported formats, note that the 'make' target
    # MUST match the file extension.
    for f in html txt pdf epub xml
    do
        rm -rf _build
        echo "  Generating format $f"
        make -e SPHINXOPTS="-D language='$l'" $f >>sphinx.log 2>>sphinx.err < /dev/null
        mv _build/$f/pp.$f $l/${VERSION}.$f
    done
done
cd ..
