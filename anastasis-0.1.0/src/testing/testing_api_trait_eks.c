/*
  This file is part of Anastasis
  Copyright (C) 2021 Anastasis SARL

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
 * @file testing/testing_api_trait_eks.c
 * @brief traits to offer a payment identifier
 * @author Dennis Neufeld
 */
#include "platform.h"
#include "anastasis_testing_lib.h"

#define ANASTASIS_TESTING_TRAIT_EKS \
  "anastasis-eks"


int
ANASTASIS_TESTING_get_trait_eks (
  const struct TALER_TESTING_Command *cmd,
  unsigned int index,
  const struct ANASTASIS_CRYPTO_EncryptedKeyShareP **eks)
{
  return cmd->traits (cmd->cls,
                      (const void **) eks,
                      ANASTASIS_TESTING_TRAIT_EKS,
                      index);
}


struct TALER_TESTING_Trait
ANASTASIS_TESTING_make_trait_eks (
  unsigned int index,
  const struct ANASTASIS_CRYPTO_EncryptedKeyShareP *eks)
{
  struct TALER_TESTING_Trait ret = {
    .index = index,
    .trait_name = ANASTASIS_TESTING_TRAIT_EKS,
    .ptr = (const void *) eks
  };
  return ret;
}


/* end of testing_api_trait_eks.c */
