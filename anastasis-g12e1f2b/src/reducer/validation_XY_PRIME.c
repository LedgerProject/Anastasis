/*
  This file is part of Anastasis
  Copyright (C) 2020, 2021 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

  You should have received a copy of the GNU General Public License along with
  Anastasis; see the file COPYING.GPL.  If not, see <http://www.gnu.org/licenses/>
*/
/**
 * @file reducer/validation_XY_PRIME.c
 * @brief anastasis reducer api
 * @author Christian Grothoff
 * @author Dominik Meister
 * @author Dennis Neufeld
 */
#include <string.h>
#include <stdbool.h>
#include <stdio.h>
#include <gcrypt.h>

/**
 * Function to validate a prime number.
 *
 * @param pr_number prime number to validate (input)
 * @return true if pr_number is a prime, else false
 */
bool
XY_PRIME_check (const char *pr_number)
{
  unsigned long long n;
  char dummy;
  gcry_mpi_t p;
  bool is_prime;

  if (1 != sscanf (pr_number,
                   "%llu%c",
                   &n,
                   &dummy))
    return false;
  p = gcry_mpi_set_ui (NULL,
                       (unsigned long) n);
  is_prime = (0 == gcry_prime_check (p,
                                     0));
  gcry_mpi_release (p);
  return is_prime;
}
