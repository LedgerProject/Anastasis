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
 * @file reducer/validation_ES_DNI.c
 * @brief validation logic for Spanish Documento Nacional de Identidad numbers, and Número de Identificación de Extranjeros
 * @author Christian Grothoff
 *
 * Examples:
 * 12345678Z, 39740191D, 14741806W, X8095495R
 */
#include <string.h>
#include <stdbool.h>
#include <stdio.h>

/**
 * Function to validate a Spanish CIF number.
 *
 * @param civ number to validate
 * @return true if validation passed, else false
 */
static bool
validate_cif (const char *cif)
{
  size_t slen = strlen (cif);
  char letter = cif[0];
  const char *number = &cif[1];
  char control = cif[slen - 1];
  unsigned int sum = 0;

  if (9 != slen)
    return false;

  for (unsigned int i = 0; i < slen - 2; i++)
  {
    unsigned int n = number[i] - '0';

    if (n >= 10)
      return false;
    if (0 == (i % 2))
    {
      n *= 2;
      sum += n < 10 ? n : n - 9;
    }
    else
    {
      sum += n;
    }
  }
  sum %= 10;
  if (0 != sum)
    sum = 10 - sum;
  {
    char control_digit = "0123456789"[sum];
    char control_letter = "JABCDEFGHI"[sum];

    switch (letter)
    {
    case 'A':
    case 'B':
    case 'E':
    case 'H':
      return control == control_digit;
    case 'N':
    case 'P':
    case 'Q':
    case 'R':
    case 'S':
    case 'W':
      return control == control_letter;
    default:
      return (control == control_letter) ||
             (control == control_digit);
    }
  }
}


/**
 * Function to validate a Spanish DNI number.
 *
 * See https://www.ordenacionjuego.es/en/calculo-digito-control
 *
 * @param dni_number number to validate (input)
 * @return true if validation passed, else false
 */
bool
ES_DNI_check (const char *dni_number)
{
  const char map[] = "TRWAGMYFPDXBNJZSQVHLCKE";
  unsigned int num;
  char chksum;
  unsigned int fact;
  char dummy;

  if (strlen (dni_number) < 8)
    return false;
  switch (dni_number[0])
  {
  case 'A':
  case 'B':
  case 'C':
  case 'D':
  case 'E':
  case 'F':
  case 'G':
  case 'H':
  case 'I':
  case 'J':
  case 'K':
  case 'L':
  case 'N':
  case 'O':
  case 'P':
  case 'Q':
  case 'R':
  case 'S':
  case 'T':
  case 'U':
  case 'V':
  case 'W':
    /* CIF: [A-W]\d{7}[0-9A-J] */
    /* CIF is for companies, we only take those
       of individuals here! */
    return false; /* CIV is not allowed! */
  case 'M':
    /* special NIE, with CIF validation (?),
       but for individuals, see
       https://www.strongabogados.com/tax-id-spain.php */
    return validate_cif (dni_number);
  case 'X':
  case 'Y':
  case 'Z':
    /* NIE */
    fact = dni_number[0] - 'X';
    /* 7 or 8 digits */
    if (2 == sscanf (&dni_number[1],
                     "%8u%c%c",
                     &num,
                     &chksum,
                     &dummy))
    {
      num += fact * 100000000;
    }
    else if (2 == sscanf (&dni_number[1],
                          "%7u%c%c",
                          &num,
                          &chksum,
                          &dummy))
    {
      num += fact * 10000000;
    }
    else
    {
      return false;
    }
    break;
  default:
    fact = 0;
    /* DNI */
    if (2 != sscanf (dni_number,
                     "%8u%c%c",
                     &num,
                     &chksum,
                     &dummy))
      return false;
    break;
  }
  if (map[num % 23] != chksum)
    return false;
  return true;
}
