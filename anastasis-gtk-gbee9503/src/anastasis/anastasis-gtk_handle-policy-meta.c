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
 * @file src/anastasis/anastasis-gtk_handle-policy-meta.c
 * @brief Handle right-click context menu in policy review
 * @author Christian Grothoff
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_helper.h"
#include "anastasis-gtk_pe.h"
#include <jansson.h>


/**
 * Context for menu callbacks.
 */
struct MenuContext
{
  /**
   * Reference to the row that the user right-clicked.
   */
  GtkTreeRowReference *rr;

};


/**
 * The user selected the 'add policy' menu.
 *
 * @param menuitem the selected menu
 * @param user_data a `struct MenuContext`
 */
static void
add_from_ctx_menu (GtkMenuItem *menuitem,
                   gpointer user_data)
{
  (void) user_data;
  (void) menuitem;
  AG_add_policy ();
}


/**
 * The user selected the 'delete challenge' menu item.
 *
 * @param menuitem the selected menu
 * @param user_data a `struct MenuContext`
 */
static void
delete_challenge_from_ctx_menu (GtkMenuItem *menuitem,
                                gpointer user_data)
{
  struct MenuContext *ctx = user_data;
  GtkTreePath *path = gtk_tree_row_reference_get_path (ctx->rr);
  GtkTreeModel *tm = gtk_tree_row_reference_get_model (ctx->rr);
  GtkTreeIter iter;
  guint pindex;
  gboolean is_challenge;
  guint mindex;

  if (NULL == path)
    return;
  if (! gtk_tree_model_get_iter (tm,
                                 &iter,
                                 path))
  {
    GNUNET_break (0);
    return;
  }
  gtk_tree_path_free (path);
  gtk_tree_model_get (tm,
                      &iter,
                      AG_PRMC_POLICY_INDEX,
                      &pindex,
                      AG_PRMC_IS_CHALLENGE,
                      &is_challenge,
                      AG_PRMC_METHOD_INDEX,
                      &mindex,
                      -1);
  if (! is_challenge)
  {
    GNUNET_break (0);
    return;
  }
  AG_delete_challenge (pindex,
                       mindex);
}


/**
 * The user selected the 'delete policy' menu item.
 *
 * @param menuitem the selected menu
 * @param user_data a `struct MenuContext`
 */
static void
delete_policy_from_ctx_menu (GtkMenuItem *menuitem,
                             gpointer user_data)
{
  struct MenuContext *ctx = user_data;
  GtkTreePath *path = gtk_tree_row_reference_get_path (ctx->rr);
  GtkTreeModel *tm = gtk_tree_row_reference_get_model (ctx->rr);
  GtkTreeIter iter;
  guint pindex;

  if (NULL == path)
    return;
  if (! gtk_tree_model_get_iter (tm,
                                 &iter,
                                 path))
  {
    GNUNET_break (0);
    return;
  }
  gtk_tree_path_free (path);
  gtk_tree_model_get (tm,
                      &iter,
                      AG_PRMC_POLICY_INDEX,
                      &pindex,
                      -1);
  AG_delete_policy (pindex);
}


/**
 * The user selected the 'edit policy' menu.
 *
 * @param menuitem the selected menu
 * @param user_data a `struct MenuContext`
 */
static void
edit_from_ctx_menu (GtkMenuItem *menuitem,
                    gpointer user_data)
{
  struct MenuContext *ctx = user_data;
  GtkTreePath *path = gtk_tree_row_reference_get_path (ctx->rr);
  GtkTreeModel *tm = gtk_tree_row_reference_get_model (ctx->rr);
  GtkTreeIter iter;
  guint pindex;

  if (NULL == path)
    return;
  if (! gtk_tree_model_get_iter (tm,
                                 &iter,
                                 path))
  {
    GNUNET_break (0);
    return;
  }
  gtk_tree_path_free (path);
  gtk_tree_model_get (tm,
                      &iter,
                      AG_PRMC_POLICY_INDEX,
                      &pindex,
                      -1);
  AG_edit_policy (pindex);
}


/**
 * An item was selected from the context menu; destroy the menu shell.
 *
 * @param menushell menu to destroy
 * @param user_data the 'struct MenuContext' of the menu
 */
static void
context_popup_selection_done (GtkMenuShell *menushell,
                              gpointer user_data)
{
  struct MenuContext *ctx = user_data;

  gtk_widget_destroy (GTK_WIDGET (menushell));
  if (NULL != ctx->rr)
  {
    gtk_tree_row_reference_free (ctx->rr);
    ctx->rr = NULL;
  }
  GNUNET_free (ctx);
}


/**
 * Context menu was requested for the policy.  Compute which menu
 * items are applicable and display an appropriate menu.
 *
 * @param tm tree model underlying the tree view where the event happened
 * @param iter location in the tree model selected at the time
 * @return NULL if no menu could be created,
 *         otherwise the a pop-up menu
 */
static GtkMenu *
get_popup (GtkTreeModel *tm,
           GtkTreeIter *iter)
{
  GtkMenu *menu;
  struct MenuContext *ctx;

  ctx = GNUNET_new (struct MenuContext);
  menu = GTK_MENU (gtk_menu_new ());
  if (NULL != iter)
  {
    gboolean is_challenge;

    {
      GtkTreePath *path;

      path = gtk_tree_model_get_path (tm,
                                      iter);
      ctx->rr = gtk_tree_row_reference_new (tm,
                                            path);
      gtk_tree_path_free (path);
    }
    gtk_tree_model_get (tm,
                        iter,
                        AG_PRMC_IS_CHALLENGE,
                        &is_challenge,
                        -1);
    if (! is_challenge)
    {
      GtkWidget *child;

      /* only show 'edit' entry for lines that
         are for an entire policy */
      child = gtk_menu_item_new_with_label (_ ("_Edit policy..."));
      g_signal_connect (child,
                        "activate",
                        G_CALLBACK (&edit_from_ctx_menu),
                        ctx);
      gtk_label_set_use_underline (GTK_LABEL (
                                     gtk_bin_get_child (GTK_BIN (child))),
                                   TRUE);
      gtk_widget_show (child);
      gtk_menu_shell_append (GTK_MENU_SHELL (menu),
                             child);
    }
    {
      GtkWidget *child;
      const char *label;

      if (is_challenge)
        label = _ ("Delete challenge");
      else
        label = _ ("Delete policy");
      child = gtk_menu_item_new_with_label (label);
      g_signal_connect (child,
                        "activate",
                        G_CALLBACK (is_challenge
                                    ? &delete_challenge_from_ctx_menu
                                    : &delete_policy_from_ctx_menu),
                        ctx);
      gtk_label_set_use_underline (GTK_LABEL (
                                     gtk_bin_get_child (GTK_BIN (child))),
                                   TRUE);
      gtk_widget_show (child);
      gtk_menu_shell_append (GTK_MENU_SHELL (menu), child);
    }

    {
      GtkWidget *child;

      /* Insert a separator */
      child = gtk_separator_menu_item_new ();
      gtk_widget_show (child);
      gtk_menu_shell_append (GTK_MENU_SHELL (menu), child);
    }
  }

  {
    GtkWidget *child;

    /* only show 'edit' entry for lines that
       are for an entire policy */
    child = gtk_menu_item_new_with_label (_ ("_Add policy..."));
    g_signal_connect (child,
                      "activate",
                      G_CALLBACK (&add_from_ctx_menu),
                      ctx);
    gtk_label_set_use_underline (GTK_LABEL (
                                   gtk_bin_get_child (GTK_BIN (child))),
                                 TRUE);
    gtk_widget_show (child);
    gtk_menu_shell_append (GTK_MENU_SHELL (menu),
                           child);
  }

  g_signal_connect (menu,
                    "selection-done",
                    G_CALLBACK (&context_popup_selection_done),
                    ctx);
  return menu;
}


/**
 * We got a button-click on the policy treeview.  If it was a
 * right-click, display the context menu.
 *
 * @param widget the GtkTreeView with the search result list
 * @param event the event, we only care about button events
 * @param user_data NULL
 * @return FALSE to propagate the event further,
 *         TRUE to stop the propagation
 */
gboolean
anastasis_gtk_review_policy_treeview_button_press_event_cb (GtkWidget *widget,
                                                            GdkEvent *event,
                                                            gpointer user_data)
{
  GtkTreeView *tv = GTK_TREE_VIEW (widget);
  GdkEventButton *event_button = (GdkEventButton *) event;
  GtkTreeModel *tm;
  GtkTreePath *path;
  GtkTreeIter iter;
  GtkMenu *menu;

  if ((GDK_BUTTON_PRESS != event->type) ||
      (3 != event_button->button))
    return FALSE; /* not a right-click */
  if (! gtk_tree_view_get_path_at_pos (tv,
                                       event_button->x,
                                       event_button->y,
                                       &path,
                                       NULL,
                                       NULL,
                                       NULL))
  {
    menu = get_popup (NULL,
                      NULL);
  }
  else
  {
    tm = gtk_tree_view_get_model (tv);
    if (! gtk_tree_model_get_iter (tm,
                                   &iter,
                                   path))
    {
      /* not sure how we got a path but no iter... */
      GNUNET_break (0);
      return FALSE;
    }
    gtk_tree_path_free (path);

    menu = get_popup (tm,
                      &iter);
  }
  if (NULL == menu)
  {
    GNUNET_break (0);
    return FALSE;
  }
  gtk_menu_popup_at_pointer (menu,
                             event);
  return FALSE;
}
