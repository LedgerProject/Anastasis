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
 * @file src/anastasis/anastasis-gtk_handle-country-activated.c
 * @brief
 * @author Christian Grothoff
 * @author Dennis Neufeld
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_helper.h"
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_handle-main-window-forward-clicked.h"
#include <jansson.h>


/**
 * Callback invoked if a country is selected.
 *
 * @param treeselection selection object
 * @param user_data NULL
 */
void
anastasis_gtk_country_selection_changed_cb (GtkTreeSelection *treeselection,
                                            gpointer user_data)
{
  GtkTreeSelection *currency_selection;
  GtkTreeModel *currency_model;
  GtkTreeModel *model;
  GtkTreeIter iter;
  char *scode;

  (void) user_data;
  if (! gtk_tree_selection_get_selected (treeselection,
                                         &model,
                                         &iter))
  {
    AG_insensitive ("anastasis_gtk_main_window_forward_button");
    return;
  }
  AG_sensitive ("anastasis_gtk_main_window_forward_button");
  gtk_tree_model_get (model,
                      &iter,
                      AG_CCMC_COUNTRY_CODE,
                      &scode,
                      -1);
  /* select all currencies matching current country */
  currency_selection = GTK_TREE_SELECTION (
    GCG_get_main_window_object ("anastasis_gtk_currency_selection"));
  gtk_tree_selection_unselect_all (currency_selection);
  currency_model = GTK_TREE_MODEL (
    GCG_get_main_window_object ("currency_liststore"));
  {
    json_t *countries;
    json_t *country;
    size_t index;

    countries = json_object_get (AG_redux_state,
                                 "countries");
    json_array_foreach (countries, index, country)
    {
      const char *code;
      const char *currency;

      code = json_string_value (json_object_get (country,
                                                 "code"));
      GNUNET_assert (NULL != code);
      if (0 != strcmp (code,
                       scode))
        continue;
      currency = json_string_value (json_object_get (country,
                                                     "currency"));
      GNUNET_assert (NULL != currency);
      {
        GtkTreeIter citer;
        char *pcur;

        if (gtk_tree_model_get_iter_first (currency_model,
                                           &citer))
          do {
            gtk_tree_model_get (currency_model,
                                &citer,
                                AG_CMC_CURRENCY_NAME,
                                &pcur,
                                -1);
            if (0 == strcasecmp (pcur,
                                 currency))
            {
              gtk_tree_selection_select_iter (currency_selection,
                                              &citer);
            }
            g_free (pcur);
          } while (gtk_tree_model_iter_next (currency_model,
                                             &citer));
      }
    }
  }
  g_free (scode);
}
