#!/bin/bash

set -eu

# Exit, with status code "skip" (no 'real' failure)
function exit_skip() {
    echo " SKIP: $1"
    exit 77
}

# Exit, with error message (hard failure)
function exit_fail() {
    echo " ERROR: $1"
    exit 1
}

# Cleanup to run whenever we exit
function cleanup()
{
    for n in `jobs -p`
    do
        kill $n 2> /dev/null || true
    done
    rm -f $TFILE
    wait
}

# Install cleanup handler (except for kill -9)
TFILE=`mktemp test_reducer_stateXXXXXX`
trap cleanup EXIT

# Check we can actually run
echo -n "Testing for jq ..."
jq -h > /dev/null || exit_skip "jq required"
echo " FOUND"

echo -n "Testing for anastasis-reducer ..."
anastasis-reducer -h > /dev/null || exit_skip "anastasis-reducer required"
echo " FOUND"


echo -n "Test failing done authentication (next) ..."
anastasis-reducer next resources/03-backup.json $TFILE 2> /dev/null && exit_fail "Should have failed without challenges"

echo " OK"


echo -n "Test done authentication (next) ..."
anastasis-reducer next resources/04-backup.json $TFILE

STATE=`jq -r -e .backup_state < $TFILE`
if test "$STATE" != "POLICIES_REVIEWING"
then
    exit_fail "Expected new state to be AUTHENTICATIONS_EDITING, got $STATE"
fi

ARRAY_LENGTH=`jq -r -e '.policies | length' < $TFILE`
if test $ARRAY_LENGTH -lt 3
then
    exit_fail "Expected policy array length to be >= 3, got $ARRAY_LENGTH"
fi

echo " OK"

exit 0
