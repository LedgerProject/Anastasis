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
    rm -rf $CONF $WALLET_DB $R1FILE $R2FILE $B1FILE $B2FILE $TMP_DIR
    wait
}


CONF_1="test_anastasis_reducer_1.conf"
CONF_2="test_anastasis_reducer_2.conf"
CONF_3="test_anastasis_reducer_3.conf"
CONF_4="test_anastasis_reducer_4.conf"


# Configuration file will be edited, so we create one
# from the template.
CONF=`mktemp test_reducerXXXXXX.conf`
cp test_reducer.conf $CONF

TMP_DIR=`mktemp -d keys-tmp-XXXXXX`
WALLET_DB=`mktemp test_reducer_walletXXXXXX.json`
B1FILE=`mktemp test_reducer_stateB1XXXXXX`
B2FILE=`mktemp test_reducer_stateB2XXXXXX`
R1FILE=`mktemp test_reducer_stateR1XXXXXX`
R2FILE=`mktemp test_reducer_stateR2XXXXXX`

# Install cleanup handler (except for kill -9)
trap cleanup EXIT

# Check we can actually run
echo -n "Testing for jq"
jq -h > /dev/null || exit_skip "jq required"
echo " FOUND"
echo -n "Testing for anastasis-reducer ..."
anastasis-reducer -h > /dev/null || exit_skip "anastasis-reducer required"
echo " FOUND"

echo -n "Testing for taler"
taler-exchange-httpd -h > /dev/null || exit_skip " taler-exchange required"
taler-merchant-httpd -h > /dev/null || exit_skip " taler-merchant required"
echo " FOUND"

echo -n "Testing for taler-bank-manage"
taler-bank-manage --help >/dev/null </dev/null || exit_skip " MISSING"
echo " FOUND"
echo -n "Testing for taler-wallet-cli"
taler-wallet-cli -v >/dev/null </dev/null || exit_skip " MISSING"
echo " FOUND"

echo -n "Testing for anastasis-httpd"
anastasis-httpd -h >/dev/null </dev/null || exit_skip " MISSING"
echo " FOUND"

echo -n "Initialize anastasis database ..."
# Name of the Postgres database we will use for the script.
# Will be dropped, do NOT use anything that might be used
# elsewhere
TARGET_DB_1=`anastasis-config -c $CONF_1 -s stasis-postgres -o CONFIG | sed -e "s/^postgres:\/\/\///"`
TARGET_DB_2=`anastasis-config -c $CONF_2 -s stasis-postgres -o CONFIG | sed -e "s/^postgres:\/\/\///"`
TARGET_DB_3=`anastasis-config -c $CONF_3 -s stasis-postgres -o CONFIG | sed -e "s/^postgres:\/\/\///"`
TARGET_DB_4=`anastasis-config -c $CONF_4 -s stasis-postgres -o CONFIG | sed -e "s/^postgres:\/\/\///"`

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

echo -n "Generating Taler auditor, exchange and merchant configurations ..."

DATA_DIR=`taler-config -f -c $CONF -s PATHS -o TALER_HOME`
rm -rf $DATA_DIR

# obtain key configuration data
MASTER_PRIV_FILE=`taler-config -f -c $CONF -s "EXCHANGE-OFFLINE" -o "MASTER_PRIV_FILE"`
MASTER_PRIV_DIR=`dirname $MASTER_PRIV_FILE`
mkdir -p $MASTER_PRIV_DIR
gnunet-ecc -g1 $MASTER_PRIV_FILE > /dev/null 2> /dev/null
MASTER_PUB=`gnunet-ecc -p $MASTER_PRIV_FILE`
EXCHANGE_URL=`taler-config -c $CONF -s EXCHANGE -o BASE_URL`
MERCHANT_PORT=`taler-config -c $CONF -s MERCHANT -o PORT`
MERCHANT_URL=http://localhost:${MERCHANT_PORT}/
BANK_PORT=`taler-config -c $CONF -s BANK -o HTTP_PORT`
BANK_URL=http://localhost:${BANK_PORT}/
AUDITOR_URL=http://localhost:8083/
AUDITOR_PRIV_FILE=`taler-config -f -c $CONF -s AUDITOR -o AUDITOR_PRIV_FILE`
AUDITOR_PRIV_DIR=`dirname $AUDITOR_PRIV_FILE`
mkdir -p $AUDITOR_PRIV_DIR
gnunet-ecc -g1 $AUDITOR_PRIV_FILE > /dev/null 2> /dev/null
AUDITOR_PUB=`gnunet-ecc -p $AUDITOR_PRIV_FILE`

# patch configuration
TALER_DB=talercheck
taler-config -c $CONF -s exchange -o MASTER_PUBLIC_KEY -V $MASTER_PUB
taler-config -c $CONF -s merchant-exchange-default -o MASTER_KEY -V $MASTER_PUB
taler-config -c $CONF -s exchangedb-postgres -o CONFIG -V postgres:///$TALER_DB
taler-config -c $CONF -s auditordb-postgres -o CONFIG -V postgres:///$TALER_DB
taler-config -c $CONF -s merchantdb-postgres -o CONFIG -V postgres:///$TALER_DB
taler-config -c $CONF -s bank -o database -V postgres:///$TALER_DB
taler-config -c $CONF -s exchange -o KEYDIR -V "${TMP_DIR}/keydir/"
taler-config -c $CONF -s exchange -o REVOCATION_DIR -V "${TMP_DIR}/revdir/"

echo " OK"

echo -n "Setting up exchange ..."

# reset database
dropdb $TALER_DB >/dev/null 2>/dev/null || true
createdb $TALER_DB || exit_skip "Could not create database $TALER_DB"
taler-exchange-dbinit -c $CONF
taler-merchant-dbinit -c $CONF
taler-auditor-dbinit -c $CONF
taler-auditor-exchange -c $CONF -m $MASTER_PUB -u $EXCHANGE_URL

echo " OK"

# Launch services
echo -n "Launching taler services ..."
taler-bank-manage-testing $CONF postgres:///$TALER_DB serve > taler-bank.log 2> taler-bank.err &
taler-exchange-secmod-eddsa -c $CONF 2> taler-exchange-secmod-eddsa.log &
taler-exchange-secmod-rsa -c $CONF 2> taler-exchange-secmod-rsa.log &
taler-exchange-httpd -c $CONF 2> taler-exchange-httpd.log &
taler-merchant-httpd -c $CONF -L INFO 2> taler-merchant-httpd.log &
taler-exchange-wirewatch -c $CONF 2> taler-exchange-wirewatch.log &
taler-auditor-httpd -L INFO -c $CONF 2> taler-auditor-httpd.log &

echo " OK"

echo -n "Launching anastasis services ..."
PREFIX="" #valgrind
$PREFIX anastasis-httpd -c $CONF_1 2> anastasis-httpd_1.log &
$PREFIX anastasis-httpd -c $CONF_2 2> anastasis-httpd_2.log &
$PREFIX anastasis-httpd -c $CONF_3 2> anastasis-httpd_3.log &
$PREFIX anastasis-httpd -c $CONF_4 2> anastasis-httpd_4.log &

# Wait for bank to be available (usually the slowest)
for n in `seq 1 50`
do
    echo -n "."
    sleep 0.2
    OK=0
    # bank
    wget --tries=1 --timeout=1 http://localhost:8082/ -o /dev/null -O /dev/null >/dev/null || continue
    OK=1
    break
done

if [ 1 != $OK ]
then
    exit_skip "Failed to launch services (bank)"
fi

# Wait for all other taler services to be available
for n in `seq 1 50`
do
    echo -n "."
    sleep 0.1
    OK=0
    # exchange
    wget --tries=1 --timeout=1 http://localhost:8081/seed -o /dev/null -O /dev/null >/dev/null || continue
    # merchant
    wget --tries=1 --timeout=1 http://localhost:9966/ -o /dev/null -O /dev/null >/dev/null || continue
    # auditor
    wget --tries=1 --timeout=1 http://localhost:8083/ -o /dev/null -O /dev/null >/dev/null || continue
    OK=1
    break
done

if [ 1 != $OK ]
then
    exit_skip "Failed to launch taler services"
fi

echo "OK"

echo -n "Setting up keys ..."
taler-exchange-offline -c $CONF \
  download \
  sign \
  enable-account payto://x-taler-bank/localhost/Exchange \
  enable-auditor $AUDITOR_PUB $AUDITOR_URL "TESTKUDOS Auditor" \
  wire-fee now x-taler-bank TESTKUDOS:0.01 TESTKUDOS:0.01 \
  upload &> taler-exchange-offline.log

echo -n "."

for n in `seq 1 3`
do
    echo -n "."
    OK=0
    wget --tries=1 --timeout=1 http://localhost:8081/keys -o /dev/null -O /dev/null >/dev/null || continue
    OK=1
    break
done

if [ 1 != $OK ]
then
    exit_skip "Failed to setup keys"
fi

echo " OK"

echo -n "Setting up auditor signatures ..."
taler-auditor-offline -c $CONF \
  download sign upload &> taler-auditor-offline.log
echo " OK"

echo -n "Waiting for anastasis services ..."

# Wait for anastasis services to be available
for n in `seq 1 50`
do
    echo -n "."
    sleep 0.1
    OK=0
   # anastasis_01
    wget --tries=1 --timeout=1 http://localhost:8086/ -o /dev/null -O /dev/null >/dev/null || continue
    # anastasis_02
    wget --tries=1 --timeout=1 http://localhost:8087/ -o /dev/null -O /dev/null >/dev/null || continue
    # anastasis_03
    wget --tries=1 --timeout=1 http://localhost:8088/ -o /dev/null -O /dev/null >/dev/null || continue
    # anastasis_04
    wget --tries=1 --timeout=1 http://localhost:8089/ -o /dev/null -O /dev/null >/dev/null || continue
    OK=1
    break
done

if [ 1 != $OK ]
then
    exit_skip "Failed to launch anastasis services"
fi
echo "OK"

echo -n "Configuring merchant instance ..."
# Setup merchant

curl -H "Content-Type: application/json" -X POST -d '{"auth":{"method":"external"},"payto_uris":["payto://x-taler-bank/localhost/43"],"id":"default","name":"default","address":{},"jurisdiction":{},"default_max_wire_fee":"TESTKUDOS:1", "default_max_deposit_fee":"TESTKUDOS:1","default_wire_fee_amortization":1,"default_wire_transfer_delay":{"d_ms" : 3600000},"default_pay_delay":{"d_ms": 3600000}}' http://localhost:9966/management/instances


echo " DONE"

echo -n "Running backup logic ...,"
anastasis-reducer -b > $B1FILE
echo -n "."
anastasis-reducer -a \
  '{"continent": "Testcontinent"}' \
  select_continent < $B1FILE > $B2FILE
echo -n "."
anastasis-reducer -a \
  '{"country_code": "xx",
    "currencies":["TESTKUDOS"]}' \
  select_country < $B2FILE > $B1FILE
echo -n "."
anastasis-reducer -a \
  '{"identity_attributes": {
    "full_name": "Max Musterman",
    "sq_number": "4",
    "birthdate": "2000-01-01"}}' \
  enter_user_attributes < $B1FILE > $B2FILE
echo -n ","
# "91GPWWR" encodes "Hans"
anastasis-reducer -a \
  '{"authentication_method": {
    "type": "question",
    "instructions": "What is your name?",
    "challenge": "91GPWWR"
    } }' \
  add_authentication < $B2FILE > $B1FILE
echo -n "."
# "64S36" encodes "123"
anastasis-reducer -a \
  '{"authentication_method": {
    "type": "question",
    "instructions": "How old are you?",
    "challenge": "64S36"
    } }' \
  add_authentication < $B1FILE > $B2FILE
echo -n "."
# "9NGQ4WR" encodes "Mars"
anastasis-reducer -a \
  '{"authentication_method": {
    "type": "question",
    "instructions": "Where do you live?",
    "challenge": "9NGQ4WR"
    } }' \
  add_authentication < $B2FILE > $B1FILE
echo -n "."
# Finished adding authentication methods
anastasis-reducer \
    next < $B1FILE > $B2FILE


echo -n ","
# Finished policy review
anastasis-reducer \
  next < $B2FILE > $B1FILE
echo -n "."

# Note: 'secret' must here be a Crockford base32-encoded value
anastasis-reducer -a \
  '{"secret": { "value" : "VERYHARDT0GVESSSECRET", "mime" : "text/plain" }}' \
  enter_secret < $B1FILE > $B2FILE
mv $B2FILE $B1FILE
anastasis-reducer next $B1FILE $B2FILE
echo " OK"


echo -n "Preparing wallet"
rm $WALLET_DB
taler-wallet-cli --no-throttle --wallet-db=$WALLET_DB api 'withdrawTestBalance' \
  "$(jq -n '
    {
        amount: "TESTKUDOS:100",
        bankBaseUrl: $BANK_URL,
        exchangeBaseUrl: $EXCHANGE_URL
    }' \
    --arg BANK_URL "$BANK_URL" \
    --arg EXCHANGE_URL "$EXCHANGE_URL"
  )" 2> /dev/null >/dev/null
taler-wallet-cli --wallet-db=$WALLET_DB run-until-done 2>/dev/null >/dev/null
echo " OK"

echo -en "Making payments for truth uploads ... "
OBJECT_SIZE=`jq -r -e '.payments | length' < $B2FILE`
for ((INDEX=0; INDEX < $OBJECT_SIZE; INDEX++))
do
    PAY_URI=`jq --argjson INDEX $INDEX -r -e '.payments[$INDEX]' < $B2FILE`
    # run wallet CLI
    echo -n "$INDEX"
    taler-wallet-cli --wallet-db=$WALLET_DB handle-uri $PAY_URI -y 2>/dev/null >/dev/null
    echo -n ", "
done
echo "OK"
echo -e "Running wallet run-pending..."
taler-wallet-cli --wallet-db=$WALLET_DB run-pending 2>/dev/null >/dev/null
echo -e "Payments done"

export B2FILE
export B1FILE

echo -en "Try to upload again ..."
$PREFIX anastasis-reducer pay $B2FILE $B1FILE
mv $B1FILE $B2FILE
echo " OK"

echo -en "Making payments for policy uploads ... "
OBJECT_SIZE=`jq -r -e '.policy_payment_requests | length' < $B2FILE`
for ((INDEX=0; INDEX < $OBJECT_SIZE; INDEX++))
do
    PAY_URI=`jq --argjson INDEX $INDEX -r -e '.policy_payment_requests[$INDEX].payto' < $B2FILE`
    # run wallet CLI
    echo -n "$INDEX"
    taler-wallet-cli --wallet-db=$WALLET_DB handle-uri $PAY_URI -y 2>/dev/null >/dev/null
    echo -n ", "
done
echo " OK"
echo -en "Running wallet run-pending..."
taler-wallet-cli --wallet-db=$WALLET_DB run-pending 2>/dev/null >/dev/null
echo -e " payments DONE"

echo -en "Try to upload again ..."
anastasis-reducer \
  pay < $B2FILE > $B1FILE
echo " OK: Backup finished"
echo -n "Final backup checks ..."
STATE=`jq -r -e .backup_state < $B1FILE`
if test "$STATE" != "BACKUP_FINISHED"
then
    exit_fail "Expected new state to be 'BACKUP_FINISHED', got '$STATE'"
fi

jq -r -e .core_secret < $B1FILE > /dev/null && exit_fail "'core_secret' was not cleared upon success"

echo " OK"

echo -n "Running recovery basic logic ..."
anastasis-reducer -r > $R1FILE
anastasis-reducer -a \
  '{"continent": "Testcontinent"}' \
  select_continent < $R1FILE > $R2FILE
anastasis-reducer -a \
  '{"country_code": "xx",
    "currencies":["TESTKUDOS"]}' \
  select_country < $R2FILE > $R1FILE
anastasis-reducer -a '{"identity_attributes": { "full_name": "Max Musterman", "sq_number": "4", "birthdate": "2000-01-01" }}' enter_user_attributes < $R1FILE > $R2FILE


STATE=`jq -r -e .recovery_state < $R2FILE`
if test "$STATE" != "SECRET_SELECTING"
then
    exit_fail "Expected new state to be 'SECRET_SELECTING', got '$STATE'"
fi
echo " OK"

echo -n "Selecting default secret"
mv $R2FILE $R1FILE
anastasis-reducer next < $R1FILE > $R2FILE

STATE=`jq -r -e .recovery_state < $R2FILE`
if test "$STATE" != "CHALLENGE_SELECTING"
then
    exit_fail "Expected new state to be 'CHALLENGE_SELECTING', got '$STATE'"
fi
echo " OK"

echo -n "Running challenge logic ..."

UUID0=`jq -r -e .recovery_information.challenges[0].uuid < $R2FILE`
UUID1=`jq -r -e .recovery_information.challenges[1].uuid < $R2FILE`
UUID2=`jq -r -e .recovery_information.challenges[2].uuid < $R2FILE`
UUID0Q=`jq -r -e .recovery_information.challenges[0].instructions < $R2FILE`
UUID1Q=`jq -r -e .recovery_information.challenges[1].instructions < $R2FILE`
UUID2Q=`jq -r -e .recovery_information.challenges[2].instructions < $R2FILE`

if test "$UUID2Q" = 'How old are you?'
then
    AGE_UUID=$UUID2
elif test "$UUID1Q" = 'How old are you?'
then
    AGE_UUID=$UUID1
else
    AGE_UUID=$UUID0
fi

if test "$UUID2Q" = 'What is your name?'
then
    NAME_UUID=$UUID2
elif test "$UUID1Q" = 'What is your name?'
then
    NAME_UUID=$UUID1
else
    NAME_UUID=$UUID0
fi

anastasis-reducer -a \
  "$(jq -n '
    {
        uuid: $UUID
    }' \
    --arg UUID "$NAME_UUID"
  )" \
  select_challenge < $R2FILE > $R1FILE

anastasis-reducer -a '{"answer": "Hans"}' \
  solve_challenge < $R1FILE > $R2FILE

anastasis-reducer -a \
  "$(jq -n '
    {
        uuid: $UUID
    }' \
    --arg UUID "$AGE_UUID"
  )" \
  select_challenge < $R2FILE > $R1FILE

anastasis-reducer -a '{"answer": "123"}' \
  solve_challenge < $R1FILE > $R2FILE

echo " OK"

echo -n "Checking recovered secret ..."
# finally: check here that we recovered the secret...

STATE=`jq -r -e .recovery_state < $R2FILE`
if test "$STATE" != "RECOVERY_FINISHED"
then
    jq -e . $R2FILE
    exit_fail "Expected new state to be 'RECOVERY_FINISHED', got '$STATE'"
fi

SECRET=`jq -r -e .core_secret.value < $R2FILE`
if test "$SECRET" != "VERYHARDT0GVESSSECRET"
then
    jq -e . $R2FILE
    exit_fail "Expected recovered secret to be 'VERYHARDT0GVESSSECRET', got '$SECRET'"
fi

MIME=`jq -r -e .core_secret.mime < $R2FILE`
if test "$MIME" != "text/plain"
then
    jq -e . $R2FILE
    exit_fail "Expected recovered mime to be 'text/plain', got '$MIME'"
fi

echo " OK"

exit 0
