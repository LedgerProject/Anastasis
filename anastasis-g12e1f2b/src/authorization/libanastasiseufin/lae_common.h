/*
  This file is part of Anastasis
  Copyright (C) 2015, 2016, 2017 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

  You should have received a copy of the GNU General Public License along with
  Anastasis; see the file COPYING.  If not, see
  <http://www.gnu.org/licenses/>
*/
/**
 * @file libanastasiseufin/lae_common.h
 * @brief Common functions for the bank API
 * @author Christian Grothoff
 */
#ifndef LAE_COMMON_H
#define LAE_COMMON_H

#include <gnunet/gnunet_util_lib.h>
#include <gnunet/gnunet_json_lib.h>
#include <gnunet/gnunet_curl_lib.h>
#include "anastasis_eufin_lib.h"
#include <taler/taler_json_lib.h>


/**
 * Set authentication data in @a easy from @a auth.
 *
 * @param easy curl handle to setup for authentication
 * @param auth authentication data to use
 * @return #GNUNET_OK in success
 */
int
ANASTASIS_EUFIN_setup_auth_ (
  CURL *easy,
  const struct ANASTASIS_EUFIN_AuthenticationData *auth);


#endif
