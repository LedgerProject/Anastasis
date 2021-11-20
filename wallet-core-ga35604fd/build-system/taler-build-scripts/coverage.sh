#!/bin/sh
# Run from 'taler-exchange/' top-level directory to generate
# code coverage data.
TOP=`pwd`
mkdir -p doc/coverage/
lcov -d $TOP -z
make check
lcov -d $TOP -c --no-external -o doc/coverage/coverage.info
lcov -r doc/coverage/coverage.info **/test_* **/perf_*  -o doc/coverage/rcoverage.info
genhtml -o doc/coverage doc/coverage/rcoverage.info
