/*
  This file is part of Anastasis
  Copyright (C) 2014-2019 Anastasis SARL

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
 * @file restclient/anastasis_api_curl_defaults.h
 * @brief curl easy handle defaults
 * @author Florian Dold
 */

#ifndef _ANASTASIS_API_CURL_DEFAULTS_H
#define _ANASTASIS_API_CURL_DEFAULTS_H

#include <gnunet/gnunet_curl_lib.h>


/**
 * Get a curl handle with the right defaults
 * for the exchange lib.  In the future, we might manage a pool of connections here.
 *
 * @param url URL to query
 */
CURL *
ANASTASIS_curl_easy_get_ (const char *url);

#endif /* _TALER_CURL_DEFAULTS_H */
