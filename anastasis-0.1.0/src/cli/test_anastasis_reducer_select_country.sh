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
    rm -f $TFILE
    wait
}



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



# Test continent re-selection
echo -n "Test continent re-selection ..."
anastasis-reducer -a '{"continent": "Europe"}' select_continent resources/01-recovery.json $TFILE

echo -n "."


STATE=`jq -r -e .recovery_state < $TFILE`
if test "$STATE" != "COUNTRY_SELECTING"
then
    exit_fail "Expected new state to be COUNTRY_SELECTING, got $STATE"
fi

echo -n "."

jq -e .countries[0] < $TFILE > /dev/null || exit_fail "Expected new state to include countries"
jq -e .countries[0].code < $TFILE > /dev/null || exit_fail "Expected new state to include countries with code"
jq -e .countries[0].continent < $TFILE > /dev/null || exit_fail "Expected new state to include countries with continent"
jq -e .countries[0].name < $TFILE > /dev/null || exit_fail "Expected new state to include countries with name"
jq -e .countries[0].currency < $TFILE > /dev/null || exit_fail "Expected new state to include countries with currency"

SELECTED_CONTINENT=`jq -r -e .selected_continent < $TFILE`
if test "$SELECTED_CONTINENT" != "Europe"
then
    exit_fail "Expected selected continent to be 'Testcontinent', got $SELECTED_CONTINENT"
fi

echo " OK"


echo -n "Test invalid continent re-selection ..."
anastasis-reducer -a '{"continent": "Pangaia"}' select_continent resources/00-recovery.json $TFILE 2> /dev/null \
        && exit_fail "Expected selection to fail. Check '$TFILE'"

echo " OK"


echo -n "Test NX country selection ..."

anastasis-reducer -a \
  '{"country_code": "zz",
    "currencies": ["EUR" ]}' \
        select_country \
        resources/01-backup.json $TFILE 2> /dev/null \
        && exit_fail "Expected selection to fail. Check '$TFILE'"

echo " OK"

echo -n "Test invalid country selection for continent ..."

anastasis-reducer -a \
  '{"country_code": "de",
    "currencies":["EUR"]}' \
        select_country \
        resources/01-backup.json $TFILE 2> /dev/null \
        && exit_fail "Expected selection to fail. Check '$TFILE'"

echo " OK"

echo -n "Test country selection ..."

anastasis-reducer -a \
  '{"country_code": "xx",
    "currencies":["TESTKUDOS"]}' \
  select_country resources/01-backup.json $TFILE

STATE=`jq -r -e .backup_state < $TFILE`
if test "$STATE" != "USER_ATTRIBUTES_COLLECTING"
then
    exit_fail "Expected new state to be 'USER_ATTRIBUTES_COLLECTING', got '$STATE'"
fi
echo -n "."
SELECTED_COUNTRY=`jq -r -e .selected_country < $TFILE`
if test "$SELECTED_COUNTRY" != "xx"
then
    exit_fail "Expected selected country to be 'xx', got '$SELECTED_COUNTRY'"
fi
echo -n "."
SELECTED_CURRENCY=`jq -r -e .currencies[0] < $TFILE`
if test "$SELECTED_CURRENCY" != "TESTKUDOS"
then
    exit_fail "Expected selected currency to be 'TESTKUDOS', got '$SELECTED_CURRENCY'"
fi
echo -n "."
REQ_ATTRIBUTES=`jq -r -e .required_attributes < $TFILE`
if test "$REQ_ATTRIBUTES" == NULL
then
    exit_fail "Expected required attributes array not to be NULL"
fi
echo -n "."
AUTH_PROVIDERS=`jq -r -e .authentication_providers < $TFILE`
if test "$AUTH_PROVIDERS" == NULL
then
    exit_fail "Expected authentication_providers array not to be NULL"
fi

echo " OK"

exit 0
