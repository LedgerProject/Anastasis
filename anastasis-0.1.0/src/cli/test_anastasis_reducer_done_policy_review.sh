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

echo -n "Test done policy review (next) in a backup state ..."
anastasis-reducer next resources/05-backup.json $TFILE

STATE=`jq -r -e .backup_state < $TFILE`
if test "$STATE" != "SECRET_EDITING"
then
    exit_fail "Expected new state to be 'SECRET_EDITING', got '$STATE'"
fi

ARRAY_LENGTH=`jq -r -e '.authentication_methods | length' < $TFILE`
if test $ARRAY_LENGTH -lt 3
then
    exit_fail "Expected auth methods array length to be >= 3, got $ARRAY_LENGTH"
fi

ARRAY_LENGTH=`jq -r -e '.policies | length' < $TFILE`
if test $ARRAY_LENGTH -lt 3
then
    exit_fail "Expected policies array length to be >= 3, got $ARRAY_LENGTH"
fi

echo " OK"



echo -n "Test adding policy ..."
anastasis-reducer -a \
  '{ "policy" : [
     { "authentication_method" : 1,
       "provider" : "http://localhost:8088/" },
     { "authentication_method" : 1,
       "provider" : "http://localhost:8089/" }
    ] }' \
  add_policy \
  resources/05-backup.json \
  $TFILE 2> /dev/null

ARRAY_LENGTH=`jq -r -e '.policies | length' < $TFILE`
if test $ARRAY_LENGTH -lt 4
then
    exit_fail "Expected policy array length to be >= 4, got $ARRAY_LENGTH"
fi

echo " OK"


echo -n "Test deleting policy ..."
anastasis-reducer -a \
  '{ "policy_index" : 2 }' \
  delete_policy \
  resources/05-backup.json \
  $TFILE 2> /dev/null

ARRAY_LENGTH=`jq -r -e '.policies | length' < $TFILE`
if test $ARRAY_LENGTH -ge 3
then
    exit_fail "Expected policy array length to be < 3, got $ARRAY_LENGTH"
fi

echo " OK"



exit 0
