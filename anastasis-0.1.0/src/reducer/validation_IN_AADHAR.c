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
 * @file reducer/validation_IN_AADHAR.c
 * @brief validation logic for Indian Aadhar numbers
 * @author Christian Grothoff
 */
#include <string.h>
#include <stdbool.h>
#include <ctype.h>

/**
 * The multiplication table.
 */
static int m[10][10] = {
  {0, 1, 2, 3, 4, 5, 6, 7, 8, 9},
  {1, 2, 3, 4, 0, 6, 7, 8, 9, 5},
  {2, 3, 4, 0, 1, 7, 8, 9, 5, 6},
  {3, 4, 0, 1, 2, 8, 9, 5, 6, 7},
  {4, 0, 1, 2, 3, 9, 5, 6, 7, 8},
  {5, 9, 8, 7, 6, 0, 4, 3, 2, 1},
  {6, 5, 9, 8, 7, 1, 0, 4, 3, 2},
  {7, 6, 5, 9, 8, 2, 1, 0, 4, 3},
  {8, 7, 6, 5, 9, 3, 2, 1, 0, 4},
  {9, 8, 7, 6, 5, 4, 3, 2, 1, 0}
};


/**
 * The permutation table.
 */
static int p[10][10] = {
  {0, 1, 2, 3, 4, 5, 6, 7, 8, 9},
  {1, 5, 7, 6, 2, 8, 3, 0, 9, 4},
  {5, 8, 0, 3, 7, 9, 6, 1, 4, 2},
  {8, 9, 1, 6, 0, 4, 3, 5, 2, 7},
  {9, 4, 5, 3, 1, 2, 6, 8, 7, 0},
  {4, 2, 8, 6, 5, 7, 3, 9, 0, 1},
  {2, 7, 9, 3, 8, 0, 6, 4, 1, 5},
  {7, 0, 4, 6, 9, 1, 3, 2, 5, 8}
};


/**
 * Converts a string to a reversed integer array.
 *
 * @param input The numeric string data converted to reversed int array.
 * @param[out] output array containing the digits in the numeric string
 * in reverse order
 */
static bool
string_to_vals (const char *input,
                int output[12])
{
  unsigned int off = 0;

  for (unsigned int i = 0; i < 12;)
  {
    int c = input[i + off];

    if (0 == c)
      return false;
    if (isspace (c))
    {
      off++;
      continue;
    }
    if (! isdigit (c))
      return false;
    output[11 - i++] = c - '0';
  }
  if ('\0' != input[12 + off])
    return false;
  return true;
}


/**
 * Function to validate an Indian Aadhar number.
 *
 * See https://www.geeksforgeeks.org/how-to-check-aadhar-number-is-valid-or-not-using-regular-expression/
 * and http://en.wikipedia.org/wiki/Verhoeff_algorithm/.
 *
 * @param aadhar_number aadhar number to validate (input)
 * @return true if validation passed, else false
 */
bool
IN_AADHAR_check (const char *aadhar_number)
{
  int c = 0;
  int vals[12];

  if (! string_to_vals (aadhar_number,
                        vals))
    return false;
  for (unsigned int i = 0; i < 12; i++)
    c = m[c][p[(i % 8)][vals[i]]];

  return (0 == c);
}
