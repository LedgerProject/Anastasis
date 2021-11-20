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
 * @file reducer/validation_CZ_BN.c
 * @brief validation of Czeck Birth Numbers
 * @author Christian Grothoff
 */
#include <string.h>
#include <stdbool.h>
#include <stdio.h>
#include <gcrypt.h>

/**
 * Function to validate a Check birth number. Basically,
 * if it has 10 digits, it must be divisible by 11.
 *
 * @param b_number birth number to validate (input)
 * @return true if b_number is valid
 */
bool
CZ_BN_check (const char *b_number)
{
  unsigned long long n;
  char dummy;
  char in[11];

  if (10 == strlen (b_number))
    return true;
  if (11 != strlen (b_number))
    return false;
  if (b_number[6] != '/')
    return false;
  memcpy (in,
          b_number,
          6);
  memcpy (&in[6],
          &b_number[7],
          4);
  in[10] = '\0';
  if (1 != sscanf (in,
                   "%llu%c",
                   &n,
                   &dummy))
    return false;
  return 0 == (n % 11);
}
