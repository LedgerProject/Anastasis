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
 * @file reducer/validation_DE_SVN.c
 * @brief
 * @author Christian Grothoff
 * @author Dominik Meister
 * @author Dennis Neufeld
 */
#include <string.h>
#include <stdbool.h>

/**
 * Sum up all digits in @a v and return the result.
 */
static unsigned int
q (unsigned int v)
{
  unsigned int r = 0;

  while (0 != v)
  {
    r += v % 10;
    v = v / 10;
  }
  return r;
}


/**
 * Function to validate a German Social Security number.
 *
 * See https://www.financescout24.de/wissen/ratgeber/sozialversicherungsnummer
 * and https://de.wikipedia.org/wiki/Versicherungsnummer
 * for the structure!
 *
 * @param ssn_number social security number to validate (input)
 * @return true if validation passed, else false
 */
bool
DE_SVN_check (const char *ssn_number)
{
  static const unsigned int factors[] = {
    2, 1, 2, 5, 7, 1, 2, 1, 2, 1, 2, 1
  };
  unsigned int sum = 0;

  if (strlen (ssn_number) != 12)
    return false;
  for (unsigned int i = 0; i<8; i++)
  {
    unsigned char c = (unsigned char) ssn_number[i];

    if ( ('0' > c) || ('9' < c) )
      return false;
    sum += q ((c - '0') * factors[i]);
  }
  {
    unsigned char c = (unsigned char) ssn_number[8];
    unsigned int v = (c - 'A' + 1);

    if ( ('A' > c) || ('Z' < c) )
      return false;
    sum += q ((v / 10) * factors[8]);
    sum += q ((v % 10) * factors[9]);
  }
  for (unsigned int i = 9; i<11; i++)
  {
    unsigned char c = ssn_number[i];

    if ( ('0' > c) || ('9' < c) )
      return false;
    sum += q ((c - '0') * factors[i + 1]);
  }
  if (ssn_number[11] != '0' + (sum % 10))
    return false;
  {
    unsigned int month = (ssn_number[4] - '0') * 10 + (ssn_number[5] - '0');

    if ( (0 == month) ||
         (12 < month) )
      return false;
  }
  return true;
}
