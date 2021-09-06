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
    wait
}

CONF_1="test_anastasis_reducer_1.conf"
CONF_2="test_anastasis_reducer_2.conf"
CONF_3="test_anastasis_reducer_3.conf"
CONF_4="test_anastasis_reducer_4.conf"
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

echo -n "Testing for anastasis-httpd"
anastasis-httpd -h >/dev/null </dev/null || exit_skip " MISSING"
echo " FOUND"


# Name of the Postgres database we will use for the script.
# Will be dropped, do NOT use anything that might be used
# elsewhere
TARGET_DB_1=`anastasis-config -c $CONF_1 -s stasis-postgres -o CONFIG | sed -e "s/^postgres:\/\/\///"`
TARGET_DB_2=`anastasis-config -c $CONF_2 -s stasis-postgres -o CONFIG | sed -e "s/^postgres:\/\/\///"`
TARGET_DB_3=`anastasis-config -c $CONF_3 -s stasis-postgres -o CONFIG | sed -e "s/^postgres:\/\/\///"`
TARGET_DB_4=`anastasis-config -c $CONF_4 -s stasis-postgres -o CONFIG | sed -e "s/^postgres:\/\/\///"`

echo -n "Initialize anastasis database ..."
dropdb $TARGET_DB_1 >/dev/null 2>/dev/null || true
createdb $TARGET_DB_1 || exit_skip "Could not create database $TARGET_DB_1"
anastasis-dbinit -c $CONF_1 2> anastasis-dbinit_1.log
dropdb $TARGET_DB_2 >/dev/null 2>/dev/null || true
createdb $TARGET_DB_2 || exit_skip "Could not create database $TARGET_DB_2"
anastasis-dbinit -c $CONF_2 2> anastasis-dbinit_2.log
dropdb $TARGET_DB_3 >/dev/null 2>/dev/null || true
createdb $TARGET_DB_3 || exit_skip "Could not create database $TARGET_DB_3"
anastasis-dbinit -c $CONF_3 2> anastasis-dbinit_3.log
dropdb $TARGET_DB_4 >/dev/null 2>/dev/null || true
createdb $TARGET_DB_4 || exit_skip "Could not create database $TARGET_DB_4"
anastasis-dbinit -c $CONF_4 2> anastasis-dbinit_4.log

echo " OK"

echo -n "Launching anastasis service ..."
anastasis-httpd -c $CONF_1 2> anastasis-httpd_1.log &
anastasis-httpd -c $CONF_2 2> anastasis-httpd_2.log &
anastasis-httpd -c $CONF_3 2> anastasis-httpd_3.log &
anastasis-httpd -c $CONF_4 2> anastasis-httpd_4.log &

# Wait for anastasis service to be available
for n in `seq 1 50`
do
    echo -n "."
    sleep 0.1
    OK=0
    # anastasis_01
    wget http://localhost:8086/ -o /dev/null -O /dev/null >/dev/null || continue
    # anastasis_02
    wget http://localhost:8087/ -o /dev/null -O /dev/null >/dev/null || continue
    # anastasis_03
    wget http://localhost:8088/ -o /dev/null -O /dev/null >/dev/null || continue
    # anastasis_04
    wget http://localhost:8089/ -o /dev/null -O /dev/null >/dev/null || continue
    OK=1
    break
done

if [ 1 != $OK ]
then
    exit_skip "Failed to launch anastasis services"
fi
echo " OK"

# Test user attributes collection in a backup state
echo -n "Test user attributes collection in a backup state ..."

anastasis-reducer -L WARNING -a \
  '{"identity_attributes": {
    "full_name": "Max Musterman",
    "sq_number": "4",
    "birthdate": "2000-01-01"}}' \
  enter_user_attributes resources/02-backup.json $TFILE

STATE=`jq -r -e .backup_state < $TFILE`
if test "$STATE" != "AUTHENTICATIONS_EDITING"
then
    exit_fail "Expected new state to be 'AUTHENTICATIONS_EDITING', got '$STATE'"
fi

SELECTED_COUNTRY=`jq -r -e .selected_country < $TFILE`
if test "$SELECTED_COUNTRY" != "xx"
then
    exit_fail "Expected selected country to be 'xx', got '$SELECTED_COUNTRY'"
fi

echo "OK"

echo -n "Test user attributes collection in a recovery state ..."
anastasis-reducer -a \
  '{"identity_attributes": {
    "full_name": "Max Musterman",
    "sq_number": "4",
    "birthdate": "2000-01-01"}}' \
  enter_user_attributes resources/02-recovery.json $TFILE 2> /dev/null && exit_fail "Expected recovery to fail due to lacking policy data"

echo "OK"

rm -f $TFILE

exit 0
