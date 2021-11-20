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
    rm -f $TFILE $SFILE
    wait
}

SFILE=`mktemp test_reducer_stateXXXXXX`
TFILE=`mktemp test_reducer_stateXXXXXX`

# Install cleanup handler (except for kill -9)
trap cleanup EXIT

# Check we can actually run
echo -n "Testing for jq"
jq -h > /dev/null || exit_skip "jq required"
echo " FOUND"

echo -n "Testing for anastasis-reducer ..."
anastasis-reducer -h > /dev/null || exit_skip "anastasis-reducer required"
echo " FOUND"

echo -n "Test add authentication ..."

# First method
anastasis-reducer -a \
  '{"authentication_method": {
    "type": "question",
    "instructions": "What is your name?",
    "challenge": "91GPWWR"
    } }' \
  add_authentication resources/03-backup.json $TFILE

STATE=`jq -r -e .backup_state < $TFILE`
if test "$STATE" != "AUTHENTICATIONS_EDITING"
then
    exit_fail "Expected new state to be 'AUTHENTICATIONS_EDITING', got '$STATE'"
fi

ARRAY_LENGTH=`jq -r -e '.authentication_methods | length' < $TFILE`
if test $ARRAY_LENGTH != 1
then
    exit_fail "Expected array length to be 1, got '$ARRAY_LENGTH'"
fi

echo -n "."
# Second method
anastasis-reducer -a \
  '{"authentication_method": {
    "type": "question",
    "instructions": "How old are you?",
    "challenge": "64S36"
    }}' \
  add_authentication $TFILE $SFILE

STATE=`jq -r -e .backup_state < $SFILE`
if test "$STATE" != "AUTHENTICATIONS_EDITING"
then
    exit_fail "Expected new state to be 'AUTHENTICATIONS_EDITING', got '$STATE'"
fi

ARRAY_LENGTH=`jq -r -e '.authentication_methods | length' < $SFILE`
if test $ARRAY_LENGTH != 2
then
    exit_fail "Expected array length to be 2, got '$ARRAY_LENGTH'"
fi

echo -n "."

# Third method
anastasis-reducer -a \
  '{"authentication_method": {
    "type": "question",
    "instructions": "Where do you live?",
    "challenge": "9NGQ4WR"
    }}' \
  add_authentication $SFILE $TFILE

STATE=`jq -r -e .backup_state < $TFILE`
if test "$STATE" != "AUTHENTICATIONS_EDITING"
then
    exit_fail "Expected new state to be 'AUTHENTICATIONS_EDITING', got '$STATE'"
fi

ARRAY_LENGTH=`jq -r -e '.authentication_methods | length' < $TFILE`
if test $ARRAY_LENGTH != 3
then
    exit_fail "Expected array length to be 3, got '$ARRAY_LENGTH'"
fi

echo " OK"


echo -n "Test delete authentication ..."

anastasis-reducer -a \
  '{"authentication_method": 2 }' \
  delete_authentication $TFILE $SFILE

STATE=`jq -r -e .backup_state < $SFILE`
if test "$STATE" != "AUTHENTICATIONS_EDITING"
then
    exit_fail "Expected new state to be 'AUTHENTICATIONS_EDITING', got '$STATE'"
fi

ARRAY_LENGTH=`jq -r -e '.authentication_methods | length' < $SFILE`
if test $ARRAY_LENGTH != 2
then
    exit_fail "Expected array length to be 2, got '$ARRAY_LENGTH'"
fi

echo " OK"

exit 0
