/*
  This file is part of Anastasis
  Copyright (C) 2021 Anastasis SARL

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
 * @file reducer/validation_IT_CF.c
 * @brief validation of Italian Code Fiscales
 * @author Christian Grothoff
 */
#include <string.h>
#include <stdbool.h>
#include <stdio.h>
#include <math.h>

struct MapEntry
{
  char in;
  unsigned int out;
};


static const struct MapEntry odd[] = {
  { '0',  1},
  { '9',  21},
  { 'I',  19 },
  { 'R',  8},
  { '1',  0},
  { 'A',  1},
  { 'J',  21},
  { 'S',  12},
  {'2',   5},
  {'B',   0},
  {'K',   2},
  {'T',   14},
  {'3',   7},
  {'C',   5},
  {'L',   4},
  {'U',   16},
  {'4',   9},
  {'D',   7},
  {'M',   18},
  {'V',   10},
  {'5',   13},
  {'E',   9},
  {'N',   20},
  {'W',   22},
  {'6',   15},
  {'F',   13},
  {'O',   11},
  {'X',   25},
  {'7',   17},
  {'G',   15},
  {'P',   3},
  {'Y',   24},
  {'8',   19},
  {'H',   17},
  {'Q',   6},
  {'Z',   23},
  {'\0', 0}
};


static const struct MapEntry even[] = {
  { '0',  0},
  { '1',   1},
  { '2',  2  },
  { '3',  3},
  { '4',  4},
  { '5',  5},
  { '6',  6 },
  { '7',  7 },
  {'8',   8},
  {'9',   9},
  {'A',   0},
  {'B',   1},
  {'C',   2},
  {'D',   3},
  {'E',   4},
  {'F',   5},
  {'G',   6},
  {'H',   7},
  {'I',   8},
  {'J',   9},
  {'K',   10},
  {'L',   11},
  {'M',   12},
  {'N',   13},
  {'O',   14},
  {'P',   15},
  {'Q',   16},
  {'R',   17},
  {'S',   18},
  {'T',   19},
  {'U',   20},
  {'V',   21},
  {'W',   22},
  {'X',   23},
  {'Y',   24},
  {'Z',   25},
  {'\0', 0}
};


static const struct MapEntry rem[] = {
  {'A',   0},
  {'B',   1},
  {'C',   2},
  {'D',   3},
  {'E',   4},
  {'F',   5},
  {'G',   6},
  {'H',   7},
  {'I',   8},
  {'J',   9},
  {'K',   10},
  {'L',   11},
  {'M',   12},
  {'N',   13},
  {'O',   14},
  {'P',   15},
  {'Q',   16},
  {'R',   17},
  {'S',   18},
  {'T',   19},
  {'U',   20},
  {'V',   21},
  {'W',   22},
  {'X',   23},
  {'Y',   24},
  {'Z',   25},
  {'\0', 0}
};


/**
 * Lookup @a in in @a map. Set @a fail to true if @a in is not found.
 *
 * @param map character map to search
 * @param in character to search for
 * @param[out] fail set to true on error
 * @return map value, 0 on error
 */
static unsigned int
lookup (const struct MapEntry *map,
        char in,
        bool *fail)
{
  for (unsigned int i = 0; '\0' != map[i].in; i++)
    if (in == map[i].in)
      return map[i].out;
  *fail = true;
  return 0;
}


/**
 * Function to validate an italian code fiscale number.
 * See https://en.wikipedia.org/wiki/Italian_fiscal_code
 *
 * @param cf_number square number to validate (input)
 * @return true if @a cf_number is a valid, else false
 */
bool
IT_CF_check (const char *cf_number)
{
  unsigned int sum = 0;
  bool fail = false;

  if (strlen (cf_number) != 16)
    return false;
  for (unsigned int i = 0; i<15; i += 2)
    sum += lookup (odd,
                   cf_number[i],
                   &fail);
  for (unsigned int i = 1; i<15; i += 2)
    sum += lookup (even,
                   cf_number[i],
                   &fail);
  sum %= 26;
  if (sum != lookup (rem,
                     cf_number[15],
                     &fail))
    return false;
  if (fail)
    return false;
  return true;
}
