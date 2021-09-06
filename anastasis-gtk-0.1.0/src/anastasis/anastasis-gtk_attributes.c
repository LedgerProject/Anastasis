/*
     This file is part of anastasis-gtk.
     Copyright (C) 2020 Anastasis SARL

     Anastasis is free software; you can redistribute it and/or modify
     it under the terms of the GNU General Public License as published
     by the Free Software Foundation; either version 3, or (at your
     option) any later version.

     Anastasis is distributed in the hope that it will be useful, but
     WITHOUT ANY WARRANTY; without even the implied warranty of
     MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
     General Public License for more details.

     You should have received a copy of the GNU General Public License
     along with Anastasis; see the file COPYING.  If not, write to the
     Free Software Foundation, Inc., 51 Franklin Street, Fifth Floor,
     Boston, MA 02110-1301, USA.
*/
/**
 * @file src/anastasis/anastasis-gtk_handle-identity-changed.c
 * @brief
 * @author Christian Grothoff
 * @author Dennis Neufeld
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_helper.h"
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_attributes.h"


static json_t *
extract_entry (GtkWidget *entry)
{
  const gchar *txt;

  txt = gtk_entry_get_text (GTK_ENTRY (entry));
  if ( (NULL ==  txt) ||
       (0 == strlen (txt)) )
    return NULL;
  return json_string (txt);
}


static json_t *
extract_cal (GtkWidget *cal)
{
  guint day = 0;
  guint month = 0;
  guint year = 0;
  char txt[12];

  gtk_calendar_get_date (GTK_CALENDAR (cal),
                         &year,
                         &month,
                         &day);
  if (! (day && month && day))
    return NULL;
  GNUNET_snprintf (txt,
                   sizeof (txt),
                   "%04u-%02u-%02u",
                   (unsigned int) year,
                   (unsigned int) month,
                   (unsigned int) day);
  return json_string (txt);
}


json_t *
AG_collect_attributes (bool partial)
{
  static struct
  {
    const char *type;
    json_t * (*extract)(GtkWidget *w);
  } e_map [] = {
    { .type = "string",
      .extract = &extract_entry },
    { .type = "date",
      .extract = &extract_cal },
    { .type = NULL,
      .extract = NULL }
  };
  const json_t *id_attributes;
  json_t *result;
  size_t index;
  json_t *id_attr;

  id_attributes = json_object_get (AG_redux_state,
                                   "required_attributes");
  GNUNET_assert (NULL != id_attributes);
  result = json_object ();
  GNUNET_assert (NULL != result);
  json_array_foreach (id_attributes, index, id_attr)
  {
    json_t *val = NULL;
    GtkWidget *w;
    const char *attr_name;
    const char *attr_type;
    const char *attr_uuid;
    int optional = false;
    struct GNUNET_JSON_Specification spec[] = {
      GNUNET_JSON_spec_mark_optional (
        GNUNET_JSON_spec_boolean ("optional",
                                  &optional)),
      GNUNET_JSON_spec_string ("type",
                               &attr_type),
      GNUNET_JSON_spec_string ("name",
                               &attr_name),
      GNUNET_JSON_spec_string ("uuid",
                               &attr_uuid),
      GNUNET_JSON_spec_end ()
    };
    struct GNUNET_HashCode uh;

    GNUNET_assert (GNUNET_OK ==
                   GNUNET_JSON_parse (id_attr,
                                      spec,
                                      NULL, NULL));
    GNUNET_CRYPTO_hash (attr_uuid,
                        strlen (attr_uuid),
                        &uh);
    w = GNUNET_CONTAINER_multihashmap_get (AG_entry_attributes,
                                           &uh);
    if (NULL == w)
    {
      if (partial)
        continue;
      json_decref (result);
      return NULL;
    }
    for (unsigned int i = 0; NULL != e_map[i].type; i++)
    {
      if (0 != strcmp (e_map[i].type,
                       attr_type))
        continue;
      val = e_map[i].extract (w);
      break;
    }
    if (NULL == val)
    {
      if (partial)
        continue;
      if (optional)
        continue;
      json_decref (result);
      return NULL;
    }
    GNUNET_assert (0 ==
                   json_object_set_new (result,
                                        attr_name,
                                        val));
  }
  return GNUNET_JSON_PACK (
    GNUNET_JSON_pack_object_steal ("identity_attributes",
                                   result));
}


/**
 * Import string value into a GtkEntry.
 *
 * @param w should be a GtkEntry
 * @param value should be a string value
 */
static void
import_entry (GtkWidget *w,
              const json_t *value)
{
  GNUNET_break (json_is_string (value));
  gtk_entry_set_text (GTK_ENTRY (w),
                      json_string_value (value));
}


/**
 * Import date value into a GtkCalendar.
 *
 * @param w should be a GtkCalendar
 * @param value should be a date value
 */
static void
import_cal (GtkWidget *w,
            const json_t *value)
{
  const char *s;
  guint day;
  guint month;
  guint year;
  char dummy;

  s = json_string_value (value);
  if (NULL == s)
  {
    GNUNET_break (0);
    return;
  }
  if (3 !=
      sscanf (s,
              "%04u-%02u-%02u%c",
              &year,
              &month,
              &day,
              &dummy))
  {
    GNUNET_break (0);
    return;
  }
  gtk_calendar_select_day (GTK_CALENDAR (w),
                           day);
  gtk_calendar_select_month (GTK_CALENDAR (w),
                             month,
                             year);
}


void
AG_import_attribute_data (GtkWidget *w,
                          const char *type,
                          const json_t *value)
{
  static struct
  {
    const char *type;
    void (*import)(GtkWidget *w,
                   const json_t *value);
  } i_map [] = {
    { .type = "string",
      .import = &import_entry },
    { .type = "date",
      .import = &import_cal },
    { .type = NULL,
      .import = NULL }
  };

  for (unsigned int i = 0; NULL != i_map[i].type; i++)
  {
    if (0 != strcmp (i_map[i].type,
                     type))
      continue;
    i_map[i].import (w,
                     value);
    return;
  }

}
