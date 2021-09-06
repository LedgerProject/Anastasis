/*
     This file is part of anastasis-gtk.
     Copyright (C) 2020, 2021 Anastasis SARL

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
 * @file src/anastasis/anastasis-gtk_handle-main-window-forward-clicked.c
 * @brief
 * @author Christian Grothoff
 * @author Dennis Neufeld
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_attributes.h"
#include "anastasis-gtk_dispatch.h"
#include "anastasis-gtk_helper.h"
#include <jansson.h>


/**
 * Function called on each selected currency. Appends
 * the currency to the JSON array.
 *
 * @param model the model of the currencies
 * @param path a path (unused)
 * @param iter selected currency position
 * @param data a `json *` with the JSON array to expand
 */
static void
append_currency (GtkTreeModel *model,
                 GtkTreePath *path,
                 GtkTreeIter *iter,
                 gpointer data)
{
  json_t *currencies = data;
  gchar *currency;

  (void) path;
  gtk_tree_model_get (model,
                      iter,
                      AG_CMC_CURRENCY_NAME,
                      &currency,
                      -1);
  GNUNET_break (0 ==
                json_array_append_new (currencies,
                                       json_string (currency)));
  g_free (currency);
}


/**
 * The user selected the 'forward' button. Move on with the
 * country and currency selection.
 */
static void
forward_country_selecting (void)
{
  GtkTreeIter iter;
  GtkTreeView *tv;
  GtkTreeModel *model;
  GtkTreeSelection *sel;
  gchar *country_name;
  gchar *country_code;
  json_t *arguments;
  json_t *currencies;

  tv = GTK_TREE_VIEW (GCG_get_main_window_object (
                        "anastasis_gtk_country_treeview"));
  sel = gtk_tree_view_get_selection (tv);
  if (! gtk_tree_selection_get_selected (sel,
                                         &model,
                                         &iter))
  {
    GNUNET_break (0);
    return;
  }
  currencies = json_array ();
  GNUNET_assert (NULL != currencies);
  gtk_tree_selection_selected_foreach (
    GTK_TREE_SELECTION (
      GCG_get_main_window_object ("anastasis_gtk_currency_selection")),
    &append_currency,
    currencies);
  gtk_tree_model_get (model,
                      &iter,
                      AG_CCMC_COUNTRY_NAME, &country_name,
                      AG_CCMC_COUNTRY_CODE, &country_code,
                      -1);
  arguments = GNUNET_JSON_PACK (
    GNUNET_JSON_pack_string ("country",
                             country_name),
    GNUNET_JSON_pack_string ("country_code",
                             country_code),
    GNUNET_JSON_pack_array_steal ("currencies",
                                  currencies));
  g_free (country_name);
  g_free (country_code);
  AG_freeze ();
  AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                  "select_country",
                                  arguments,
                                  &AG_action_cb,
                                  NULL);
  json_decref (arguments);
}


void
AG_forward_user_attributes_collecting (void)
{
  json_t *args;

  AG_freeze ();
  args = AG_collect_attributes (false);
  GNUNET_assert (NULL != args);
  AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                  "enter_user_attributes",
                                  args,
                                  &AG_action_cb,
                                  NULL);
  json_decref (args);
}


static void
forward_authentications_editing (void)
{
  AG_freeze ();
  AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                  "next",
                                  NULL,
                                  &AG_action_cb,
                                  NULL);
}


static void
forward_policies_reviewing (void)
{
  AG_freeze ();
  AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                  "next",
                                  NULL,
                                  &AG_action_cb,
                                  NULL);
}


static void
forward_secret_editing (void)
{
  AG_freeze ();
  AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                  "next",
                                  NULL,
                                  &AG_action_cb,
                                  NULL);
}


static void
forward_secret_selecting (void)
{
  AG_freeze ();
  AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                  "next",
                                  NULL,
                                  &AG_action_cb,
                                  NULL);
}


/**
 * Callback invoked if the the "forward"-button is clicked.
 *
 * @param object
 * @param user_data unused
 */
void
anastasis_gtk_main_window_forward_clicked (GObject *object,
                                           gpointer user_data)
{
  struct DispatchItem actions[] = {
    { .state = "COUNTRY_SELECTING",
      .action = &forward_country_selecting },
    { .state = "USER_ATTRIBUTES_COLLECTING",
      .action = &AG_forward_user_attributes_collecting },
    { .state = "AUTHENTICATIONS_EDITING",
      .action = &forward_authentications_editing },
    { .state = "POLICIES_REVIEWING",
      .action = &forward_policies_reviewing },
    { .state = "SECRET_EDITING",
      .action = &forward_secret_editing },
    { .state = "SECRET_SELECTING",
      .action = &forward_secret_selecting },
    { .state = NULL,
      .action = NULL }
  };

  AG_dispatch (actions);
}
