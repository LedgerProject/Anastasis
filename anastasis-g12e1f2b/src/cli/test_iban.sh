#!/bin/bash

set -eu
set -x

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
    rm -rf $CONF $R1FILE $R2FILE $B1FILE $B2FILE
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
        --ebics-partner-id=$2
  echo " OK"
}


# Install cleanup handler (except for kill -9)
trap cleanup EXIT


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
    --currency=$CURRENCY \
    --facade-name=$1 \
    $2 $3
  echo " OK"
  # No need to setup facade permissions, as the anastasis client
  # is superuser at Nexus.
}

# Configuration file will be edited, so we create one
# from the template.
CONF=`mktemp test_free_reducerXXXXXX.conf`
cp test_free_reducer.conf $CONF

B1FILE=`mktemp test_reducer_stateB1XXXXXX`
B2FILE=`mktemp test_reducer_stateB2XXXXXX`
R1FILE=`mktemp test_reducer_stateR1XXXXXX`
R2FILE=`mktemp test_reducer_stateR2XXXXXX`

export CONF
export B2FILE
export B1FILE
export R2FILE
export R1FILE

echo -n "Testing for libeufin-cli"
libeufin-cli --version > /dev/null || exit_skip "libeufin-cli required"
echo " FOUND"

echo -n "Testing for libeufin-nexus"
libeufin-nexus --version > /dev/null || exit_skip "libeufin-nexus required"
echo " FOUND"

echo -n "Testing for libeufin-sandbox"
libeufin-sandbox --version > /dev/null || exit_skip "libeufin-sandbox required"
echo " FOUND"

# Check we can actually run
echo -n "Testing for jq"
jq -h > /dev/null || exit_skip "jq required"
echo " FOUND"
echo -n "Testing for anastasis-reducer ..."
anastasis-reducer -h > /dev/null || exit_skip "anastasis-reducer required"
echo " FOUND"

export LIBEUFIN_NEXUS_DB_CONNECTION="jdbc:sqlite:$(mktemp -u /tmp/nexus-db-XXXXXX.sqlite)"
export LIBEUFIN_SANDBOX_DB_CONNECTION="jdbc:sqlite:$(mktemp -u /tmp/sandbox-db-XXXXXX.sqlite)"
NEXUS_URL="http://localhost:5001/"
SANDBOX_URL="http://localhost:5000/"

echo -n "Starting Nexus ..."
libeufin-nexus serve &> nexus.log &
nexus_pid=$!
if ! curl -s --retry 5 --retry-connrefused $NEXUS_URL > /dev/null; then
  exit_skip "Could not launch Nexus"
fi
echo " OK"

echo -n "Starting Sandbox ..."
libeufin-sandbox serve --no-auth &> sandbox.log &
sandbox_pid=$!
if ! curl -s --retry 5 --retry-connrefused $SANDBOX_URL > /dev/null; then
  exit_skip "Could not launch Sandbox"
fi
echo " OK"

CURRENCY="EUR"
# CURRENCY="TESTKUDOS"

EBICS_HOST="ebicstesthost"
export IBAN_CREDIT="DE89370400440532013000"
export IBAN_DEBIT="FR1420041010050500013M02606"

echo -n "Preparing Sandbox ..."
libeufin-cli \
  sandbox --sandbox-url=$SANDBOX_URL \
    ebicshost create \
      --host-id=$EBICS_HOST
echo " OK"

PERSON_CREDIT_NAME="Person Credit"
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
DEBIT_USERNAME=anastasis-debit-user
DEBIT_PASSWORD=anastasis-debit-password
libeufin-nexus superuser $DEBIT_USERNAME --password=$DEBIT_PASSWORD
echo " OK"
export LIBEUFIN_NEXUS_USERNAME=$DEBIT_USERNAME
export LIBEUFIN_NEXUS_PASSWORD=$DEBIT_PASSWORD

# Make credit user, will be Anastasis client.
CREDIT_USERNAME=anastasis-credit-user
CREDIT_PASSWORD=anastasis-credit-password
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
  --currency=$CURRENCY \
  --facade-name=facade-credit \
  bankconnection-credit nexus-bankaccount-credit
echo " OK"
FACADE_URL=$(libeufin-cli facades list | jq .facades[0].baseUrl | tr -d \")

## Reach facade with: $FACADE_URL + $CREDIT_USERNAME + $CREDIT_PASSWORD

echo -n "Initialize Anastasis database ..."
# Name of the Postgres database we will use for the script.
# Will be dropped, do NOT use anything that might be used
# elsewhere

TARGET_DB=`anastasis-config -c $CONF -s stasis-postgres -o CONFIG | sed -e "s/^postgres:\/\/\///"`

dropdb $TARGET_DB >/dev/null 2>/dev/null || true
createdb $TARGET_DB || exit_skip "Could not create database $TARGET_DB"
anastasis-dbinit -c $CONF 2> anastasis-dbinit.log

echo " OK"

echo -n "Configuring Anastasis IBAN account ..."
anastasis-config -c $CONF \
                 -s authorization-iban \
                 -o CREDIT_IBAN \
                 -V "${IBAN_CREDIT}"
anastasis-config -c $CONF \
                 -s authorization-iban \
                 -o BUSINESS_NAME \
                 -V "${PERSON_CREDIT_NAME}"
anastasis-config -c $CONF \
                 -s authorization-iban \
                 -o WIRE_GATEWAY_URL \
                 -V "${FACADE_URL}"
anastasis-config -c $CONF \
                 -s authorization-iban \
                 -o WIRE_GATEWAY_AUTH_METHOD \
                 -V "basic"
anastasis-config -c $CONF \
                 -s authorization-iban \
                 -o USERNAME \
                 -V "${LIBEUFIN_NEXUS_USERNAME}"
anastasis-config -c $CONF \
                 -s authorization-iban \
                 -o PASSWORD \
                 -V "${LIBEUFIN_NEXUS_PASSWORD}"
echo " OK"

echo -n "Launching Anastasis service ..."
PREFIX="" #valgrind
$PREFIX anastasis-httpd -c $CONF -L INFO 2> anastasis-httpd_1.log &
echo " OK"

echo -n "Waiting for Anastasis service ..."
# Wait for Anastasis service to be available
for n in `seq 1 50`
do
    echo -n "."
    sleep 0.1
    OK=0
   # anastasis_01
    wget --tries=1 --timeout=1 http://localhost:8086/ -o /dev/null -O /dev/null >/dev/null || continue
    OK=1
    break
done
if [ 1 != $OK ]
then
    exit_skip "Failed to launch Anastasis service"
fi
echo "OK"

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
  select_country < $B2FILE > $B1FILE 2>> test_reducer.err
echo -n "."

anastasis-reducer -a \
  '{"identity_attributes": {
    "full_name": "Max Musterman",
    "sq_number": "4",
    "birthdate": "2000-01-01"}}' \
  enter_user_attributes < $B1FILE > $B2FILE 2>> test_reducer.err
echo -n ","
BASEIBAN=`echo -n $IBAN_DEBIT | gnunet-base32`
anastasis-reducer -a \
  "$(jq -n '{ authentication_method: {
    type: "iban",
    instructions: "Send me your money!",
    challenge: $CHALLENGE
    } }' \
   --arg CHALLENGE "$BASEIBAN"
  )" \
  add_authentication < $B2FILE > $B1FILE 2>> test_reducer.err
echo -n "."
# Finished adding authentication methods
anastasis-reducer \
    next < $B1FILE > $B2FILE 2>> test_reducer.err

echo -n ","
# Finished policy review
anastasis-reducer \
  next < $B2FILE > $B1FILE 2>> test_reducer.err
echo -n "."
# Note: 'secret' must here be a Crockford base32-encoded value
anastasis-reducer -a \
  '{"secret": { "value" : "VERYHARDT0GVESSSECRET", "mime" : "text/plain" }}' \
  enter_secret < $B1FILE > $B2FILE 2>> test_reducer.err
mv $B2FILE $B1FILE
anastasis-reducer next < $B1FILE > $B2FILE 2>> test_reducer.err
echo " OK"

echo -n "Final backup checks ..."
STATE=`jq -r -e .backup_state < $B2FILE`
if test "$STATE" != "BACKUP_FINISHED"
then
    exit_fail "Expected new state to be 'BACKUP_FINISHED', got '$STATE'"
fi
jq -r -e .core_secret < $B2FILE > /dev/null && exit_fail "'core_secret' was not cleared upon success"
echo " OK"

echo -n "Running recovery basic logic ..."
anastasis-reducer -r > $R1FILE
anastasis-reducer -a \
  '{"continent": "Testcontinent"}' \
  select_continent < $R1FILE > $R2FILE
anastasis-reducer -a \
  '{"country_code": "xx",
    "currencies":["TESTKUDOS"]}' \
  select_country < $R2FILE > $R1FILE 2>> test_reducer.err
anastasis-reducer -a '{"identity_attributes": { "full_name": "Max Musterman", "sq_number": "4", "birthdate": "2000-01-01" }}' enter_user_attributes < $R1FILE > $R2FILE 2>> test_reducer.err


STATE=`jq -r -e .recovery_state < $R2FILE`
if test "$STATE" != "SECRET_SELECTING"
then
    exit_fail "Expected new state to be 'SECRET_SELECTING', got '$STATE'"
fi
echo " OK"

echo -n "Selecting default secret"
mv $R2FILE $R1FILE
anastasis-reducer next < $R1FILE > $R2FILE 2>> test_reducer.err

STATE=`jq -r -e .recovery_state < $R2FILE`
if test "$STATE" != "CHALLENGE_SELECTING"
then
    exit_fail "Expected new state to be 'CHALLENGE_SELECTING', got '$STATE'"
fi
echo " OK"

echo -n "Running challenge selection logic ..."

NAME_UUID=`jq -r -e .recovery_information.challenges[0].uuid < $R2FILE`
anastasis-reducer -a \
  "$(jq -n '
    {
        uuid: $UUID
    }' \
    --arg UUID "$NAME_UUID"
  )" \
  select_challenge < $R2FILE > $R1FILE 2>> test_reducer.err

echo "OK"

METHOD=`jq -r -e .challenge_feedback.\"$NAME_UUID\".method < $R1FILE`
if test "$METHOD" != "iban"
then
    exit_fail "Expected method to be 'iban', got ${METHOD}"
fi

ACC=`jq -r -e .challenge_feedback.\"$NAME_UUID\".details.credit_iban < $R1FILE`
if test "$ACC" != ${IBAN_CREDIT}
then
    exit_fail "Expected account to be ${IBAN_CREDIT}, got ${ACC}"
fi

anastasis-reducer \
  back < $R1FILE > $R2FILE 2>> test_reducer.err


AMOUNT=`jq -r -e .challenge_feedback.\"$NAME_UUID\".details.challenge_amount < $R1FILE`
SUBJECT=`jq -r -e .challenge_feedback.\"$NAME_UUID\".details.wire_transfer_subject < $R1FILE`

echo -n "Performing authorization wire transfer ..."
wire_transfer_to_anastasis "${AMOUNT}" "${SUBJECT}"

echo " OK"

echo -n "Triggering inbound check ..."
anastasis-helper-authorization-iban -c $CONF -t
echo " OK"

# Now we should get the secret...
echo -n "Polling for recovery ..."
anastasis-reducer poll < $R2FILE > $R1FILE
echo " OK"

echo -n "Checking recovered secret ..."
# finally: check here that we recovered the secret...

STATE=`jq -r -e .recovery_state < $R1FILE`
if test "$STATE" != "RECOVERY_FINISHED"
then
    jq -e . $R1FILE
    exit_fail "Expected new state to be 'RECOVERY_FINISHED', got '$STATE'"
fi

SECRET=`jq -r -e .core_secret.value < $R1FILE`
if test "$SECRET" != "VERYHARDT0GVESSSECRET"
then
    jq -e . $R1FILE
    exit_fail "Expected recovered secret to be 'VERYHARDT0GVESSSECRET', got '$SECRET'"
fi

MIME=`jq -r -e .core_secret.mime < $R1FILE`
if test "$MIME" != "text/plain"
then
    jq -e . $R1FILE
    exit_fail "Expected recovered mime to be 'text/plain', got '$MIME'"
fi

echo " OK"

exit 0
