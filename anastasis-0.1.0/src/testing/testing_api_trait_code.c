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
 * @file testing/testing_api_trait_code.c
 * @brief traits to offers a code for a challenge
 * @author Dominik Meister
 * @author Christian Grothoff
 */
#include "platform.h"
#include "anastasis_testing_lib.h"

#define ANASTASIS_TESTING_TRAIT_CODE "anastasis-code"


int
ANASTASIS_TESTING_get_trait_code (
  const struct TALER_TESTING_Command *cmd,
  unsigned int index,
  const char **code)
{
  return cmd->traits (cmd->cls,
                      (const void **) code,
                      ANASTASIS_TESTING_TRAIT_CODE,
                      index);
}


struct TALER_TESTING_Trait
ANASTASIS_TESTING_make_trait_code (
  unsigned int index,
  const char *code)
{
  struct TALER_TESTING_Trait ret = {
    .index = index,
    .trait_name = ANASTASIS_TESTING_TRAIT_CODE,
    .ptr = (const void *) code
  };

  return ret;
}


/* end of testing_api_trait_code.c */
