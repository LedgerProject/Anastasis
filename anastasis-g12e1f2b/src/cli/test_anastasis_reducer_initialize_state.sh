#!/bin/bash
# This file is in the public domain.

set -eu

# Exit, with status code "skip" (no 'real' failure)
function exit_skip() {
    echo " SKIP: $1"
    exit 77
}

# Exit, with error message (hard failure)
function exit_fail() {
    echo " FAIL: $1"
    exit 1
}

# Cleanup to run whenever we exit
function cleanup()
{
    for n in `jobs -p`
    do
        kill $n 2> /dev/null || true
    done
    rm -f $SFILE $TFILE
    wait
}

# Install cleanup handler (except for kill -9)
SFILE=`mktemp test_reducer_stateXXXXXX`
TFILE=`mktemp test_reducer_stateXXXXXX`

trap cleanup EXIT

# Check we can actually run
echo -n "Testing for jq ..."
jq -h > /dev/null || exit_skip "jq required"
echo " FOUND"
echo -n "Testing for anastasis-reducer ..."
anastasis-reducer -h > /dev/null || exit_skip "anastasis-reducer required"
echo " FOUND"
echo -n "Test initialization of a backup state ..."
anastasis-reducer -b $SFILE

STATE=`jq -r -e .backup_state < $SFILE`
if test "$STATE" != "CONTINENT_SELECTING"
then
    exit_fail "Expected initial state to be CONTINENT_SELECTING, got $STATE"
fi
jq -e .continents[0] < $SFILE > /dev/null || exit_fail "Expected initial state to include continents"

echo " OK"

echo -n "Test initialization of a recovery state ..."
anastasis-reducer -r $TFILE

STATE=`jq -r -e .recovery_state < $TFILE`
if test "$STATE" != "CONTINENT_SELECTING"
then
    exit_fail "Expected initial state to be CONTINENT_SELECTING, got $STATE"
fi
jq -e .continents[0] < $TFILE > /dev/null || exit_fail "Expected initial state to include continents"
echo " OK"

exit 0
