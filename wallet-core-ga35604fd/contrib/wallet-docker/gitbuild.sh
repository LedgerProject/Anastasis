#!/bin/sh

# Helper script to build the latest git wallet in the walletbuilder container.

set -eu

# Fetch source
git clone https://git.taler.net/wallet-core.git

cd wallet-core

# Only for git repositories
./bootstrap

# Run build
./configure
make webextension

# Copy WebExtension to root folder
cp wallet-core/packages/taler-wallet-webextension/taler-wallet*.zip /
