#!/bin/sh
# Extend all IANA records with a C-style identifier in all-caps.
set -eu

TARGET="$1"
shift
cat "$@" > ${TARGET}

# There is a problem w/ some versions of recutils that signals
# error on rename from /tmp/FOO in recset(1).  Work around that
# by using current working directory as TMPDIR.
TMPDIR=`pwd`
export TMPDIR

for n in `seq 100 599`
do
    VAL=`recsel -e "Value = $n" -P Description iana.tmp || true`
    CAPS=`echo ${VAL} | tr [a-z] [A-Z] | tr " -" "__"`
    recset -f Identifier -a "${CAPS}" -e "Value = $n" ${TARGET}
done


# Apply fixes for records defined differently by MHD:
recset -f Identifier -s "SWITCH_PROXY" -e "Value = 306" ${TARGET}
recset -f Description -s "Switch proxy (not used)" -e "Value = 306" ${TARGET}
