#!/bin/bash
# Shell script to launch Taler components
# and Anastasis providers for local test
# using TESTKUDOS.

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
    rm -rf $CONF $CONF_4 $WALLET_DB $R1FILE $R2FILE $B1FILE $B2FILE $TMP_DIR
    wait
}


# $1=ebics username, $2=ebics partner name, $3=person name, $4=sandbox bank account name, $5=iban
function prepare_sandbox_account() {
  echo -n "Activating ebics subscriber $1 at the sandbox ..."
  libeufin-cli \
    sandbox --sandbox-url=$SANDBOX_URL \
      ebicssubscriber create \
        --host-id=$EBICS_HOST \
        --partner-id=$2 \
        --user-id=$1
  echo " OK"
  echo -n "Giving a bank account ($4) to $1 ..."
  libeufin-cli \
    sandbox --sandbox-url=$SANDBOX_URL \
      ebicsbankaccount create \
        --iban=$5 \
        --bic="BCMAESM1XXX"\
        --person-name="$3" \
        --account-name=$4 \
        --ebics-user-id=$1 \
        --ebics-host-id=$EBICS_HOST \
        --ebics-partner-id=$2 \
        --currency=EUR
  echo " OK"
}


# Transfer only from debit to credit/anastasis account.
# This function moves funds directly at the Sandbox.  No need
# to pass through the Nexus+Ebics layer to issue the payment
# $1 = amount ($CURRENCY:X.Y), $2 = subject.
function wire_transfer_to_anastasis() {
  libeufin-sandbox make-transaction \
    --debit-account=sandbox-account-debit \
    --credit-account=sandbox-account-credit "$1" "$2"
  # Sync nexus with sandbox
  export LIBEUFIN_NEXUS_USERNAME=$CREDIT_USERNAME
  export LIBEUFIN_NEXUS_PASSWORD=$CREDIT_PASSWORD
  libeufin-cli accounts fetch-transactions nexus-bankaccount-credit > /dev/null
  anastasis-helper-authorization-iban -c $CONF_4 -t -L INFO
}

# $1 = facade base URL.  Merely a debug utility.
function see_anastasis_transactions_via_facade() {
  curl -s --user "$CREDIT_USERNAME:$CREDIT_PASSWORD" "${1}history/incoming?delta=5" | jq
}

# $1 = ebics user id, $2 = ebics partner, $3 = bank connection name
# $4 = bank account name local to Nexus, $5 = bank account name as known
# by Sandbox
function prepare_nexus_account() {
  echo -n "Making bank connection $3 ..."
  libeufin-cli connections new-ebics-connection \
    --ebics-url="${SANDBOX_URL}ebicsweb" \
    --host-id=$EBICS_HOST \
    --partner-id=$2 \
    --ebics-user-id=$1 \
    $3 > /dev/null
  echo " OK"
  echo -n "Connecting $3 ..."
  libeufin-cli connections connect $3 > /dev/null
  echo " OK"
  echo -n "Importing Sandbox bank account ($5) to Nexus ($4) ..."
  libeufin-cli connections download-bank-accounts $3 > /dev/null
  libeufin-cli connections import-bank-account \
    --offered-account-id=$5 --nexus-bank-account-id=$4 $3 > /dev/null
  echo " OK"
}

# $1 = facade name, $2 = bank connection to use, $3 = bank account name
# local to Nexus
function prepare_anastasis_facade() {
  echo -n "Creating facade ..."
  libeufin-cli facades new-anastasis-facade \
    --currency=EUR \
    --facade-name=$1 \
    $2 $3
  echo " OK"
  # No need to setup facade permissions, as the anastasis client
  # is superuser at Nexus.
}



if test "${1:-}" != "free" -a "${1:-}" != "fees"
then
    echo "Launch script with either 'free' or 'fees' argument to launch providers with/without fees."
    exit 1
fi

export CONF_1="test_anastasis_reducer_1.conf"
export CONF_2="test_anastasis_reducer_2.conf"
export CONF_3="test_anastasis_reducer_3.conf"
if test $1 = 'free'
then
    CONF4="test_anastasis_reducer_4_free.conf"
else
    CONF4="test_anastasis_reducer_4.conf"
fi

# Exchange configuration file will be edited, so we create one
# from the template.
export CONF=`mktemp test_reducerXXXXXX.conf`
export CONF_4=`mktemp test_reducer_4XXXXXX.conf`
cp test_reducer.conf $CONF
cp $CONF4 $CONF_4

TMP_DIR=`mktemp -d keys-tmp-XXXXXX`
WALLET_DB=`mktemp test_reducer_walletXXXXXX.json`
B1FILE=`mktemp test_reducer_stateB1XXXXXX`
B2FILE=`mktemp test_reducer_stateB2XXXXXX`
R1FILE=`mktemp test_reducer_stateR1XXXXXX`
R2FILE=`mktemp test_reducer_stateR2XXXXXX`
IBAN_ACTIVE='false'

# Install cleanup handler (except for kill -9)
trap cleanup EXIT

# Check we can actually run
if test $1 = 'fees'
then
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
fi

echo -n "Testing for libeufin-cli"
if libeufin-cli --version > /dev/null
then
    echo " FOUND"
    IBAN_CREDIT=`anastasis-config -c $CONF_4 -s authorization-iban -o CREDIT_IBAN`
    CREDIT_BUSINESS_NAME=`anastasis-config -c $CONF_4 -s authorization-iban -o BUSINESS_NAME`
    echo -n "Setting up Nexus ..."
    export LIBEUFIN_NEXUS_DB_CONNECTION="jdbc:sqlite:$(mktemp -u /tmp/nexus-db-XXXXXX.sqlite)"
    export LIBEUFIN_SANDBOX_DB_CONNECTION="jdbc:sqlite:$(mktemp -u /tmp/sandbox-db-XXXXXX.sqlite)"
    export NEXUS_URL="http://localhost:5001/"
    export SANDBOX_URL="http://localhost:5000/"
    libeufin-nexus serve &> nexus.log &
    nexus_pid=$!
    if ! curl -s --retry 5 --retry-connrefused $NEXUS_URL > /dev/null; then
        exit_skip "Could not launch Nexus"
    fi
    echo -n "."
    libeufin-sandbox serve &> sandbox.log &
    sandbox_pid=$!
    if ! curl -s --retry 5 --retry-connrefused $SANDBOX_URL > /dev/null; then
        exit_skip "Could not launch Sandbox"
    fi
    export EBICS_HOST="ebicstesthost"
    export IBAN_DEBIT="FR1420041010050500013M02606"
    echo "OK"

    echo -n "Preparing Sandbox ..."
    libeufin-cli \
        sandbox --sandbox-url=$SANDBOX_URL \
        ebicshost create \
        --host-id=$EBICS_HOST
    echo " OK"

    export PERSON_CREDIT_NAME="Person Credit"
    echo -n "Preparing accounts ..."
    # note: Ebisc schema doesn't allow dashed names.
    prepare_sandbox_account \
        ebicsuserCredit \
        ebicspartnerCredit \
        "${PERSON_CREDIT_NAME}" \
        sandbox-account-credit \
        $IBAN_CREDIT
    prepare_sandbox_account \
        ebicsuserDebit \
        ebicspartnerDebit \
        "Person Debit" \
        sandbox-account-debit \
        $IBAN_DEBIT
    echo "Sandbox preparation done"

    echo -n "Preparing Nexus ..."
    export LIBEUFIN_NEXUS_URL=$NEXUS_URL
    # Make debit user, will buy Anastasis services.
    export DEBIT_USERNAME=anastasis-debit-user
    export DEBIT_PASSWORD=anastasis-debit-password
    libeufin-nexus superuser $DEBIT_USERNAME --password=$DEBIT_PASSWORD
    echo " OK"
    export LIBEUFIN_NEXUS_USERNAME=$DEBIT_USERNAME
    export LIBEUFIN_NEXUS_PASSWORD=$DEBIT_PASSWORD

    prepare_nexus_account \
        ebicsuserDebit \
        ebicspartnerDebit \
        bankconnection-debit \
        nexus-bankaccount-debit \
        sandbox-account-debit

    # Make credit user, will be Anastasis client.
    export CREDIT_USERNAME=anastasis-credit-user
    export CREDIT_PASSWORD=anastasis-credit-password
    echo -n "Create credit user (for anastasis) at Nexus ..."
    libeufin-nexus superuser $CREDIT_USERNAME --password=$CREDIT_PASSWORD
    echo " OK"
    export LIBEUFIN_NEXUS_USERNAME=$CREDIT_USERNAME
    export LIBEUFIN_NEXUS_PASSWORD=$CREDIT_PASSWORD

    prepare_nexus_account \
        ebicsuserCredit \
        ebicspartnerCredit \
        bankconnection-credit \
        nexus-bankaccount-credit \
        sandbox-account-credit

    echo -n "Create facade ..."
    libeufin-cli facades new-anastasis-facade \
                 --currency="EUR" \
                 --facade-name=facade-credit \
                 bankconnection-credit nexus-bankaccount-credit
    echo " OK"
    export FACADE_URL=$(libeufin-cli facades list | jq .facades[0].baseUrl | tr -d \")

    ## Reach facade with: $FACADE_URL + $CREDIT_USERNAME + $CREDIT_PASSWORD

    echo -n "Configuring Anastasis IBAN account ..."
    anastasis-config -c $CONF_4 \
                     -s authorization-iban \
                     -o CREDIT_IBAN \
                     -V "${IBAN_CREDIT}"
    anastasis-config -c $CONF_4 \
                     -s authorization-iban \
                     -o BUSINESS_NAME \
                     -V "${PERSON_CREDIT_NAME}"
    anastasis-config -c $CONF_4 \
                     -s authorization-iban \
                     -o WIRE_GATEWAY_URL \
                     -V "${FACADE_URL}"
    anastasis-config -c $CONF_4 \
                     -s authorization-iban \
                     -o WIRE_GATEWAY_AUTH_METHOD \
                     -V "basic"
    anastasis-config -c $CONF_4 \
                     -s authorization-iban \
                     -o USERNAME \
                     -V "${LIBEUFIN_NEXUS_USERNAME}"
    anastasis-config -c $CONF_4 \
                     -s authorization-iban \
                     -o PASSWORD \
                     -V "${LIBEUFIN_NEXUS_PASSWORD}"
    anastasis-config -c $CONF_4 \
                     -s authorization-iban \
                     -o ENABLED \
                     -V YES
    echo " OK"
    IBAN_ACTIVE='true'
else
    echo " NOT FOUND (IBAN authentication not supported)"
    anastasis-config -c $CONF_4 \
                     -s authorization-iban \
                     -o ENABLED \
                     -V NO
fi


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

if test $1 = 'fees'
then

    echo -n "Generating Taler auditor, exchange and merchant configurations ..."

    DATA_DIR=`taler-config -f -c $CONF -s PATHS -o TALER_HOME`
    rm -rf $DATA_DIR

    # obtain key configuration data
    MASTER_PRIV_FILE=`taler-config -f -c $CONF -s EXCHANGE -o MASTER_PRIV_FILE`
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

fi


echo -n "Launching anastasis services ..."
# PREFIX="valgrind --log-file=anastasis-httpd.%p.log"
PREFIX=""
$PREFIX anastasis-httpd -L INFO -c $CONF_1 2> anastasis-httpd_1.log &
$PREFIX anastasis-httpd -L INFO -c $CONF_2 2> anastasis-httpd_2.log &
$PREFIX anastasis-httpd -L INFO -c $CONF_3 2> anastasis-httpd_3.log &
$PREFIX anastasis-httpd -L INFO -c $CONF_4 2> anastasis-httpd_4.log &


if test $1 = 'fees'
then

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

fi
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

if test $1 = 'fees'
then

    echo -n "Configuring merchant instance ..."
    # Setup merchant

    curl -H "Content-Type: application/json" -X POST -d '{"auth":{"method":"external"},"payto_uris":["payto://x-taler-bank/localhost/43"],"id":"default","name":"default","address":{},"jurisdiction":{},"default_max_wire_fee":"TESTKUDOS:1", "default_max_deposit_fee":"TESTKUDOS:1","default_wire_fee_amortization":1,"default_wire_transfer_delay":{"d_ms" : 3600000},"default_pay_delay":{"d_ms": 3600000}}' http://localhost:9966/private/instances

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

fi

export -f wire_transfer_to_anastasis

echo "You can now run anastasis-gtk in TESTLAND."
echo " "
echo "We will now start a sub-shell. Please note:"
echo '- to terminate the test environment by leaving the sub-shell use: exit'
if test $IBAN_ACTIVE = 'true'
then
    echo '- for IBAN authentication use: wire_transfer_to_anastasis "$AMOUNT" "$SUBJECT"'
    echo "- for your customer IBAN, use: ${IBAN_DEBIT}"
fi
if test $1 = 'fees'
then
    echo '- to pay, use: taler-wallet-cli --wallet-db=$WALLET_DB handle-uri $PAY_URI -y'
    export WALLET_DB
fi

bash

exit 0
