#!/bin/bash

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

# Test continent selection in a backup state
echo -n "Test continent selection in a backup state ..."
anastasis-reducer -a '{"continent": "Testcontinent"}' select_continent resources/00-backup.json $TFILE

STATE=`jq -r -e .backup_state < $TFILE`
if test "$STATE" != "COUNTRY_SELECTING"
then
    exit_fail "Expected new state to be COUNTRY_SELECTING, got $STATE"
fi
SELECTED_CONTINENT=`jq -r -e .selected_continent < $TFILE`
if test "$SELECTED_CONTINENT" != "Testcontinent"
then
    exit_fail "Expected selected continent to be Testcontinent, got $SELECTED_CONTINENT"
fi
COUNTRIES=`jq -r -e .countries < $TFILE`
if test "$COUNTRIES" == NULL
then
    exit_fail "Expected country array (countries) not to be NULL"
fi
echo " OK"


echo -n "Test invalid continent selection ..."
anastasis-reducer -a '{"continent": "Pangaia"}' select_continent resources/00-recovery.json $TFILE 2> /dev/null \
        && exit_fail "Expected selection to fail. Check '$TFILE'"

echo " OK"

echo -n "Test continent selection in a recovery state ..."
anastasis-reducer -a '{"continent": "Testcontinent"}' select_continent resources/00-recovery.json $TFILE

STATE=`jq -r -e .recovery_state < $TFILE`
if test "$STATE" != "COUNTRY_SELECTING"
then
    exit_fail "Expected new state to be COUNTRY_SELECTING, got $STATE"
fi
jq -e .countries[0] < $TFILE > /dev/null || exit_fail "Expected new state to include countries"
jq -e .countries[0].code < $TFILE > /dev/null || exit_fail "Expected new state to include countries with code"
jq -e .countries[0].continent < $TFILE > /dev/null || exit_fail "Expected new state to include countries with continent"
jq -e .countries[0].name < $TFILE > /dev/null || exit_fail "Expected new state to include countries with name"
jq -e .countries[0].currency < $TFILE > /dev/null || exit_fail "Expected new state to include countries with currency"

SELECTED_CONTINENT=`jq -r -e .selected_continent < $TFILE`
if test "$SELECTED_CONTINENT" != "Testcontinent"
then
    exit_fail "Expected selected continent to be 'Testcontinent', got $SELECTED_CONTINENT"
fi

COUNTRIES=`jq -r -e .countries < $TFILE`
if test "$COUNTRIES" == NULL
then
    exit_fail "Expected country array (countries) not to be NULL"
fi
jq -e .countries[0] < $TFILE > /dev/null || exit_fail "Expected new state to include countries"
jq -e .countries[0].code < $TFILE > /dev/null || exit_fail "Expected new state to include countries with code"
jq -e .countries[0].continent < $TFILE > /dev/null || exit_fail "Expected new state to include countries with continent"
jq -e .countries[0].name < $TFILE > /dev/null || exit_fail "Expected new state to include countries with name"
jq -e .countries[0].currency < $TFILE > /dev/null || exit_fail "Expected new state to include countries with currency"

echo " OK"


# Test missing arguments in a recovery state
echo -n "Test bogus country selection in a recovery state ..."
anastasis-reducer -a '{"country": "Germany"}' select_continent resources/00-recovery.json $TFILE 2> /dev/null && exit_fail "Expected state transition to fail, but it worked, check $TFILE"

echo " OK"

# Test continent selection in a recovery state
echo -n "Test bogus continent selection in a recovery state ..."
anastasis-reducer -a '{"continent": "Germany"}' select_continent resources/00-recovery.json $TFILE 2> /dev/null && exit_fail "Expected state transition to fail, but it worked, check $TFILE"

echo " OK"

exit 0
