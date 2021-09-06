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
 * @file src/anastasis/anastasis-gtk_helper.c
 * @brief Helper functions of anastasis-gtk
 * @author Christian Grothoff
 * @author Dennis Neufeld
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_helper.h"
#include <jansson.h>


/**
 * true if we are currently showing an error message.
 */
bool AG_have_error;


void
AG_thaw ()
{
  AG_error_clear ();
  AG_sensitive ("anastasis_gtk_main_window");
  GNUNET_assert (NULL == AG_ra);
}


void
AG_freeze ()
{
  AG_insensitive ("anastasis_gtk_main_window");
  AG_stop_long_action ();
  GNUNET_assert (NULL == AG_ra);
}


void
AG_sensitive (const char *name)
{
  GtkWidget *w;

  w = GTK_WIDGET (GCG_get_main_window_object (name));
  if (NULL == w)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Widget `%s' not found, cannot make it sensitive!\n",
                name);
    return;
  }
  gtk_widget_set_sensitive (w,
                            true);
}


void
AG_focus (const char *name)
{
  GtkWidget *w;

  w = GTK_WIDGET (GCG_get_main_window_object (name));
  if (NULL == w)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Widget `%s' not found, cannot focus on it!\n",
                name);
    return;
  }
  gtk_widget_grab_focus (w);
}


void
AG_insensitive (const char *name)
{
  GtkWidget *w;

  w = GTK_WIDGET (GCG_get_main_window_object (name));
  if (NULL == w)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Widget `%s' not found, cannot make it sensitive!\n",
                name);
    return;
  }
  gtk_widget_set_sensitive (w,
                            false);
}


void
AG_hide (const char *name)
{
  GtkWidget *w;

  w = GTK_WIDGET (GCG_get_main_window_object (name));
  if (NULL == w)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Widget `%s' not found, cannot hide it!\n",
                name);
    return;
  }
  gtk_widget_hide (w);
}


void
AG_show (const char *name)
{
  GtkWidget *w;

  w = GTK_WIDGET (GCG_get_main_window_object (name));
  if (NULL == w)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Widget `%s' not found, cannot show it!\n",
                name);
    return;
  }
  gtk_widget_show (w);
}


void
AG_insensitive_children (const char *name)
{
  GList *children;

  children = gtk_container_get_children (GTK_CONTAINER (
                                           GCG_get_main_window_object (name)));
  for (GList *iter = children; iter != NULL; iter = g_list_next (iter))
    gtk_widget_set_sensitive (GTK_WIDGET (iter->data),
                              false);
  g_list_free (children);
}


void
AG_hide_children (const char *name)
{
  GList *children;

  children = gtk_container_get_children (GTK_CONTAINER (
                                           GCG_get_main_window_object (name)));
  for (GList *iter = children; iter != NULL; iter = g_list_next (iter))
    gtk_widget_hide (GTK_WIDGET (iter->data));
  g_list_free (children);
}


void
AG_show_children (const char *name)
{
  GList *children;

  children = gtk_container_get_children (GTK_CONTAINER (
                                           GCG_get_main_window_object (name)));
  for (GList *iter = children; iter != NULL; iter = g_list_next (iter))
    gtk_widget_show (GTK_WIDGET (iter->data));
  g_list_free (children);

}


void
AG_hide_all_frames (void)
{
  AG_hide ("anastasis_gtk_start_frame");
  AG_hide_children ("anastasis_gtk_super_vbox");
  AG_hide_children ("anastasis_gtk_illustration_vbox");
  if (AG_have_error)
    AG_show ("anastasis_gtk_error_label");
}


bool
AG_check_state (json_t *state,
                const char *expected_state)
{
  const char *state_name = json_string_value (json_object_get (state,
                                                               "backup_state"));
  if (NULL == state_name)
    state_name = json_string_value (json_object_get (state,
                                                     "recovery_state"));
  if (NULL == state_name)
    return false;
  return (0 == strcasecmp (state_name,
                           expected_state));
}


/**
 * Get an object from the main window.
 *
 * @param name name of the object
 * @return NULL on error
 */
GObject *
GCG_get_main_window_object (const char *name)
{
  if (NULL == AG_ml)
    return NULL;
  return GNUNET_GTK_main_loop_get_object (AG_ml,
                                          name);
}


void
AG_error_clear ()
{
  AG_have_error = false;
  AG_hide ("anastasis_gtk_error_label");
}


void
AG_error (const char *format,
          ...)
{
  va_list ap;
  char *msg;
  int ret;
  GtkLabel *l;

  va_start (ap, format);
  ret = vasprintf (&msg,
                   format,
                   ap);
  va_end (ap);
  if (-1 == ret)
  {
    GNUNET_break (0);
    return;
  }
  l = GTK_LABEL (GCG_get_main_window_object ("anastasis_gtk_error_label"));
  if (NULL == l)
  {
    GNUNET_break (0);
    return;
  }
  gtk_label_set_text (l,
                      msg);
  free (msg);
  AG_have_error = true;
  gtk_widget_show (GTK_WIDGET (l));
}
