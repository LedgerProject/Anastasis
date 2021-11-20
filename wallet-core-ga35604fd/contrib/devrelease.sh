#!/usr/bin/env bash

set -eu

set -x

devtag=$1

git tag $devtag || true

make compile

if [[ ! -d prebuilt ]]; then
  git worktree add -f prebuilt prebuilt
fi

mkdir -p prebuilt/$devtag

cp packages/taler-wallet-android/dist/taler-wallet-android.js prebuilt/$devtag/
cd prebuilt
git add -A $devtag
git commit -m "prebuilt files for $devtag" || true

echo "please push:"
echo "git push --tags origin master prebuilt"
