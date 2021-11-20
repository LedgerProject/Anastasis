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
 * @file reducer/validation_DE_TIN.c
 * @brief validation logic for German taxpayer identification numbers
 * @author Christian Grothoff
 */
#include <string.h>
#include <stdbool.h>


/**
 * Function to validate a German Taxpayer identification number.
 *
 * See https://de.wikipedia.org/wiki/Steuerliche_Identifikationsnummer
 * for the structure!
 *
 * @param tin_number tax number to validate (input)
 * @return true if validation passed, else false
 */
bool
DE_TIN_check (const char *tin_number)
{
  unsigned int csum;
  unsigned int product = 10;

  if (strlen (tin_number) != 11)
    return false;
  for (unsigned int i = 0; i<10; i++)
  {
    unsigned int sum = ((tin_number[i] - '0') + product) % 10;
    if (0 == sum)
      sum = 10;
    product = sum * 2 % 11;
  }
  csum = 11 - product;
  if (10 == csum)
    csum = 0;
  if (tin_number[10] != '0' + csum)
    return false;
  if (tin_number[0] == '0')
    return false;
  return true;
}
