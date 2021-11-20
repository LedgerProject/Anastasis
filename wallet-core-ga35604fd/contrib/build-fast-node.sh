#!/usr/bin/env bash

set -eu
set -x

export DIST=build/node
export NODE_PATH=$DIST:vendor

function build_idb() {
  rm -rf packages/idb-bridge/{node_modules,lib,dist,tsconfig.tsbuildinfo}
  idb_dir=$DIST/@gnu-taler/idb-bridge
  mkdir -p $idb_dir
  esbuild --platform=node --bundle packages/idb-bridge/src/index.ts > $idb_dir/index.js
}

function build_taler_util() {
  rm -rf packages/taler-util/{node_modules,lib,dist,tsconfig.tsbuildinfo}
  taler_util_dir=$DIST/@gnu-taler/taler-util
  mkdir -p $taler_util_dir
  esbuild --platform=node --bundle packages/taler-util/src/index.ts > $taler_util_dir/index.js
}

function build_fflate() {
  fflate_dir=$DIST/fflate
  mkdir -p $fflate_dir
  esbuild --platform=node --bundle vendor/fflate/src/index.ts > $fflate_dir/index.js
}

function build_ct() {
  ct_dir=$DIST/cancellationtoken
  mkdir -p $ct_dir
  esbuild --target=es6 --platform=node --bundle vendor/cancellationtoken/src/index.ts > $ct_dir/index.js
}

function build_wallet_core() {
  rm -rf packages/taler-wallet-core/{node_modules,lib,dist,tsconfig.tsbuildinfo}
  taler_wallet_core_dir=$DIST/@gnu-taler/taler-wallet-core

  mkdir -p $taler_wallet_core_dir
  esbuild --platform=node --bundle --external:@gnu-taler/taler-util packages/taler-wallet-core/src/index.node.ts > $taler_wallet_core_dir/index.js
}

function build_wallet_embedded() {
  rm -rf packages/taler-wallet-embedded/{node_modules,lib,dist,tsconfig.tsbuildinfo}
  taler_wallet_embedded_dir=$DIST/@gnu-taler/taler-wallet-embedded

  mkdir -p $taler_wallet_embedded_dir
  esbuild --platform=node --bundle packages/taler-wallet-embedded/src/index.ts > $taler_wallet_embedded_dir/taler-wallet-embedded.js
}

function build_wallet_cli() {
  rm -rf packages/taler-wallet-cli/{node_modules,lib,dist,tsconfig.tsbuildinfo}
  taler_wallet_cli_dir=$DIST/@gnu-taler/taler-wallet-cli
  mkdir -p $taler_wallet_cli_dir

  esbuild --platform=node --bundle packages/taler-wallet-cli/src/index.ts > $taler_wallet_cli_dir/index.js
  cp $taler_wallet_cli_dir/index.js $taler_wallet_cli_dir/taler-wallet-cli.js
}


build_idb
build_taler_util
build_fflate
build_wallet_core
build_wallet_embedded
build_ct

build_wallet_cli

