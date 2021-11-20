/*
  This file is part of TALER
  Copyright (C) 2018, 2021 Taler Systems SA

  TALER is free software; you can redistribute it and/or modify
  it under the terms of the GNU General Public License as
  published by the Free Software Foundation; either version 3, or
  (at your option) any later version.

  TALER is distributed in the hope that it will be useful, but
  WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public
  License along with TALER; see the file COPYING.  If not, see
  <http://www.gnu.org/licenses/>
*/
/**
 * @file testing/testing_api_traits.c
 * @brief loop for trait resolution
 * @author Christian Grothoff
 * @author Marcello Stanisci
 */
#include "platform.h"
#include "anastasis_testing_lib.h"
#include <taler/taler_json_lib.h>
#include <gnunet/gnunet_curl_lib.h>
#include <taler/taler_testing_lib.h>


ANASTASIS_TESTING_SIMPLE_TRAITS (ANASTASIS_TESTING_MAKE_IMPL_SIMPLE_TRAIT)

ANASTASIS_TESTING_INDEXED_TRAITS (ANASTASIS_TESTING_MAKE_IMPL_INDEXED_TRAIT)

/* end of testing_api_traits.c */
