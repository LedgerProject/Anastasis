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
 * @file reducer/validation_CH_AHV.c
 * @brief anastasis reducer api
 * @author Christian Grothoff
 * @author Dominik Meister
 * @author Dennis Neufeld
 */
#include <string.h>
#include <stdbool.h>

/**
 * Function to validate a Swiss AHV number.
 *
 * @param ahv_number ahv number to validate (input)
 * @return true if validation passed, else false
 */
bool
CH_AHV_check (const char *ahv_number)
{
  unsigned int checknum;
  unsigned int next_ten;
  const char *pos = &ahv_number[strlen (ahv_number) - 1];
  bool phase = true;
  unsigned int calculation = 0;

  checknum = *pos - 48;
  while (pos > ahv_number)
  {
    pos--;
    if ('.' == *pos)
      continue;
    if (phase)
      calculation += ((*pos - 48) * 3);
    else
      calculation += *pos - 48;
    phase = ! phase;
  }
  /* round up to the next ten */
  next_ten = ((calculation + 9) / 10) * 10;
  calculation = next_ten - calculation;
  return (checknum == calculation);
}
