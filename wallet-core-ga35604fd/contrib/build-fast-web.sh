#!/usr/bin/env bash

set -eu
set -x

export DIST=build/web
export NODE_PATH=$DIST:vendor

export BUNDLE_OPTIONS='--bundle --format=esm --target=esnext'

function build_idb() {
  rm -rf packages/idb-bridge/{node_modules,lib,dist,tsconfig.tsbuildinfo}
  idb_dir=$DIST/@gnu-taler/idb-bridge
  mkdir -p $idb_dir
  esbuild $BUNDLE_OPTIONS packages/idb-bridge/src/index.ts > $idb_dir/index.js
}

function build_taler_util() {
  taler_util_dir=$DIST/@gnu-taler/taler-util
  mkdir -p $taler_util_dir
  rm -rf packages/taler-util/{node_modules,lib,dist,tsconfig.tsbuildinfo}

  esbuild $BUNDLE_OPTIONS packages/taler-util/src/index.ts > $taler_util_dir/index.js
}

function build_fflate() {
  fflate_dir=$DIST/fflate
  mkdir -p $fflate_dir
  esbuild $BUNDLE_OPTIONS vendor/fflate/src/index.ts > $fflate_dir/index.js
}

function build_ct() {
  ct_dir=$DIST/cancellationtoken
  mkdir -p $ct_dir
  esbuild $BUNDLE_OPTIONS vendor/cancellationtoken/src/index.ts > $ct_dir/index.js
}

function build_wallet_core() {
  taler_wallet_core_dir=$DIST/@gnu-taler/taler-wallet-core

  rm -rf packages/taler-wallet-core/{node_modules,lib,dist,tsconfig.tsbuildinfo}

  mkdir -p $taler_wallet_core_dir
  esbuild $BUNDLE_OPTIONS --external:@gnu-taler/taler-util packages/taler-wallet-core/src/index.browser.ts > $taler_wallet_core_dir/index.js
}

function build_wallet_embedded() {
  taler_wallet_embedded_dir=$DIST/@gnu-taler/taler-wallet-embedded
  rm -rf packages/taler-wallet-embedded/{node_modules,lib,dist,tsconfig.tsbuildinfo}

  mkdir -p $taler_wallet_embedded_dir
  esbuild $BUNDLE_OPTIONS packages/taler-wallet-embedded/src/index.ts > $taler_wallet_embedded_dir/taler-wallet-embedded.js
}

function build_vendor() {
  mkdir -p $DIST/$1

  esbuild $BUNDLE_OPTIONS vendor/$1/src/index.js > $DIST/$1/index.js
}

function build_preact() {
  mkdir -p $DIST/preact/{debug,hooks}

  esbuild $BUNDLE_OPTIONS vendor/preact/src/index.js > $DIST/preact/index.js
  esbuild $BUNDLE_OPTIONS --external:preact vendor/preact/hooks/src/index.js > $DIST/preact/hooks/index.js
  esbuild $BUNDLE_OPTIONS --external:preact vendor/preact/debug/src/index.js > $DIST/preact/debug/index.js
}

function build_preact-router() {
  mkdir -p $DIST/preact-router/match

  esbuild $BUNDLE_OPTIONS --external:preact vendor/preact-router/src/index.js > $DIST/preact-router/index.js
  esbuild $BUNDLE_OPTIONS --loader:.js=jsx --external:preact --external:preact-router vendor/preact-router/src/match.js > $DIST/preact-router/match/index.js
}

function build_preact_compat() {
  mkdir -p $DIST/{react/jsx-runtime,react-dom/test-utils}

  esbuild $BUNDLE_OPTIONS --loader:.js=jsx vendor/preact/compat/src/index.js > $DIST/react/index.js

  esbuild $BUNDLE_OPTIONS --loader:.js=jsx --external:preact vendor/preact/compat/src/index.js > $DIST/react/index.js
  esbuild $BUNDLE_OPTIONS --loader:.js=jsx --external:preact vendor/preact/compat/src/index.js > $DIST/react-dom/index.js
  esbuild $BUNDLE_OPTIONS --loader:.js=jsx vendor/preact/jsx-runtime/src/index.js > $DIST/react/jsx-runtime/index.js
  esbuild $BUNDLE_OPTIONS --loader:.js=jsx vendor/preact/test-utils/src/index.js > $DIST/react-dom/test-utils/index.js
}

function build_history() {
  mkdir -p $DIST/{history,resolve-pathname,value-equal,tiny-warning,tiny-invariant}

  esbuild $BUNDLE_OPTIONS --loader:.js=ts vendor/tiny-warning/src/index.js > $DIST/tiny-warning/index.js
  esbuild $BUNDLE_OPTIONS --loader:.js=ts vendor/tiny-invariant/src/index.js > $DIST/tiny-invariant/index.js

  esbuild $BUNDLE_OPTIONS vendor/resolve-pathname/modules/index.js > $DIST/resolve-pathname/index.js
  esbuild $BUNDLE_OPTIONS vendor/value-equal/modules/index.js > $DIST/value-equal/index.js

  esbuild $BUNDLE_OPTIONS vendor/history/modules/index.js > $DIST/history/index.js
}

function build_linaria() {
  mkdir -p $DIST/@linaria/{react,core}
  mkdir -p $DIST/@emotion/is-prop-valid

  esbuild $BUNDLE_OPTIONS vendor/@emotion/is-prop-valid/index.js > $DIST/@emotion/is-prop-valid/index.js

  esbuild $BUNDLE_OPTIONS vendor/@linaria/packages/core/src/index.ts > $DIST/@linaria/core/index.js
  esbuild $BUNDLE_OPTIONS --external:preact vendor/@linaria/packages/react/src/index.ts > $DIST/@linaria/react/index.js
}

function build_wallet_webextension() {
  rm -rf packages/taler-wallet-webextension/{node_modules,lib,dist,tsconfig.tsbuildinfo,extension}

  taler_wallet_webextension_dir=packages/taler-wallet-webextension/dist
  mkdir -p $taler_wallet_webextension_dir

  esbuild $BUNDLE_OPTIONS packages/taler-wallet-webextension/src/background.ts > $taler_wallet_webextension_dir/background.js
  esbuild $BUNDLE_OPTIONS packages/taler-wallet-webextension/src/browserWorkerEntry.ts > $taler_wallet_webextension_dir/browserWorkerEntry.js

  # implemented as a script because right now esbuild binary does not support plugins
  # FIXME: remove javascript when possible
  node ./contrib/build-fast-with-linaria.mjs packages/taler-wallet-webextension/src/popupEntryPoint.tsx $taler_wallet_webextension_dir
  node ./contrib/build-fast-with-linaria.mjs packages/taler-wallet-webextension/src/walletEntryPoint.tsx $taler_wallet_webextension_dir
}


build_idb
build_taler_util
build_fflate
build_wallet_core

build_vendor date-fns

build_preact
build_preact-router
build_preact_compat

build_history
build_linaria

build_wallet_webextension
