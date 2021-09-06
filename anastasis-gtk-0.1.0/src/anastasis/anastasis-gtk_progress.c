/*
     This file is part of anastasis-gtk.
     Copyright (C) 2021 Anastasis SARL

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
 * @file src/anastasis/anastasis-gtk_progress.c
 * @brief Functions dealing with the tree views used to show the user where we are in the process
 * @author Christian Grothoff
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_helper.h"
#include <gdk-pixbuf/gdk-pixbuf.h>


/**
 * Ensure signals are ignored where the user
 * clicks in the widget.
 */
gboolean
anastasis_gtk_backup_progress_treeview_button_press_event_cb (GtkWidget *widget,
                                                              GdkEvent  *event,
                                                              gpointer user_data)
{
  return TRUE;
}


/**
 * Ensure signals are ignored where the user
 * clicks in the widget.
 */
gboolean
anastasis_gtk_recovery_progress_treeview_button_press_event_cb (
  GtkWidget *widget,
  GdkEvent  *event,
  gpointer
  user_data)
{
  return TRUE;
}


/**
 * Function to validate an input by regular expression ("validation-regex").
 *
 * @param input text to validate
 * @param regexp regular expression to validate form
 * @return true if validation passed, else false
 */
static bool
validate_regex (const char *input,
                const char *regexp)
{
  regex_t regex;

  if (0 != regcomp (&regex,
                    regexp,
                    REG_EXTENDED))
  {
    GNUNET_break (0);
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Failed to compile regular expression `%s'.",
                regexp);
    return true;
  }
  /* check if input has correct form */
  if (0 != regexec (&regex,
                    input,
                    0,
                    NULL,
                    0))
  {
    regfree (&regex);
    return false;
  }
  regfree (&regex);
  return true;
}


void
AG_progress_update (void)
{
  GtkTreeSelection *ts;
  GtkTreeModel *tm;
  GtkTreeIter iter;
  const char *state;

  state = json_string_value (json_object_get (AG_redux_state,
                                              "backup_state"));
  if (NULL == state)
  {
    state = json_string_value (json_object_get (AG_redux_state,
                                                "recovery_state"));
    if (NULL == state)
    {
      GNUNET_break (0);
      return;
    }
    ts = GTK_TREE_SELECTION (GCG_get_main_window_object (
                               "anastasis_gtk_recovery_progress_tree_selection"));
  }
  else
  {
    ts = GTK_TREE_SELECTION (GCG_get_main_window_object (
                               "anastasis_gtk_backup_progress_tree_selection"));
  }
  gtk_tree_selection_get_selected (ts,
                                   &tm,
                                   &iter);
  if (! gtk_tree_model_get_iter_first (tm,
                                       &iter))
  {
    GNUNET_break (0);
    return;
  }
  do {
    char *regex;

    gtk_tree_model_get (tm,
                        &iter,
                        AG_PRGMC_REGEX, &regex,
                        -1);
    if (validate_regex (state,
                        regex))
    {
      g_free (regex);
      gtk_tree_selection_select_iter (ts,
                                      &iter);
      return;
    }
    g_free (regex);
  } while (gtk_tree_model_iter_next (tm,
                                     &iter));
  GNUNET_break (0);
  return;
}
