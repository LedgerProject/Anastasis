#!/bin/sh
# Helper script to recompute error codes based on submodule
# Run from exchange/ main directory.
set -eu

# Generate taler-error-codes.h in gana and copy it to
# src/include/taler_error_codes.h
cd contrib/gana/gnu-taler-error-codes
make
cd ../../..
cat contrib/gana/gnu-taler-error-codes/taler_error_codes.h | sed -e "s/GNU_TALER_ERROR_CODES_H/GNU_ANASTASIS_ERROR_CODES_H/" -e "s/taler_error_codes.h/anastasis_error_codes.h/" > src/include/anastasis_error_codes.h
