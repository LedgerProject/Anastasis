#!/bin/bash

# Generate a single TS file from the JSON data files in contrib/.
# Requires prettier to be installed.

gen_ts() {
  echo "// This file is auto-generated, do not modify."
  echo "// Generated from $(git describe --tags) on $(date -R)"
  echo "// To re-generate, run contrib/gen-ts.sh from the main anastasis code base."
  echo
  echo "export const anastasisData = {"
  echo "providersList: $(cat provider-list.json),"
  echo "countriesList: $(cat redux.countries.json),"
  echo "countryDetails: {"
  for f in redux.??.json; do
    cc=$(echo $f | awk -F "." '{ print $2 }')
    echo "$cc: $(cat $f),"
  done
  echo "}," # country details
  echo "}" # anastasis data

}

gen_ts > anastasis-data.ts
# Auto-format
prettier -w anastasis-data.ts
