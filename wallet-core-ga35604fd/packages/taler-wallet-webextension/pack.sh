#!/usr/bin/env bash
# This file is in the public domain.

set -eu

if [[ ! -e package.json ]]; then
  echo "Please run this from the root of the repo.">&2
  exit 1
fi

vers_manifest=$(jq -r '.version' manifest.json)

zipfile="taler-wallet-webextension-${vers_manifest}.zip"

TEMP_DIR=$(mktemp -d)
jq '. | .name = "GNU Taler Wallet" ' manifest.json > $TEMP_DIR/manifest.json
cp -r dist static $TEMP_DIR
(cd $TEMP_DIR && zip -r "$zipfile" dist static manifest.json)
mkdir -p extension
mv "$TEMP_DIR/$zipfile" ./extension/
rm -rf $TEMP_DIR
echo "Packed webextension: extension/$zipfile"
