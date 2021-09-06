/*
  This file is part of Anastasis
  Copyright (C) 2020, 2021 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU Lesser General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with
  Anastasis; see the file COPYING.GPL.  If not, see <http://www.gnu.org/licenses/>
*/
/**
 * @file reducer/validation_XX_SQUARE.c
 * @brief anastasis reducer api
 * @author Christian Grothoff
 * @author Dominik Meister
 * @author Dennis Neufeld
 */
#include <string.h>
#include <stdbool.h>
#include <stdio.h>
#include <math.h>

/**
 * Function to validate a square number.
 *
 * @param sq_number square number to validate (input)
 * @return true if sq_number is a square, else false
 */
bool
XX_SQUARE_check (const char *sq_number)
{
  unsigned long long n;
  unsigned long long r;
  char dummy;

  if (1 != sscanf (sq_number,
                   "%llu%c",
                   &n,
                   &dummy))
    return false;
  r = sqrt (n);
  return (n == r * r);
}
