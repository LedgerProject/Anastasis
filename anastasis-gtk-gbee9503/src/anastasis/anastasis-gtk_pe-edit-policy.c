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
 * @file src/anastasis/anastasis-gtk_pe-edit-policy.c
 * @brief Handle request to interactively edit policy
 * @author Christian Grothoff
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_helper.h"
#include "anastasis-gtk_pe.h"
#include <jansson.h>


/**
 * Context for the edit dialog.
 */
struct EditDialogContext;

/**
 * Information we track per line in the grid.
 */
struct LineContext
{
  /**
   * Kept in a DLL.
   */
  struct LineContext *next;

  /**
   * Kept in a DLL.
   */
  struct LineContext *prev;

  /**
   * Context this line context belongs with.
   */
  struct EditDialogContext *edc;

  /**
   * Our combo box.
   */
  GtkComboBox *cb;

  /**
   * Model for our combo box.
   */
  GtkTreeModel *model;

  /**
   * Challenge index for this line.
   */
  unsigned int cindex;

  /**
   * Is this challenge used?
   */
  bool on;
};


/**
 * Context for the edit dialog.
 */
struct EditDialogContext
{
  /**
   * Builder of the dialog.
   */
  GtkBuilder *builder;

  /**
   * Head of line contexts for this dialog
   */
  struct LineContext *lc_head;

  /**
   * Tail of line contexts for this dialog
   */
  struct LineContext *lc_tail;

  /**
   * Policy index. UINT_MAX for a new policy.
   */
  unsigned int pindex;

};


/**
 * Handle the response from the edit dialog.
 *
 * @param dialog the dialog
 * @param response_id what the user's action was
 * @param user_data a `struct EditDialogContext`
 */
void
anastasis_gtk_policy_edit_dialog_response_cb (
  GtkDialog *dialog,
  gint response_id,
  gpointer user_data)
{
  struct EditDialogContext *edc = user_data;

  if (GTK_RESPONSE_OK == response_id)
  {
    json_t *policy;

    policy = json_array ();
    GNUNET_assert (NULL != policy);
    for (struct LineContext *lctx = edc->lc_head;
         NULL != lctx;
         lctx = lctx->next)
    {
      GtkTreeIter iter;
      gchar *url;

      if (! lctx->on)
        continue;
      if (! gtk_combo_box_get_active_iter (lctx->cb,
                                           &iter))
      {
        GNUNET_break (0);
        continue;
      }
      gtk_tree_model_get (lctx->model,
                          &iter,
                          0, &url,
                          -1);
      GNUNET_assert (0 ==
                     json_array_append_new (
                       policy,
                       GNUNET_JSON_PACK (
                         GNUNET_JSON_pack_uint64 ("authentication_method",
                                                  lctx->cindex),
                         GNUNET_JSON_pack_string ("provider",
                                                  url))));
      g_free (url);
    }
    if (UINT_MAX == edc->pindex)
    {
      json_t *args;

      args = GNUNET_JSON_PACK (
        GNUNET_JSON_pack_array_steal ("policy",
                                      policy));
      AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                      "add_policy",
                                      args,
                                      &AG_action_cb,
                                      NULL);
      json_decref (args);
    }
    else
    {
      json_t *args;

      args = GNUNET_JSON_PACK (
        GNUNET_JSON_pack_uint64 ("policy_index",
                                 edc->pindex),
        GNUNET_JSON_pack_array_steal ("policy",
                                      policy));
      AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                      "update_policy",
                                      args,
                                      &AG_action_cb,
                                      NULL);
      json_decref (args);
    }
  }
  /* clean up */
  {
    struct LineContext *lctx;

    while (NULL != (lctx = edc->lc_head))
    {
      GNUNET_CONTAINER_DLL_remove (edc->lc_head,
                                   edc->lc_tail,
                                   lctx);
      GNUNET_free (lctx);
    }
  }
  gtk_widget_destroy (GTK_WIDGET (dialog));
  g_object_unref (G_OBJECT (edc->builder));
  GNUNET_free (edc);
}


/**
 * The user changed an entry in the combo boxy of an edit
 * dialog. Update the ability to confirm the selection:
 * if at least one authentication method is selected, the
 * OK button should be sensitive.
 *
 * @param widget the combo box that was changed
 * @param user_data the `struct EditDialogContext`
 */
static void
combo_box_changed_cb (
  GtkComboBox *widget,
  gpointer user_data)
{
  struct LineContext *lc = user_data;
  struct EditDialogContext *edc = lc->edc;

  /* Update our line context's on/off flag */
  {
    GtkTreeIter iter;

    if (! gtk_combo_box_get_active_iter (lc->cb,
                                         &iter))
    {
      GNUNET_break (0);
    }
    else
    {
      gchar *url;

      gtk_tree_model_get (lc->model,
                          &iter,
                          0, &url,
                          -1);
      lc->on = (0 !=
                strcmp (_ ("<off>"),
                        url));
      g_free (url);
    }
  }
  /* finally, update "OK" button sensitivity */
  {
    GtkWidget *ok_button;
    bool legal = false;

    for (struct LineContext *lctx = edc->lc_head;
         NULL != lctx;
         lctx = lctx->next)
      legal |= lctx->on;
    ok_button = GTK_WIDGET (gtk_builder_get_object (edc->builder,
                                                    "ok_button"));
    gtk_widget_set_sensitive (ok_button,
                              legal);
  }
}


/**
 * Check if the authentication provider @a ap offers
 * authentications of type @a type. If so, return true.
 *
 * @param type method to check for
 * @param ap provider to check against
 * @return true if @a ap offers @a type
 */
static bool
ap_matches (const char *type,
            json_t *ap)
{
  json_t *methods;
  size_t index;
  json_t *method;

  methods = json_object_get (ap,
                             "methods");
  GNUNET_break (NULL != methods);
  json_array_foreach (methods, index, method)
  {
    const char *offer;

    offer = json_string_value (json_object_get (method,
                                                "type"));
    if (NULL == offer)
    {
      GNUNET_break (0);
      continue;
    }
    if (0 == strcasecmp (type,
                         offer))
      return true;
  }
  return false;
}


/**
 * Create a GtkListStore containing all of the URLs
 * of Anastasis providers offering @a type as an
 * authentication method.
 *
 * @return the model
 */
static GtkTreeModel *
make_model (const char *type)
{
  GtkListStore *ls;
  json_t *aps;
  const char *url;
  json_t *ap;

  ls = gtk_list_store_new (1,
                           G_TYPE_STRING);
  gtk_list_store_insert_with_values (ls,
                                     NULL,
                                     -1,
                                     0, _ ("<off>"),
                                     -1);
  aps = json_object_get (AG_redux_state,
                         "authentication_providers");
  GNUNET_break (NULL != aps);
  json_object_foreach (aps, url, ap) {
    if (ap_matches (type,
                    ap))
    {
      gtk_list_store_insert_with_values (ls,
                                         NULL,
                                         -1,
                                         0, url,
                                         -1);
    }
  }

  return GTK_TREE_MODEL (ls);
}


/**
 * Select entry in @a cb based on the @a url.
 *
 * @param url provider to select
 * @param lctx line to update
 */
static void
select_by_url (const char *url,
               struct LineContext *lctx)
{
  GtkTreeIter iter;

  if (! gtk_tree_model_get_iter_first (lctx->model,
                                       &iter))
  {
    GNUNET_break (0);
    return;
  }
  do {
    gchar *have;

    gtk_tree_model_get (lctx->model,
                        &iter,
                        0, &have,
                        -1);
    if (0 == strcmp (have,
                     url))
    {
      gtk_combo_box_set_active_iter (lctx->cb,
                                     &iter);
      lctx->on = true;
      g_free (have);
      return;
    }
    g_free (have);
  } while (gtk_tree_model_iter_next (lctx->model,
                                     &iter));
  GNUNET_break (0); /* not found */
}


/**
 * Select entry in @a cb based on the @a methods for
 * challenge @a cindex.
 *
 * @param methods methods of policy to base selection on
 * @param lctx line to update
 */
static void
select_by_policy (const json_t *methods,
                  struct LineContext *lctx)
{
  size_t index;
  json_t *method;
  GtkTreeIter iter;

  if (! gtk_tree_model_get_iter_first (lctx->model,
                                       &iter))
  {
    GNUNET_break (0);
    return;
  }
  gtk_combo_box_set_active_iter (lctx->cb,
                                 &iter);
  json_array_foreach (methods, index, method) {
    json_int_t am = json_integer_value (json_object_get (method, \
                                                         "authentication_method"));
    const char *url;

    if (am != lctx->cindex)
      continue;
    url = json_string_value (json_object_get (method,
                                              "provider"));
    select_by_url (url,
                   lctx);
    break;
  }
}


void
AG_edit_policy (guint pindex)
{
  struct EditDialogContext *edc;
  GtkGrid *grid;
  json_t *methods = NULL;

  edc = GNUNET_new (struct EditDialogContext);
  edc->builder = GNUNET_GTK_get_new_builder ("anastasis_gtk_edit_policy.glade",
                                             edc);
  edc->pindex = pindex;
  if (NULL == edc->builder)
  {
    GNUNET_break (0);
    GNUNET_free (edc);
    return;
  }
  if (UINT_MAX != pindex)
  {
    json_t *policies;
    json_t *policy;

    policies = json_object_get (AG_redux_state,
                                "policies");
    policy = json_array_get (policies,
                             pindex);
    methods = json_object_get (policy,
                               "methods");
    GNUNET_break (NULL != methods);
  }
  grid = GTK_GRID (gtk_builder_get_object (edc->builder,
                                           "policy_grid"));
  {
    json_t *ams = json_object_get (AG_redux_state,
                                   "authentication_methods");
    json_t *am;
    size_t index;
    gint row = 1;

    json_array_foreach (ams, index, am) {
      const char *type;
      const char *instructions;
      struct GNUNET_JSON_Specification spec[] = {
        GNUNET_JSON_spec_string ("type",
                                 &type),
        GNUNET_JSON_spec_string ("instructions",
                                 &instructions),
        GNUNET_JSON_spec_end ()
      };
      char *labels;
      GtkWidget *label;
      GtkWidget *cb;
      struct LineContext *lctx;

      if (GNUNET_OK !=
          GNUNET_JSON_parse (am,
                             spec,
                             NULL, NULL))
      {
        GNUNET_break (0);
        continue;
      }
      lctx = GNUNET_new (struct LineContext);
      lctx->cindex = index;
      GNUNET_asprintf (&labels,
                       "<b>%s</b>: %s",
                       type,
                       instructions);
      label = gtk_label_new (NULL);
      gtk_label_set_markup (GTK_LABEL (label),
                            labels);
      GNUNET_free (labels);
      lctx->model = make_model (type);
      cb = gtk_combo_box_new_with_model (lctx->model);
      lctx->cb = GTK_COMBO_BOX (cb);
      {
        GtkCellRenderer *renderer;

        renderer = gtk_cell_renderer_text_new ();
        gtk_cell_layout_pack_start (GTK_CELL_LAYOUT (cb),
                                    renderer,
                                    true);
        gtk_cell_layout_add_attribute (GTK_CELL_LAYOUT (cb),
                                       renderer,
                                       "text",
                                       0);
      }
      lctx->edc = edc;
      GNUNET_CONTAINER_DLL_insert (edc->lc_head,
                                   edc->lc_tail,
                                   lctx);
      g_object_connect (cb,
                        "signal::changed",
                        &combo_box_changed_cb, lctx,
                        NULL);
      if (NULL != methods)
        select_by_policy (methods,
                          lctx);
      gtk_grid_insert_row (grid,
                           row);
      gtk_widget_show (label);
      gtk_grid_attach (grid,
                       label,
                       0,
                       row,
                       1,
                       1);
      g_object_set (cb,
                    "expand",
                    TRUE,
                    NULL);
      gtk_widget_show (cb);
      gtk_grid_attach (grid,
                       cb,
                       1,
                       row,
                       1,
                       1);
      row++;
    }
  }
  {
    GtkWidget *toplevel;
    GtkWidget *ad;
    GtkWidget *anchor;
    GtkRequisition req;

    anchor = GTK_WIDGET (GCG_get_main_window_object (
                           "anastasis_gtk_main_window_quit_button"));
    toplevel = gtk_widget_get_toplevel (anchor);
    ad = GTK_WIDGET (gtk_builder_get_object (edc->builder,
                                             "anastasis_gtk_policy_edit_dialog"));
    gtk_widget_get_preferred_size (ad,
                                   NULL,
                                   &req);
    gtk_window_resize (GTK_WINDOW (ad),
                       req.width,
                       req.height);
    gtk_window_set_transient_for (GTK_WINDOW (ad),
                                  GTK_WINDOW (toplevel));
    gtk_window_present (GTK_WINDOW (ad));
  }
}


/* end of anastasis-gtk_pe-edit-policy.c */
