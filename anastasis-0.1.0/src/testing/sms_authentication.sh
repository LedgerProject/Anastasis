#!/usr/bin/env bash
# Note: to use this script, you must set
# ANASTASIS_SMS_API_KEY and
# ANASTASIS_SMS_API_SECRET environment variables.
curl -X "POST" "https://rest.nexmo.com/sms/json" \
     -d "from=Vonage APIs" \
     -d "text=$1" \
     -d "to=$2" \
     -d "api_key=$ANASTASIS_SMS_API_KEY" \
     -d "api_secret=$ANASTASIS_SMS_API_SECRET"
