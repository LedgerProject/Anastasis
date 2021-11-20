#!/usr/bin/env bash
# This file is in the public domain.
rm -rf dist lib tsconfig.tsbuildinfo && (cd ../.. && rm -rf build/web && ./contrib/build-fast-web.sh) && rm -rf extension/ && ./pack.sh  && (cd extension/ && unzip taler*.zip)

