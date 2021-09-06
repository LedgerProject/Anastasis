/*
  This file is part of Anastasis
  Copyright (C) 2019 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it
  under the terms of the GNU Affero General Public License as published
  by the Free Software Foundation; either version 3, or (at your
  option) any later version.

  Anastasis is distributed in the hope that it will be useful, but
  WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
  General Public License for more details.

  You should have received a copy of the GNU Affero General Public
  License along with Anastasis; see the file COPYING.  If not, see
  <http://www.gnu.org/licenses/>
*/
/**
 * @file testing/testing_api_trait_payment_secret.c
 * @brief traits to offer a payment identifier
 * @author Dennis Neufeld
 */
#include "platform.h"
#include "anastasis_testing_lib.h"

#define ANASTASIS_TESTING_TRAIT_PAYMENT_SECRET \
  "anastasis-payment_secret"


int
ANASTASIS_TESTING_get_trait_payment_secret (
  const struct TALER_TESTING_Command *cmd,
  unsigned int index,
  const struct ANASTASIS_PaymentSecretP **payment_secret)
{
  return cmd->traits (cmd->cls,
                      (const void **) payment_secret,
                      ANASTASIS_TESTING_TRAIT_PAYMENT_SECRET,
                      index);
}


struct TALER_TESTING_Trait
ANASTASIS_TESTING_make_trait_payment_secret (
  unsigned int index,
  const struct ANASTASIS_PaymentSecretP *h)
{
  struct TALER_TESTING_Trait ret = {
    .index = index,
    .trait_name = ANASTASIS_TESTING_TRAIT_PAYMENT_SECRET,
    .ptr = (const void *) h
  };

  return ret;
}


/* end of testing_api_trait_payment_secret.c */
