/*
  This file is part of Anastasis
  Copyright (C) 2014, 2015, 2016, 2021 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU Affero General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with
  Anastasis; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
*/

/**
 * @file anastasis/src/include/platform.h
 * @brief This file contains the includes and definitions which are used by the
 *        rest of the modules
 * @author Sree Harsha Totakura <sreeharsha@totakura.in>
 */

#ifndef PLATFORM_H_
#define PLATFORM_H_

/* Include our configuration header */
#ifndef HAVE_USED_CONFIG_H
# define HAVE_USED_CONFIG_H
# ifdef HAVE_CONFIG_H
#  include "anastasis_config.h"
# endif
#endif


#if (GNUNET_EXTRA_LOGGING >= 1)
#define VERBOSE(cmd) cmd
#else
#define VERBOSE(cmd) do { break; } while (0)
#endif


/* LSB-style exit status codes */
#ifndef EXIT_INVALIDARGUMENT
#define EXIT_INVALIDARGUMENT 2
#endif

#ifndef EXIT_NOTIMPLEMENTED
#define EXIT_NOTIMPLEMENTED 3
#endif

#ifndef EXIT_NOPERMISSION
#define EXIT_NOPERMISSION 4
#endif

#ifndef EXIT_NOTINSTALLED
#define EXIT_NOTINSTALLED 5
#endif

#ifndef EXIT_NOTCONFIGURED
#define EXIT_NOTCONFIGURED 6
#endif

#ifndef EXIT_NOTRUNNING
#define EXIT_NOTRUNNING 7
#endif


/* Include the features available for GNU source */
#define _GNU_SOURCE

/* Include GNUnet's platform file */
#include <gnunet/platform.h>

/* Do not use shortcuts for gcrypt mpi */
#define GCRYPT_NO_MPI_MACROS 1

/* Do not use deprecated functions from gcrypt */
#define GCRYPT_NO_DEPRECATED 1

/* Ignore MHD deprecations for now as we want to be compatible
   to "ancient" MHD releases. */
#define MHD_NO_DEPRECATION 1

#endif  /* PLATFORM_H_ */

/* end of platform.h */
