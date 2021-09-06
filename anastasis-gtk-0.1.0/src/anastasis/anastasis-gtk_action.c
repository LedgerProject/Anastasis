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
 * @file src/anastasis/anastasis-gtk_action.c
 * @brief Handle redux action results
 * @author Christian Grothoff
 * @author Dennis Neufeld
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_attributes.h"
#include "anastasis-gtk_dispatch.h"
#include "anastasis-gtk_helper.h"
#include "anastasis-gtk_handle-identity-changed.h"
#include "anastasis-gtk_progress.h"
#include <jansson.h>
#include <qrencode.h>
#include <gdk-pixbuf/gdk-pixbuf.h>


/**
 * After how long does our long-poller time out?
 */
#define LP_TIMEOUT GNUNET_TIME_relative_multiply (GNUNET_TIME_UNIT_MINUTES, 5)

/**
 * Next time we schedule the #long_task.
 */
static struct GNUNET_TIME_Absolute long_next;


/**
 * Are we currently processing an action?
 */
bool AG_in_action;

/**
 * Are we currently editing the secret?
 */
bool AG_in_secret_editing;

/**
 * Are we currently editing the secret name?
 */
bool AG_in_secret_name_editing;


#define DEBUG 0

/**
 * Prepare window for selection of the continent.
 */
static void
action_continent_selecting (void)
{
  GtkListStore *country_liststore = GTK_LIST_STORE (
    GCG_get_main_window_object ("country_liststore"));

  AG_hide_all_frames ();
  gtk_list_store_clear (country_liststore);
  {
    GtkListStore *continent_liststore;
    json_t *continents;

    continent_liststore
      = GTK_LIST_STORE (
          GCG_get_main_window_object ("continent_liststore"));
    gtk_list_store_clear (continent_liststore);
    continents = json_object_get (AG_redux_state,
                                  "continents");
    if (NULL != continents)
    {
      json_t *continent;
      size_t index;

      json_array_foreach (continents,
                          index,
                          continent)
      {
        const char *name;
        const char *name_i18n;
        struct GNUNET_JSON_Specification spec[] = {
          GNUNET_JSON_spec_string ("name",
                                   &name),
          TALER_JSON_spec_i18n_str ("name",
                                    &name_i18n),
          GNUNET_JSON_spec_end ()
        };

        if (GNUNET_OK !=
            GNUNET_JSON_parse (continent,
                               spec,
                               NULL, NULL))
        {
          GNUNET_break (0);
          GNUNET_JSON_parse_free (spec);
          continue;
        }

        gtk_list_store_insert_with_values (continent_liststore,
                                           NULL,
                                           -1,
                                           AG_CMC_CONTINENT_NAME,
                                           name,
                                           AG_CMC_CONTINENT_NAME_I18N,
                                           name_i18n,
                                           -1);
        GNUNET_JSON_parse_free (spec);
      }
    }
  }

  AG_sensitive ("anastasis_gtk_main_window_prev_button");
  AG_insensitive ("anastasis_gtk_main_window_forward_button");
  AG_show ("anastasis_gtk_progress_vbox");
  AG_progress_update ();
  if (NULL != json_object_get (AG_redux_state,
                               "backup_state"))
  {
    AG_show ("anastasis_gtk_backup_progress_scrolled_window");
    AG_hide ("anastasis_gtk_recovery_progress_scrolled_window");
  }
  else
  {
    AG_show ("anastasis_gtk_recovery_progress_scrolled_window");
    AG_hide ("anastasis_gtk_backup_progress_scrolled_window");
  }
  AG_show ("anastasis_gtk_main_window_prev_button");
  AG_show ("anastasis_gtk_main_window_forward_button");
  AG_show ("anastasis_gtk_main_control_vbox");
  AG_show ("anastasis_gtk_continent_frame");
  AG_show ("anastasis_gtk_continent_selection_image");
}


/**
 * Prepare window for selection of the country.
 */
static void
action_country_selecting (void)
{
  GtkListStore *country_liststore;
  json_t *countries;
  const char *selected_country;

  AG_hide_all_frames ();
  countries = json_object_get (AG_redux_state,
                               "countries");
  selected_country
    = json_string_value (json_object_get (AG_redux_state,
                                          "selected_country"));
  country_liststore = GTK_LIST_STORE (
    GCG_get_main_window_object ("country_liststore"));
  gtk_list_store_clear (country_liststore);
  {
    json_t *country;
    size_t index;

    json_array_foreach (countries, index, country)
    {
      GtkTreeIter iter;
      const char *code;
      const char *name;
      struct GNUNET_JSON_Specification spec[] = {
        GNUNET_JSON_spec_string ("code",
                                 &code),
        TALER_JSON_spec_i18n_str ("name",
                                  &name),
        GNUNET_JSON_spec_end ()
      };

      if (GNUNET_OK !=
          GNUNET_JSON_parse (country,
                             spec,
                             NULL, NULL))
      {
        GNUNET_break (0);
        GNUNET_JSON_parse_free (spec);
        continue;
      }

      gtk_list_store_insert_with_values (
        country_liststore,
        &iter,
        -1,
        AG_CCMC_COUNTRY_NAME,
        name,
        AG_CCMC_COUNTRY_CODE,
        code,
        -1);
      if ( (NULL != selected_country) &&
           (NULL != code) &&
           (0 == strcmp (code,
                         selected_country)) )
      {
        GtkTreeView *tv;
        GtkTreeSelection *sel;

        tv = GTK_TREE_VIEW (GCG_get_main_window_object (
                              "anastasis_gtk_country_treeview"));
        sel = gtk_tree_view_get_selection (tv);
        gtk_tree_selection_select_iter (sel,
                                        &iter);
      }
      GNUNET_JSON_parse_free (spec);
    }
  }

  AG_sensitive ("anastasis_gtk_main_window_prev_button");
  AG_insensitive ("anastasis_gtk_main_window_forward_button");
  AG_show ("anastasis_gtk_main_control_vbox");
  AG_show ("anastasis_gtk_progress_vbox");
  AG_progress_update ();
  if (NULL != json_object_get (AG_redux_state,
                               "backup_state"))
  {
    AG_show ("anastasis_gtk_backup_progress_scrolled_window");
    AG_hide ("anastasis_gtk_recovery_progress_scrolled_window");
  }
  else
  {
    AG_show ("anastasis_gtk_recovery_progress_scrolled_window");
    AG_hide ("anastasis_gtk_backup_progress_scrolled_window");
  }
  AG_show ("anastasis_gtk_main_window_prev_button");
  AG_show ("anastasis_gtk_main_window_forward_button");
  AG_show ("anastasis_gtk_country_selection_image");
  AG_show ("anastasis_gtk_continent_frame");
  AG_show ("anastasis_gtk_continent_selection_image");
  AG_show ("anastasis_gtk_country_selection_image");
}


/**
 * Create widget for "string" type user attributes.
 *
 * @param details not used
 * @return widget to be used for string entry
 */
static GtkWidget *
ctor_entry (const json_t *details)
{
  (void) details;
  return gtk_entry_new ();
}


/**
 * Create widget for "date" type user attributes.
 *
 * @param details not used
 * @return widget to be used for date entry
 */
static GtkWidget *
ctor_date (const json_t *details)
{
  (void) details;
  return gtk_calendar_new ();
}


/**
 * Create widget of @a type under @a uuid with @a label and @a tooltip
 * for the identity attribute editing dialog.  Stores all created widgets
 * in the #AG_entry_attributes and ensures that we never create the same
 * widget (by @a uuid) twice.
 *
 * @param uh hash of unique ID of the widget, only create one per UUID
 * @param type type of the widget to create
 * @param label label to use
 * @param tooltip tooltip to use
 * @param id_attr potential additional inputs for the widget creation
 * @return created widget
 */
static GtkWidget *
create_attribute_widget (const struct GNUNET_HashCode *uh,
                         const char *type,
                         const char *label,
                         const char *tooltip,
                         const json_t *id_attr)
{
  static struct
  {
    const char *type;
    GtkWidget *(*ctor)(const json_t *details);
  } type_map [] = {
    { .type = "string",
      .ctor = &ctor_entry },
    { .type = "date",
      .ctor = &ctor_date },
    { .type = NULL,
      .ctor = NULL }
  };
  GtkWidget *w;

  w = GNUNET_CONTAINER_multihashmap_get (AG_entry_attributes,
                                         uh);
  if (NULL != w)
  {
    GtkWidget *p;

    gtk_widget_show (w);
    p = gtk_widget_get_parent (w);
    gtk_widget_show (p);
    p = gtk_widget_get_parent (p);
    gtk_widget_show (p);
    return w;
  }
  for (unsigned int i = 0; NULL != type_map[i].type; i++)
  {
    GtkBox *box;
    GtkBox *vbox;

    if (0 != strcmp (type_map[i].type,
                     type))
      continue;
    w = type_map[i].ctor (id_attr);
    GNUNET_assert (NULL != w);
    gtk_widget_show (w);
    box = GTK_BOX (gtk_box_new (GTK_ORIENTATION_HORIZONTAL,
                                5 /* spacing in pixels */));
    vbox = GTK_BOX (gtk_box_new (GTK_ORIENTATION_VERTICAL,
                                 5 /* spacing in pixels */));
    {
      GtkWidget *glabel;

      glabel = gtk_label_new (label);
      gtk_box_pack_start (box,       /* parent */
                          glabel,  /* child */
                          false,   /* expand */
                          false,   /* fill */
                          5);      /* padding */
      gtk_widget_show (glabel);
    }
    GNUNET_assert (0 <
                   g_signal_connect (w,
                                     "changed",
                                     G_CALLBACK (&AG_identity_changed),
                                     NULL));
    gtk_widget_set_tooltip_text (w,
                                 tooltip);
    gtk_box_pack_start (box,       /* parent */
                        w,       /* child */
                        false,   /* expand */
                        false,   /* fill */
                        5);      /* padding */
    gtk_widget_show (GTK_WIDGET (box));
    gtk_box_pack_start (vbox,       /* parent */
                        GTK_WIDGET (box),       /* child */
                        false,   /* expand */
                        false,   /* fill */
                        5);      /* padding */
    {
      GtkWidget *private_widget;
      GtkBuilder *builder;
      GtkBin *bin;

      builder =
        GNUNET_GTK_get_new_builder ("this_stays_private.glade",
                                    NULL);
      GNUNET_break (NULL != builder);
      /* load frame */
      bin = GTK_BIN (gtk_builder_get_object (builder,
                                             "private_dummy_window"));
      GNUNET_break (NULL != bin);
      private_widget = gtk_bin_get_child (bin);
      GNUNET_break (NULL != private_widget);
      g_object_ref (private_widget);
      gtk_container_remove (GTK_CONTAINER (bin),
                            private_widget);
      gtk_widget_destroy (GTK_WIDGET (bin));
      g_object_unref (G_OBJECT (builder));
      gtk_box_pack_start (vbox,       /* parent */
                          private_widget,       /* child */
                          false,   /* expand */
                          false,   /* fill */
                          5);      /* padding */
    }
    gtk_widget_show (GTK_WIDGET (vbox));
    GNUNET_assert (GNUNET_OK ==
                   GNUNET_CONTAINER_multihashmap_put (AG_entry_attributes,
                                                      uh,
                                                      w,
                                                      GNUNET_CONTAINER_MULTIHASHMAPOPTION_UNIQUE_ONLY));
    {
      GtkBox *pbox;

      pbox = GTK_BOX (GCG_get_main_window_object (
                        "anastasis_gtk_identity_vbox"));
      gtk_box_pack_start (pbox,    /* parent */
                          GTK_WIDGET (vbox),   /* child */
                          false, /* expand */
                          false, /* fill */
                          5); /* padding */

    }
    return w;
  }
  GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
              "FATAL: required attribute type `%s' not supported\n",
              type);
  GNUNET_assert (0);
  return NULL;
}


/**
 * Expand base @a name of a widget based on the @a type to
 * create the name of the widget with the data.
 *
 * @param name base name of the widget
 * @param type type of the widget
 * @return NULL on error
 */
static char *
expand_name (const char *name,
             const char *type)
{
  static struct
  {
    const char *type;
    const char *suffix;
  } type_map [] = {
    { .type = "string",
      .suffix = "entry" },
    { .type = "date",
      .suffix = "cal" },
    { .type = NULL,
      .suffix = NULL }
  };
  char *data_widget;

  for (unsigned int i = 0; NULL != type_map[i].type; i++)
  {
    if (0 != strcmp (type_map[i].type,
                     type))
      continue;
    GNUNET_asprintf (&data_widget,
                     "%s_%s",
                     name,
                     type_map[i].suffix);
    return data_widget;
  }
  return NULL;
}


/**
 * Update GtkLabel @a name, setting text to @a value.
 *
 * @param name Glade-name of widget to update
 * @param value value to set
 */
static void
update_label (const char *name,
              const char *value)
{
  GtkLabel *label;

  label = GTK_LABEL (GCG_get_main_window_object (name));
  if (NULL == label)
    return;
  if (NULL == value)
  {
    gtk_widget_hide (GTK_WIDGET (label));
  }
  else
  {
    gtk_label_set_text (label,
                        value);
    gtk_widget_show (GTK_WIDGET (label));
  }
}


/**
 * FIXME.
 */
static void
action_user_attributes_collecting (void)
{
  const json_t *id_attributes;

  AG_hide_all_frames ();
  id_attributes = json_object_get (AG_redux_state,
                                   "required_attributes");
  GNUNET_assert (NULL != id_attributes);
  AG_hide_children ("anastasis_gtk_identity_vbox");
  {
    size_t index;
    json_t *id_attr;

    json_array_foreach (id_attributes, index, id_attr)
    {
      const char *widget_name = NULL;
      const char *attr_tooltip = NULL;
      const char *attr_label = NULL;
      const char *attr_type;
      const char *attr_uuid;
      const char *attr_name;
      struct GNUNET_JSON_Specification spec[] = {
        GNUNET_JSON_spec_mark_optional (
          GNUNET_JSON_spec_string ("widget",
                                   &widget_name)),
        GNUNET_JSON_spec_mark_optional (
          GNUNET_JSON_spec_string ("tooltip",
                                   &attr_tooltip)),
        GNUNET_JSON_spec_string ("type",
                                 &attr_type),
        GNUNET_JSON_spec_string ("uuid",
                                 &attr_uuid),
        GNUNET_JSON_spec_string ("name",
                                 &attr_name),
        GNUNET_JSON_spec_mark_optional (
          TALER_JSON_spec_i18n_str ("label",
                                    &attr_label)),
        GNUNET_JSON_spec_end ()
      };
      struct GNUNET_HashCode uh;
      GtkWidget *w = NULL;

      GNUNET_assert (GNUNET_OK ==
                     GNUNET_JSON_parse (id_attr,
                                        spec,
                                        NULL, NULL));
      GNUNET_CRYPTO_hash (attr_uuid,
                          strlen (attr_uuid),
                          &uh);
      if (NULL != widget_name)
      {
        char *data_name;

        data_name = expand_name (widget_name,
                                 attr_type);
        w = GTK_WIDGET (GCG_get_main_window_object (data_name));
        if (NULL == w)
        {
          GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                      "Widget `%s' not found, will try to create dynamic replacement\n",
                      data_name);
        }
        GNUNET_free (data_name);
      }
      if ( (NULL != widget_name) &&
           (NULL != w) &&
           (NULL != attr_label) )
      {
        char *label_widget;

        GNUNET_asprintf (&label_widget,
                         "%s_label",
                         widget_name);
        update_label (label_widget,
                      attr_label);
        GNUNET_free (label_widget);
      }
      if ( (NULL != widget_name) &&
           (NULL != w) )
      {
        char *box_widget;
        GObject *box;

        GNUNET_asprintf (&box_widget,
                         "%s_box",
                         widget_name);
        box = GCG_get_main_window_object (box_widget);
        if (NULL == box)
        {
          GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                      "Widget `%s' not found, cannot show entry element. BAD.\n",
                      box_widget);
        }
        else
        {
          AG_show (box_widget);
          AG_show_children (box_widget);
        }
        GNUNET_free (box_widget);
      }
      if ( (NULL != w) &&
           (! GNUNET_CONTAINER_multihashmap_contains (AG_entry_attributes,
                                                      &uh)) )
      {
        GNUNET_assert (GNUNET_OK ==
                       GNUNET_CONTAINER_multihashmap_put (AG_entry_attributes,
                                                          &uh,
                                                          w,
                                                          GNUNET_CONTAINER_MULTIHASHMAPOPTION_UNIQUE_ONLY));
      }
      if (NULL == w)
        w = create_attribute_widget (&uh,
                                     attr_type,
                                     attr_label,
                                     attr_tooltip,
                                     id_attr);
      if (NULL != w)
      {
        json_t *ia;
        json_t *val;

        ia = json_object_get (AG_redux_state,
                              "identity_attributes");
        val = json_object_get (ia,
                               attr_name);
        if ( (NULL != val) &&
             (! json_is_null (val)) )
          AG_import_attribute_data (w,
                                    attr_type,
                                    val);
      }
      GNUNET_JSON_parse_free (spec);
    }
  }

  AG_sensitive ("anastasis_gtk_main_window_prev_button");
  AG_identity_changed ();
  AG_show ("anastasis_gtk_progress_vbox");
  AG_progress_update ();
  if (NULL != json_object_get (AG_redux_state,
                               "backup_state"))
  {
    AG_show ("anastasis_gtk_backup_progress_scrolled_window");
    AG_hide ("anastasis_gtk_recovery_progress_scrolled_window");
  }
  else
  {
    AG_show ("anastasis_gtk_recovery_progress_scrolled_window");
    AG_hide ("anastasis_gtk_backup_progress_scrolled_window");
  }
  AG_show ("anastasis_gtk_main_control_vbox");
  AG_show ("anastasis_gtk_main_window_prev_button");
  AG_show ("anastasis_gtk_main_window_forward_button");
  AG_show ("anastasis_gtk_identity_frame");
  AG_focus ("anastasis_gtk_ia_full_name_entry");
  AG_show ("anastasis_gtk_user_attributes_image");
}


static void
activate_by_method (json_t *methods)
{
  size_t index;
  const json_t *method;

  json_array_foreach (methods,
                      index,
                      method)
  {
    const char *type;
    struct GNUNET_JSON_Specification spec[] = {
      GNUNET_JSON_spec_string ("type",
                               &type),
      GNUNET_JSON_spec_end ()
    };

    if (GNUNET_OK !=
        GNUNET_JSON_parse (method,
                           spec,
                           NULL, NULL))
    {
      GNUNET_break (0);
      continue;
    }

    {
      char btn[64];

      GNUNET_snprintf (btn,
                       sizeof (btn),
                       "anastasis_gtk_btn_add_auth_%s",
                       type);
      AG_sensitive (btn);
    }
  }
}


static void
action_authentications_editing (void)
{
  json_t *aps;
  bool have_auth;

  AG_hide_all_frames ();
  AG_insensitive_children ("anastasis_gtk_add_auth_button_box");
  aps = json_object_get (AG_redux_state,
                         "authentication_providers");
  {
    const json_t *ap;
    const char *provider_url;

    json_object_foreach (aps,
                         provider_url,
                         ap)
    {
      uint32_t ec = 0;
      uint32_t hc = 0;
      json_t *methods;
      struct GNUNET_JSON_Specification spec[] = {
        GNUNET_JSON_spec_mark_optional (
          GNUNET_JSON_spec_uint32 ("error_code",
                                   &ec)),
        GNUNET_JSON_spec_mark_optional (
          GNUNET_JSON_spec_json ("methods",
                                 &methods)),
        GNUNET_JSON_spec_uint32 ("http_status",
                                 &hc),
        GNUNET_JSON_spec_end ()
      };

      if (GNUNET_OK !=
          GNUNET_JSON_parse (ap,
                             spec,
                             NULL, NULL))
      {
        GNUNET_break (0);
        continue;
      }
      switch (hc)
      {
      case MHD_HTTP_OK:
        if (NULL == methods)
        {
          GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                      "Provider `%s' has no authentication methods?\n",
                      provider_url);
          break;
        }
        activate_by_method (methods);
        break;
      default:
        GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                    "Status of provider `%s' is %u/%u\n",
                    provider_url,
                    (unsigned int) ec,
                    (unsigned int) hc);
        break;
      }
      GNUNET_JSON_parse_free (spec);
    }
  }

  have_auth = false;
  {
    GtkListStore *ls;
    json_t *ams;
    size_t index;
    json_t *am;

    ls = GTK_LIST_STORE (GCG_get_main_window_object (
                           "authentication_methods_liststore"));
    gtk_list_store_clear (ls);
    ams = json_object_get (AG_redux_state,
                           "authentication_methods");
    json_array_foreach (ams,
                        index,
                        am)
    {
      const char *type;
      const char *instructions;
      struct GNUNET_JSON_Specification spec[] = {
        GNUNET_JSON_spec_string ("type",
                                 &type),
        GNUNET_JSON_spec_string ("instructions",
                                 &instructions),
        GNUNET_JSON_spec_end ()
      };

      GNUNET_assert (GNUNET_OK ==
                     GNUNET_JSON_parse (am,
                                        spec,
                                        NULL, NULL));
      gtk_list_store_insert_with_values (
        ls,
        NULL,
        -1,
        AG_AMMC_TYPE, type,
        AG_AMMC_VISUALIZATION, instructions,
        AG_AMMC_INDEX, (guint) index,
        -1);
      have_auth = true;
    }
  }

  AG_sensitive ("anastasis_gtk_main_window_prev_button");
  if (have_auth)
    AG_sensitive ("anastasis_gtk_main_window_forward_button");
  else
    AG_insensitive ("anastasis_gtk_main_window_forward_button");
  AG_show ("anastasis_gtk_progress_vbox");
  AG_progress_update ();
  AG_show ("anastasis_gtk_backup_progress_scrolled_window");
  AG_hide ("anastasis_gtk_recovery_progress_scrolled_window");
  AG_show ("anastasis_gtk_main_control_vbox");
  AG_show ("anastasis_gtk_main_window_prev_button");
  AG_show ("anastasis_gtk_main_window_forward_button");
  AG_show ("anastasis_gtk_b_authentication_frame");
  AG_show ("anastasis_gtk_b_authentication_methods_image");
}


/**
 * Lookup @a method_cost of authentication method @a type at @a provider in our
 * #AG_redux_state.
 *
 * @param provider URL of provider
 * @param type authentication method to look for
 * @param[out] method_cost cost to return
 * @return #GNUNET_OK on success
 */
static int
lookup_recovery_cost (const char *provider,
                      const char *type,
                      struct TALER_Amount *method_cost)
{
  json_t *aps;
  json_t *ap;
  json_t *methods;
  size_t index;
  json_t *method;

  memset (method_cost,
          0,
          sizeof (struct TALER_Amount));
  aps = json_object_get (AG_redux_state,
                         "authentication_providers");
  GNUNET_assert (NULL != aps);
  ap = json_object_get (aps,
                        provider);
  if (NULL == ap)
  {
    GNUNET_break (0);
    return GNUNET_SYSERR;
  }
  methods = json_object_get (ap,
                             "methods");
  json_array_foreach (methods, index, method)
  {
    struct TALER_Amount fee;
    const char *mtype;
    struct GNUNET_JSON_Specification spec[] = {
      TALER_JSON_spec_amount_any ("usage_fee",
                                  &fee),
      GNUNET_JSON_spec_string ("type",
                               &mtype),
      GNUNET_JSON_spec_end ()
    };

    if (GNUNET_OK !=
        GNUNET_JSON_parse (method,
                           spec,
                           NULL, NULL))
    {
      GNUNET_break (0);
      continue;
    }
    if (0 == strcmp (mtype,
                     type))
    {
      *method_cost = fee;
      return GNUNET_OK;
    }
  }
  GNUNET_break (0);
  return GNUNET_SYSERR;
}


static void
action_policies_reviewing (void)
{
  json_t *policies;
  size_t pindex;
  json_t *policy;
  GtkTreeStore *ts;

  AG_hide_all_frames ();
  ts = GTK_TREE_STORE (GCG_get_main_window_object ("policy_review_treestore"));
  gtk_tree_store_clear (ts);
  policies = json_object_get (AG_redux_state,
                              "policies");
  GNUNET_assert (NULL != policies);
  json_array_foreach (policies, pindex, policy)
  {
    GtkTreeIter piter;
    json_t *methods;
    struct GNUNET_JSON_Specification pspec[] = {
      GNUNET_JSON_spec_json ("methods",
                             &methods),
      GNUNET_JSON_spec_end ()
    };
    size_t mindex;
    json_t *method;
    char *summary;

    if (GNUNET_OK !=
        GNUNET_JSON_parse (policy,
                           pspec,
                           NULL, NULL))
    {
      GNUNET_break (0);
      continue;
    }
    gtk_tree_store_insert_with_values (ts,
                                       &piter,
                                       NULL, /* no parent */
                                       -1, /* append */
                                       -1);

    summary = NULL;
    json_array_foreach (methods, mindex, method)
    {
      uint32_t imethod;
      const char *provider;
      struct GNUNET_JSON_Specification mspec[] = {
        GNUNET_JSON_spec_string ("provider",
                                 &provider),
        GNUNET_JSON_spec_uint32 ("authentication_method",
                                 &imethod),
        GNUNET_JSON_spec_end ()
      };
      json_t *jmethods;
      json_t *jmethod;

      if (GNUNET_OK !=
          GNUNET_JSON_parse (method,
                             mspec,
                             NULL, NULL))
      {
        json_dumpf (method,
                    stderr,
                    JSON_INDENT (2));
        GNUNET_break (0);
        continue;
      }
      jmethods = json_object_get (AG_redux_state,
                                  "authentication_methods");
      jmethod = json_array_get (jmethods,
                                imethod);
      {
        GtkTreeIter miter;
        const char *instructions;
        const char *type;
        struct GNUNET_JSON_Specification tspec[] = {
          GNUNET_JSON_spec_string ("instructions",
                                   &instructions),
          GNUNET_JSON_spec_string ("type",
                                   &type),
          GNUNET_JSON_spec_end ()
        };
        struct TALER_Amount method_cost;

        if (GNUNET_OK !=
            GNUNET_JSON_parse (jmethod,
                               tspec,
                               NULL, NULL))
        {
          GNUNET_break (0);
          continue;
        }
        if (GNUNET_OK !=
            lookup_recovery_cost (provider,
                                  type,
                                  &method_cost))
        {
          GNUNET_break (0);
          continue;
        }
        gtk_tree_store_insert_with_values (
          ts,
          &miter,
          &piter,   /* parent */
          -1,       /* append */
          AG_PRMC_POLICY_NAME,
          instructions,
          AG_PRMC_METHOD_TYPE,
          type,
          AG_PRMC_COST,
          TALER_amount2s (&method_cost),
          AG_PRMC_PROVIDER_URL,
          provider,
          AG_PRMC_EXPIRATION_TIME_STR,
          "N/A",
          AG_PRMC_POLICY_INDEX,
          (guint) pindex,
          AG_PRMC_IS_CHALLENGE,
          TRUE,
          AG_PRMC_METHOD_INDEX,
          (guint) mindex,
          -1);
        if (NULL == summary)
        {
          summary = GNUNET_strdup (type);
        }
        else
        {
          char *tmp;

          GNUNET_asprintf (&tmp,
                           "%s + %s",
                           summary,
                           type);
          GNUNET_free (summary);
          summary = tmp;
        }
      }
      GNUNET_JSON_parse_free (mspec);
    }
    if (NULL != summary)
    {
      gtk_tree_store_set (ts,
                          &piter,
                          AG_PRMC_POLICY_NAME, summary,
                          AG_PRMC_EXPIRATION_TIME_STR,
                          "N/A",
                          AG_PRMC_POLICY_INDEX,
                          (guint) pindex,
                          AG_PRMC_IS_CHALLENGE,
                          FALSE,
                          -1);
      GNUNET_free (summary);
    }
    GNUNET_JSON_parse_free (pspec);
  }
  {
    GtkTreeView *tv;

    tv = GTK_TREE_VIEW (GCG_get_main_window_object (
                          "anastasis_gtk_review_policy_treeview"));
    gtk_tree_view_expand_all (tv);
  }
  AG_sensitive ("anastasis_gtk_main_window_prev_button");
  AG_sensitive ("anastasis_gtk_main_window_forward_button");
  AG_show ("anastasis_gtk_progress_vbox");
  AG_progress_update ();
  AG_show ("anastasis_gtk_backup_progress_scrolled_window");
  AG_hide ("anastasis_gtk_recovery_progress_scrolled_window");
  AG_show ("anastasis_gtk_b_policy_frame");
  AG_show ("anastasis_gtk_b_policies_image");
  AG_show ("anastasis_gtk_main_control_vbox");
  AG_show ("anastasis_gtk_main_window_prev_button");
  AG_show ("anastasis_gtk_main_window_forward_button");
}


/**
 * Update GtkEntry @a name, setting text to @a value.
 *
 * @param name Glade-name of widget to update
 * @param value value to set
 */
static void
update_entry (const char *name,
              const char *value)
{
  GtkEntry *entry;
  const char *old;

  if (NULL == value)
    value = "";
  entry = GTK_ENTRY (GCG_get_main_window_object (name));
  if (NULL == entry)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "`%s' is not a GtkEntry!\n",
                name);
    return;
  }
  old = gtk_entry_get_text (entry);
  if (NULL == old)
    old = "";
  if (0 != strcmp (old,
                   value))
    gtk_entry_set_text (entry,
                        value);
}


/**
 * Function called when we begin editing the secret.
 */
static void
action_secret_editing (void)
{
  struct GNUNET_TIME_Absolute exp_time;
  struct GNUNET_JSON_Specification spec[] = {
    GNUNET_JSON_spec_absolute_time ("expiration",
                                    &exp_time),
    GNUNET_JSON_spec_end ()
  };
  struct tm tv;
  bool is_free = false;

  AG_hide_all_frames ();
  if (GNUNET_OK !=
      GNUNET_JSON_parse (AG_redux_state,
                         spec,
                         NULL, NULL))
  {
    GNUNET_break (0);
    AG_error ("State did not parse correctly: lacks expiration");
    return;
  }

  {
    time_t t;

    t = exp_time.abs_value_us / GNUNET_TIME_UNIT_SECONDS.rel_value_us;
    GNUNET_assert (NULL !=
                   localtime_r (&t,
                                &tv));
  }

  {
    json_t *fees;

    fees = json_object_get (AG_redux_state,
                            "upload_fees");
    if (0 == json_array_size (fees))
    {
      update_label ("backup_fee_value_label",
                    _ ("gratis"));
      is_free = true;
    }
    else
    {
      char *val = GNUNET_strdup ("");
      size_t pos;
      json_t *fee;
      struct TALER_Amount a;

      json_array_foreach (fees, pos, fee)
      {
        struct GNUNET_JSON_Specification spec[] = {
          TALER_JSON_spec_amount_any ("fee",
                                      &a),
          GNUNET_JSON_spec_end ()
        };
        char *tmp;

        if (GNUNET_OK !=
            GNUNET_JSON_parse (fee,
                               spec,
                               NULL, NULL))
        {
          GNUNET_break (0);
          json_dumpf (fees,
                      stderr,
                      JSON_INDENT (2));
          continue;
        }

        GNUNET_asprintf (&tmp,
                         "%s%s%llu.%u %s",
                         val,
                         strlen (val) > 0 ? "\n" : "",
                         (unsigned long long) a.value,
                         (unsigned int) a.fraction,
                         a.currency);
        GNUNET_free (val);
        val = tmp;
      }
      update_label ("backup_fee_value_label",
                    val);
      GNUNET_free (val);
    }
  }
  {
    char estr[128];

    if (is_free)
      GNUNET_assert (sizeof (estr) >
                     strftime (estr,
                               sizeof (estr),
                               "%d %B %Y",
                               &tv));
    else
      GNUNET_assert (sizeof (estr) >
                     strftime (estr,
                               sizeof (estr),
                               "%d %B",
                               &tv));
    update_label ("expiration_date_without_year_label",
                  estr);
  }

  {
    GtkSpinButton *sb;
    unsigned int this_year;
    unsigned int exp_year;

    sb = GTK_SPIN_BUTTON (GCG_get_main_window_object (
                            "expiration_year_spin_button"));
    if (is_free)
      gtk_widget_hide (GTK_WIDGET (sb));
    else
      gtk_widget_show (GTK_WIDGET (sb));
    this_year = GNUNET_TIME_get_current_year ();
    /* We allow at most 5 years into the future */
    gtk_spin_button_set_range (sb,
                               this_year + 1,
                               this_year + 6);
    exp_year = tv.tm_year + 1900;
    gtk_spin_button_set_value (sb,
                               (double) exp_year);
  }

  AG_insensitive ("anastasis_gtk_main_window_forward_button");
  AG_sensitive ("anastasis_gtk_enter_secret_open_button");
  AG_sensitive ("anastasis_gtk_enter_secret_entry");
  AG_hide ("anastasis_gtk_secret_clear_file_button");
  AG_hide ("anastasis_gtk_secret_clear_text_button");
  AG_hide ("anastasis_gtk_secret_file_name_hbox");
  AG_show ("anastasis_gtk_secret_file_chooser_hbox");
  {
    const char *name = "";
    json_t *jsecret = NULL;
    const char *filename = NULL;
    struct GNUNET_JSON_Specification spec[] = {
      GNUNET_JSON_spec_mark_optional (
        GNUNET_JSON_spec_json ("core_secret",
                               &jsecret)),
      GNUNET_JSON_spec_mark_optional (
        GNUNET_JSON_spec_string ("secret_name",
                                 &name)),
      GNUNET_JSON_spec_end ()
    };

    if (GNUNET_OK !=
        GNUNET_JSON_parse (AG_redux_state,
                           spec,
                           NULL, NULL))
    {
      GNUNET_break (0);
      json_dumpf (AG_redux_state,
                  stderr,
                  JSON_INDENT (2));
      AG_error ("State did not parse correctly: invalid secret data");
      return;
    }
    if (! AG_in_secret_name_editing)
      update_entry ("anastasis_gtk_secret_name_entry",
                    name);
    if (NULL != jsecret)
    {
      const char *mime = NULL;
      const char *text = NULL;
      struct GNUNET_JSON_Specification sspec[] = {
        GNUNET_JSON_spec_mark_optional (
          GNUNET_JSON_spec_string ("text",
                                   &text)),
        GNUNET_JSON_spec_mark_optional (
          GNUNET_JSON_spec_string ("mime",
                                   &mime)),
        GNUNET_JSON_spec_mark_optional (
          GNUNET_JSON_spec_string ("filename",
                                   &filename)),
        GNUNET_JSON_spec_end ()
      };

      if (GNUNET_OK !=
          GNUNET_JSON_parse (jsecret,
                             sspec,
                             NULL, NULL))
      {
        GNUNET_break (0);
        json_dumpf (AG_redux_state,
                    stderr,
                    JSON_INDENT (2));
        AG_error ("State did not parse correctly: invalid secret data");
        return;
      }
      if ( (NULL != text) &&
           (0 == strlen (text)) )
        text = NULL;
      if (! AG_in_secret_editing)
        update_entry ("anastasis_gtk_enter_secret_entry",
                      text);
      update_label ("anastasis_gtk_secret_file_name_label",
                    filename);
      if ( (NULL != text) ||
           (NULL != filename) )
      {
        AG_sensitive ("anastasis_gtk_main_window_forward_button");
      }
      if (NULL != text)
      {
        AG_insensitive ("anastasis_gtk_enter_secret_open_button");
        AG_show ("anastasis_gtk_secret_clear_text_button");
      }
      if (NULL != filename)
      {
        AG_insensitive ("anastasis_gtk_enter_secret_entry");
        AG_show ("anastasis_gtk_secret_clear_file_button");
        AG_show ("anastasis_gtk_secret_file_name_hbox");
        AG_hide ("anastasis_gtk_secret_file_chooser_hbox");
      }
      GNUNET_JSON_parse_free (sspec);
    }
    else
    {
      /* secret is NULL */
      update_entry ("anastasis_gtk_enter_secret_entry",
                    NULL);

    }
    if ( (NULL == name) ||
         (0 == strlen (name) ) )
      AG_focus ("anastasis_gtk_secret_name_entry");
    else if (NULL == filename)
      AG_focus ("anastasis_gtk_enter_secret_entry");
    GNUNET_JSON_parse_free (spec);
  }
  AG_sensitive ("anastasis_gtk_main_window_prev_button");
  AG_show ("anastasis_gtk_progress_vbox");
  AG_progress_update ();
  AG_show ("anastasis_gtk_backup_progress_scrolled_window");
  AG_hide ("anastasis_gtk_recovery_progress_scrolled_window");
  AG_show ("anastasis_gtk_enter_secret_frame");
  AG_show ("anastasis_gtk_enter_secret_image");
  AG_show ("anastasis_gtk_main_control_vbox");
  AG_show ("anastasis_gtk_main_window_prev_button");
  AG_show ("anastasis_gtk_main_window_forward_button");
}


/**
 * Create the QR code image for our zone.
 *
 * @param scale factor for scaling up the size of the image to create
 * @param text text to encode
 * @return NULL on error
 */
static GdkPixbuf *
create_qrcode (unsigned int scale,
               const char *text,
               size_t text_size)
{
  QRinput *qri;
  QRcode *qrc;
  GdkPixbuf *pb;
  guchar *pixels;
  int n_channels;
  const char *dir;
  char *fn;
  unsigned int size;

  qri = QRinput_new2 (0, QR_ECLEVEL_M);
  if (NULL == qri)
  {
    GNUNET_log_strerror (GNUNET_ERROR_TYPE_WARNING, "QRinput_new2");
    return NULL;
  }
  /* first try encoding as uppercase-only alpha-numerical
     QR code (much smaller encoding); if that fails, also
     try using binary encoding (in case nick contains
     special characters). */
  if ((0 != QRinput_append (qri,
                            QR_MODE_AN,
                            text_size,
                            (unsigned char *) text)) &&
      (0 != QRinput_append (qri,
                            QR_MODE_8,
                            text_size,
                            (unsigned char *) text)))
  {
    GNUNET_log_strerror (GNUNET_ERROR_TYPE_WARNING,
                         "QRinput_append");
    return NULL;
  }
  qrc = QRcode_encodeInput (qri);
  if (NULL == qrc)
  {
    GNUNET_log_strerror (GNUNET_ERROR_TYPE_WARNING,
                         "QRcode_encodeInput");
    QRinput_free (qri);
    return NULL;
  }
  /* We use a trick to create a pixbuf in a way that works for both Gtk2 and
     Gtk3 by loading a dummy file from disk; all other methods are not portable
     to both Gtk2 and Gtk3. */
  dir = GNUNET_GTK_get_data_dir ();
  GNUNET_asprintf (&fn,
                   "%s%s",
                   dir,
                   "qr_dummy.png");
  size = (qrc->width + 8) * scale;
  size += 8 - (size % 8);
  pb = gdk_pixbuf_new_from_file_at_size (fn,
                                         size,
                                         size,
                                         NULL);
  GNUNET_free (fn);
  if (NULL == pb)
  {
    QRcode_free (qrc);
    QRinput_free (qri);
    return NULL;
  }
  pixels = gdk_pixbuf_get_pixels (pb);
  n_channels = gdk_pixbuf_get_n_channels (pb);
  for (unsigned int x = 4 * scale; x < size - 4 * scale; x++)
    for (unsigned int y = 4 * scale; y < size - 4 * scale; y++)
    {
      unsigned int xx = x - 4 * scale;
      unsigned int yy = y - 4 * scale;
      unsigned int ss = size - 8 * scale;
      unsigned int off =
        (xx * qrc->width / ss) + (yy * qrc->width / ss) * qrc->width;
      for (int c = 0; c < n_channels; c++)
        pixels[(y * size + x) * n_channels + c] =
          (0 == (qrc->data[off] & 1)) ? 0xFF : 0;
    }
  QRcode_free (qrc);
  QRinput_free (qri);
  return pb;
}


/**
 * Create the QR code image for our zone.
 *
 * @param text text to encode
 * @return NULL on error
 */
static GdkPixbuf *
setup_qrcode (const char *widget,
              const char *text,
              size_t text_size)
{
  GtkWidget *image;
  GdkScreen *screen;
  GtkSettings *settings;
  gint dpi;
  int scale;

  image = GTK_WIDGET (GCG_get_main_window_object (widget));
  if (NULL == image)
  {
    GNUNET_break (0);
    return NULL;
  }
  /* adjust scale to screen resolution */
  screen = gtk_widget_get_screen (GTK_WIDGET (image));
  settings = gtk_settings_get_for_screen (screen);
  g_object_get (G_OBJECT (settings),
                "gtk-xft-dpi",
                &dpi,
                NULL);
  if (-1 == dpi)
    scale = 2;
  else if (dpi >= 122800)
    scale = 4;
  else if (dpi >= 98304)
    scale = 3;
  else
    scale = 2;
  return create_qrcode (3 * scale,
                        text,
                        text_size);
}


static void
action_truths_paying (void)
{
  json_t *pprs;
  size_t index;
  json_t *pt;
  GtkListStore *ls;

  AG_hide_all_frames ();
  ls = GTK_LIST_STORE (GCG_get_main_window_object (
                         "unpaid_qrcodes_liststore"));
  gtk_list_store_clear (ls);
  pprs = json_object_get (AG_redux_state,
                          "payments");
  json_array_foreach (pprs, index, pt)
  {
    const char *payto = json_string_value (pt);
    GdkPixbuf *pb;

    if (NULL == payto)
    {
      GNUNET_break (0);
      continue;
    }
    pb = setup_qrcode ("unpaid_qr_treeview",
                       payto,
                       strlen (payto));
    if (NULL == pb)
    {
      GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                  _ ("Failed to initialize QR-code pixbuf for `%s'\n"),
                  payto);
      continue;
    }

    gtk_list_store_insert_with_values (ls,
                                       NULL,
                                       -1, /* append */
                                       AG_UQRMC_QR_IMAGE, pb,
                                       AG_UQRMC_URL, payto,
                                       AG_UQRMC_PROVIDER, "",
                                       -1);
    g_object_unref (pb);
  }

  {
    json_t *args;
    struct GNUNET_TIME_Relative timeout;

    timeout = GNUNET_TIME_UNIT_MINUTES;
    GNUNET_assert (NULL == AG_ra);
    args = GNUNET_JSON_PACK (
      GNUNET_JSON_pack_time_rel ("timeout",
                                 timeout));
    AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                    "pay",
                                    args,
                                    &AG_action_cb,
                                    NULL);
    json_decref (args);
  }
  AG_show ("anastasis_gtk_pay_frame");
  AG_show ("anastasis_gtk_pay_image");
  AG_show ("anastasis_gtk_main_control_vbox");
  AG_show ("anastasis_gtk_progress_vbox");
  AG_progress_update ();
  AG_show ("anastasis_gtk_backup_progress_scrolled_window");
  AG_hide ("anastasis_gtk_recovery_progress_scrolled_window");
  AG_hide ("anastasis_gtk_main_window_prev_button");
  AG_hide ("anastasis_gtk_main_window_forward_button");
}


static void
action_policies_paying (void)
{
  json_t *pprs;
  size_t index;
  json_t *ppr;
  GtkListStore *ls;

  AG_hide_all_frames ();
  ls = GTK_LIST_STORE (GCG_get_main_window_object (
                         "unpaid_qrcodes_liststore"));
  gtk_list_store_clear (ls);
  pprs = json_object_get (AG_redux_state,
                          "policy_payment_requests");
  json_array_foreach (pprs, index, ppr)
  {
    const char *provider;
    const char *payto;
    struct GNUNET_JSON_Specification spec[] = {
      GNUNET_JSON_spec_string ("provider",
                               &provider),
      GNUNET_JSON_spec_string ("payto",
                               &payto),
      GNUNET_JSON_spec_end ()
    };
    GdkPixbuf *pb;

    if (GNUNET_OK !=
        GNUNET_JSON_parse (ppr,
                           spec,
                           NULL, NULL))
    {
      GNUNET_break (0);
      continue;
    }
    pb = setup_qrcode ("unpaid_qr_treeview",
                       payto,
                       strlen (payto));
    if (NULL == pb)
    {
      GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                  _ ("Failed to initialize QR-code pixbuf for `%s'\n"),
                  payto);
      continue;
    }

    gtk_list_store_insert_with_values (ls,
                                       NULL,
                                       -1, /* append */
                                       AG_UQRMC_QR_IMAGE, pb,
                                       AG_UQRMC_URL, payto,
                                       AG_UQRMC_PROVIDER, provider,
                                       -1);
    g_object_unref (pb);
  }
  {
    json_t *args;
    struct GNUNET_TIME_Relative timeout;

    timeout = GNUNET_TIME_UNIT_MINUTES;
    GNUNET_assert (NULL == AG_ra);
    args = GNUNET_JSON_PACK (
      GNUNET_JSON_pack_time_rel ("timeout",
                                 timeout));
    AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                    "pay",
                                    args,
                                    &AG_action_cb,
                                    NULL);
    json_decref (args);
  }
  AG_show ("anastasis_gtk_pay_frame");
  AG_show ("anastasis_gtk_pay_image");
  AG_show ("anastasis_gtk_main_control_vbox");
  AG_show ("anastasis_gtk_progress_vbox");
  AG_progress_update ();
  AG_show ("anastasis_gtk_backup_progress_scrolled_window");
  AG_hide ("anastasis_gtk_recovery_progress_scrolled_window");
  AG_hide ("anastasis_gtk_main_window_prev_button");
  AG_hide ("anastasis_gtk_main_window_forward_button");
}


/**
 * The backup has finished, show the providers, policy version and
 * expiration dates.
 */
static void
action_backup_finished (void)
{
  json_t *det;
  json_t *se;
  const char *url;
  GtkListStore *ls;
  struct GNUNET_TIME_Absolute mexp;

  AG_hide_all_frames ();
  det = json_object_get (AG_redux_state,
                         "success_details");
  ls = GTK_LIST_STORE (GCG_get_main_window_object (
                         "backup_provider_liststore"));
  gtk_list_store_clear (ls);
  mexp = GNUNET_TIME_UNIT_FOREVER_ABS;
  json_object_foreach (det, url, se)
  {
    struct GNUNET_TIME_Absolute pexp;
    uint64_t version;
    struct GNUNET_JSON_Specification spec[] = {
      GNUNET_JSON_spec_uint64 ("policy_version",
                               &version),
      GNUNET_JSON_spec_absolute_time ("policy_expiration",
                                      &pexp),
      GNUNET_JSON_spec_end ()
    };

    if (GNUNET_OK !=
        GNUNET_JSON_parse (se,
                           spec,
                           NULL, NULL))
    {
      GNUNET_break_op (0);
      AG_error ("State did not parse correctly");
      return;
    }
    mexp = GNUNET_TIME_absolute_min (mexp,
                                     pexp);
    gtk_list_store_insert_with_values (
      ls,
      NULL,
      -1,                                  /* append */
      AG_BPC_PROVIDER_URL,
      url,
      AG_BPC_BACKUP_VERSION,
      (guint64) version,
      AG_BPC_EXPIRATION_TIME_STR,
      GNUNET_STRINGS_absolute_time_to_string (pexp),
      AG_BPC_SUCCESS_FLAG,
      true,
      -1);
  }
  {
    struct tm tv;
    char estr[128];
    time_t t;

    /* be more conservative in what we show */
    mexp = GNUNET_TIME_absolute_subtract (mexp,
                                          GNUNET_TIME_UNIT_DAYS);
    t = mexp.abs_value_us / GNUNET_TIME_UNIT_SECONDS.rel_value_us;
    GNUNET_assert (NULL !=
                   localtime_r (&t,
                                &tv));
    GNUNET_assert (sizeof (estr) >
                   strftime (estr,
                             sizeof (estr),
                             "%d %B %Y",
                             &tv));
    update_label ("backup_expiration_date_label",
                  GNUNET_STRINGS_absolute_time_to_string (mexp));
  }
  AG_hide ("anastasis_gtk_progress_vbox");
  AG_hide ("anastasis_gtk_backup_progress_scrolled_window");
  AG_show ("anastasis_gtk_completed_frame");
  AG_show ("anastasis_gtk_backup_complete_box");
  AG_hide ("anastasis_gtk_success_recovery_box");
  AG_show ("anastasis_gtk_success_backup_label");
  AG_hide ("anastasis_gtk_success_recovery_box");
  AG_show ("anastasis_gtk_completed_image");
  AG_show ("anastasis_gtk_main_control_vbox");
  AG_hide ("anastasis_gtk_main_window_save_as_button");
  AG_show ("anastasis_gtk_restart_button");
  AG_show ("anastasis_gtk_main_window_quit_button");
  AG_hide ("anastasis_gtk_main_window_prev_button");
  AG_hide ("anastasis_gtk_main_window_forward_button");
}


static const json_t *
find_challenge_by_uuid (const char *uuid)
{
  json_t *rd;
  json_t *cs;
  size_t index;
  json_t *c;

  rd = json_object_get (AG_redux_state,
                        "recovery_document");
  cs = json_object_get (rd,
                        "cs");
  json_array_foreach (cs, index, c)
  {
    const char *u;

    u = json_string_value (json_object_get (c,
                                            "uuid"));
    if (NULL == u)
    {
      GNUNET_break (0);
      continue;
    }
    if (0 == strcmp (u,
                     uuid))
      return c;
  }
  return NULL;
}


/**
 * Find out offset of challenge with the given @a uuid in the
 * "cs" array.
 *
 * @param[out] roff set to the offset
 * @param[out] cost set to the cost of the challenge
 */
static int
get_challenge_offset (const char *uuid,
                      guint *roff,
                      struct TALER_Amount *cost)
{
  const json_t *recdoc;
  const json_t *cs;
  const json_t *c;
  size_t off;

  recdoc = json_object_get (AG_redux_state,
                            "recovery_document");
  GNUNET_assert (NULL != recdoc);
  cs = json_object_get (recdoc,
                        "cs");
  GNUNET_assert (NULL != cs);
  json_array_foreach (cs, off, c)
  {
    const char *provider;
    const char *type;
    const char *u;
    struct GNUNET_JSON_Specification spec[] = {
      GNUNET_JSON_spec_string ("type",
                               &type),
      GNUNET_JSON_spec_string ("url",
                               &provider),
      GNUNET_JSON_spec_string ("uuid",
                               &u),
      GNUNET_JSON_spec_end ()
    };

    if (GNUNET_OK !=
        GNUNET_JSON_parse (c,
                           spec,
                           NULL, NULL))
    {
      GNUNET_break (0);
      continue;
    }
    if (0 == strcmp (uuid,
                     u))
    {
      *roff = off;
      return lookup_recovery_cost (provider,
                                   type,
                                   cost);
    }
  }
  GNUNET_break (0);
  return GNUNET_SYSERR;
}


/**
 * Translate the @a state into a localized, human-readable
 * string.
 *
 * @param state a challenge state, as a string
 */
static const char *
translate_state (const char *state)
{
  struct
  {
    const char *in;
    const char *out;
  } state_map [] = {
    { .in = "solved",
      .out = _ ("challenge solved") },
    { .in = "payment",
      .out = _ ("make payment") },
    { .in = "body",
      .out = _ ("unexpected reply") },
    { .in = "hint",
      .out = _ ("read hint") },
    { .in = "details",
      .out = _ ("read feedback") },
    { .in = "redirect",
      .out = _ ("open link") },
    { .in = "server-failure",
      .out = _ ("wait, provider failed") },
    { .in = "truth-unknown",
      .out = _ ("challenge unknown") },
    { .in = "rate-limit-exceeded",
      .out = _ ("wait, tries exceeded") },
    { .in = "authentication-timeout",
      .out = _ ("awaiting completion of authentication process") },
    { .in = "external-instructions",
      .out = _ ("challenge-specific action required") },
    { .in = NULL,
      .out = NULL }
  };

  for (unsigned int i = 0; NULL != state_map[i].in; i++)
  {
    if (0 != strcmp (state_map[i].in,
                     state))
      continue;
    return state_map[i].out;
  }
  GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
              "Could not localize unexpected state `%s'\n",
              state);
  return state;
}


/**
 * Test if the given @a uuid is already in @a model,
 * and if so, return the position at @a iter.
 *
 * @param model the list store with the challenges
 * @param uuid challenge UUID to look for
 * @param[out] iter iter to set
 * @return true if @a iter was set
 */
static bool
challenge_ls_has_uuid (GtkTreeModel *model,
                       const char *uuid,
                       GtkTreeIter *iter)
{
  GtkTreeIter pos;

  if (gtk_tree_model_get_iter_first (model,
                                     &pos))
    do {
      char *u;

      gtk_tree_model_get (model,
                          &pos,
                          AG_CSM_CHALLENGE_UUID, &u,
                          -1);
      if (0 == strcmp (uuid,
                       u))
      {
        g_free (u);
        if (NULL != iter)
          *iter = pos;
        return true;
      }
      g_free (u);
    }
    while (gtk_tree_model_iter_next (model,
                                     &pos));
  return false;
}


/**
 * Update the list store with the challenge feedback.
 */
static void
show_challenge_feedback (void)
{
  GtkListStore *ls;
  json_t *cf;
  const json_t *f;
  const char *uuid;

  ls = GTK_LIST_STORE (GCG_get_main_window_object (
                         "challenge_status_liststore"));
  cf = json_object_get (AG_redux_state,
                        "challenge_feedback");
  json_object_foreach (cf, uuid, f)
  {
    const char *state;
    const char *redirect_url = NULL;
    const char *hint = NULL;
    json_t *details = NULL;
    const char *taler_pay_uri = NULL;
    uint32_t ec = 0;
    uint32_t http_status = 0;
    struct GNUNET_JSON_Specification spec[] = {
      GNUNET_JSON_spec_string ("state",
                               &state),
      GNUNET_JSON_spec_mark_optional (
        GNUNET_JSON_spec_string ("taler_pay_uri",
                                 &taler_pay_uri)),
      GNUNET_JSON_spec_mark_optional (
        GNUNET_JSON_spec_json ("details",
                               &details)),
      GNUNET_JSON_spec_mark_optional (
        GNUNET_JSON_spec_string ("redirect_url",
                                 &redirect_url)),
      GNUNET_JSON_spec_mark_optional (
        GNUNET_JSON_spec_string ("hint",
                                 &hint)),
      GNUNET_JSON_spec_mark_optional (
        GNUNET_JSON_spec_uint32 ("http_status",
                                 &http_status)),
      GNUNET_JSON_spec_mark_optional (
        GNUNET_JSON_spec_uint32 ("error_code",
                                 &ec)),
      GNUNET_JSON_spec_end ()
    };
    struct TALER_Amount cost;
    guint off;
    GdkPixbuf *qr = NULL;
    const char *emsg = NULL;

    if (GNUNET_OK !=
        GNUNET_JSON_parse (f,
                           spec,
                           NULL, NULL))
    {
      GNUNET_break (0);
      json_dumpf (f,
                  stderr,
                  JSON_INDENT (2));
      continue;
    }
    if (GNUNET_OK !=
        get_challenge_offset (uuid,
                              &off,
                              &cost))
    {
      GNUNET_break (0);
      GNUNET_JSON_parse_free (spec);
      continue;
    }
    if (NULL != taler_pay_uri)
    {
      qr = setup_qrcode ("anastasis_gtk_challenge_status_treeview",
                         taler_pay_uri,
                         strlen (taler_pay_uri));
    }
    if (TALER_EC_NONE != ec)
      emsg = TALER_ErrorCode_get_hint (ec);
    if (0 == strcmp (state,
                     "hint"))
      emsg = dgettext ("taler-exchange",
                       hint);
    if (0 == strcmp (state,
                     "details"))
    {
      emsg = dgettext ("taler-exchange",
                       json_string_value (json_object_get (details,
                                                           "hint")));
    }
    {
      GtkTreeIter iter;
      bool found;

      found = challenge_ls_has_uuid (GTK_TREE_MODEL (ls),
                                     uuid,
                                     &iter);
      if (found)
        gtk_list_store_set (
          ls,
          &iter,
          AG_CSM_SOLVED, 0 == strcmp (state, "solved"),
          AG_CSM_STATUS, translate_state (state),
          AG_CSM_PAYMENT_QR_CODE, qr,
          AG_CSM_ERROR_MESSAGE, emsg,
          AG_CSM_PAYTO_URI, taler_pay_uri,
          AG_CSM_PAYING, NULL != taler_pay_uri,
          AG_CSM_HAS_ERROR, NULL != emsg,
          AG_CSM_COST, TALER_amount2s (&cost),
          AG_CSM_REDIRECT_URL, redirect_url,
          AG_CSM_HAVE_REDIRECT, NULL != redirect_url,
          AG_CSM_NOT_SOLVED, 0 != strcmp (state, "solved"),
          -1);
      else
        gtk_list_store_insert_with_values (
          ls,
          NULL,
          -1,                              /* append */
          AG_CSM_CHALLENGE_OFFSET, (guint) (off + 1),
          AG_CSM_CHALLENGE_UUID, uuid,
          AG_CSM_SOLVED, 0 == strcmp (state, "solved"),
          AG_CSM_STATUS, translate_state (state),
          AG_CSM_PAYMENT_QR_CODE, qr,
          AG_CSM_ERROR_MESSAGE, emsg,
          AG_CSM_PAYTO_URI, taler_pay_uri,
          AG_CSM_PAYING, NULL != taler_pay_uri,
          AG_CSM_HAS_ERROR, NULL != emsg,
          AG_CSM_COST, TALER_amount2s (&cost),
          AG_CSM_REDIRECT_URL, redirect_url,
          AG_CSM_HAVE_REDIRECT, NULL != redirect_url,
          AG_CSM_NOT_SOLVED, 0 != strcmp (state, "solved"),
          -1);
      GNUNET_JSON_parse_free (spec);
    }
  }
}


/**
 * FIXME.
 */
static void
action_secret_selecting (void)
{
  json_t *ri;
  json_t *re;

  AG_hide ("anastasis_gtk_start_frame");
  if (AG_have_error)
    AG_show ("anastasis_gtk_error_label");
  AG_hide ("anastasis_gtk_challenge_frame");
  AG_hide ("anastasis_gtk_identity_frame");
  AG_hide ("anastasis_gtk_secret_identification_vbox");
  re = json_object_get (AG_redux_state,
                        "recovery_error");
  if (NULL != re)
  {
    bool offline;
    const char *hint;
    struct GNUNET_JSON_Specification espec[] = {
      GNUNET_JSON_spec_bool ("offline",
                             &offline),
      GNUNET_JSON_spec_string ("hint",
                               &hint),
      GNUNET_JSON_spec_end ()
    };

    AG_insensitive ("anastasis_gtk_main_window_forward_button");
    if (GNUNET_OK !=
        GNUNET_JSON_parse (re,
                           espec,
                           NULL, NULL))
    {
      GNUNET_break_op (0);
      AG_error ("'recovery_error' did not parse correctly");
      return;
    }
    AG_error ("%s",
              dgettext ("taler-exchange",
                        hint));
    AG_show ("anastasis_gtk_progress_vbox");
    AG_progress_update ();
    AG_show ("anastasis_gtk_recovery_progress_scrolled_window");
    AG_hide ("anastasis_gtk_backup_progress_scrolled_window");
    AG_show ("anastasis_gtk_main_control_vbox");
    AG_show ("anastasis_gtk_main_window_save_as_button");
    AG_show ("anastasis_gtk_select_secret_frame");
    AG_show ("anastasis_gtk_main_window_prev_button");
    AG_hide ("anastasis_gtk_main_window_quit_button");
    return;
  }
  else
  {
    json_t *aps;
    GtkComboBoxText *bt;
    const json_t *ap;
    const char *provider_url;

    bt = GTK_COMBO_BOX_TEXT (GCG_get_main_window_object (
                               "anastasis_gtk_provider_url_combo_box_text"));
    gtk_combo_box_text_remove_all (bt);
    aps = json_object_get (AG_redux_state,
                           "authentication_providers");
    json_object_foreach (aps,
                         provider_url,
                         ap)
    {
      gtk_combo_box_text_insert_text (bt,
                                      -1,   /* append */
                                      provider_url);
    }
  }
  ri = json_object_get (AG_redux_state,
                        "recovery_information");
  if (NULL != ri)
  {
    uint64_t version;
    const char *provider_url;
    struct GNUNET_JSON_Specification vspec[] = {
      GNUNET_JSON_spec_uint64 ("version",
                               &version),
      GNUNET_JSON_spec_string ("provider_url",
                               &provider_url),
      GNUNET_JSON_spec_end ()
    };
    GtkSpinButton *sb;

    if (GNUNET_OK !=
        GNUNET_JSON_parse (ri,
                           vspec,
                           NULL, NULL))
    {
      GNUNET_break_op (0);
      AG_error ("'recovery_information' did not parse correctly");
      return;
    }
    sb = GTK_SPIN_BUTTON (GCG_get_main_window_object (
                            "anastasis_gtk_policy_version_spin_button"));
    gtk_spin_button_set_value (sb,
                               version);
    if (NULL == re)
      update_entry ("anastasis_gtk_provider_url_entry",
                    provider_url);
  }
  else
  {
    GtkWidget *ge;

    ge = GTK_WIDGET (GCG_get_main_window_object (
                       "anastasis_gtk_provider_url_entry"));
    if (! gtk_widget_has_focus (ge))
      gtk_widget_grab_focus (ge);
  }
  {
    json_t *rd;
    const char *sn;

    rd = json_object_get (AG_redux_state,
                          "recovery_document");
    if (NULL == rd)
    {
      AG_insensitive ("anastasis_gtk_main_window_forward_button");
    }
    else
    {
      AG_sensitive ("anastasis_gtk_main_window_forward_button");
      sn = json_string_value (json_object_get (rd,
                                               "secret_name"));
      if (NULL != sn)
      {
        update_label ("anastasis_gtk_secret_name_label",
                      sn);
      }
      else
      {
        update_label ("anastasis_gtk_secret_name_label",
                      _ ("<not set>"));
      }
      AG_show ("anastasis_gtk_secret_identification_vbox");
    }
  }
  AG_show ("anastasis_gtk_progress_vbox");
  AG_progress_update ();
  AG_show ("anastasis_gtk_recovery_progress_scrolled_window");
  AG_hide ("anastasis_gtk_backup_progress_scrolled_window");
  AG_show ("anastasis_gtk_main_control_vbox");
  AG_show ("anastasis_gtk_main_window_save_as_button");
  AG_show ("anastasis_gtk_select_secret_frame");
  AG_show ("anastasis_gtk_main_window_prev_button");
  AG_hide ("anastasis_gtk_main_window_quit_button");
  AG_show ("anastasis_gtk_main_window_forward_button");
}


/**
 * Function called with the results of #ANASTASIS_redux_action on "poll".
 *
 * @param cls closure, NULL
 * @param error_code Error code
 * @param response new state as result or config information of a provider
 */
static void
long_action_cb (void *cls,
                enum TALER_ErrorCode error_code,
                json_t *response);


/**
 * Schedules the 'poll' action.
 *
 * @param cls NULL
 */
static void
long_task (void *cls)
{
  json_t *tspec;

  (void) cls;
  AG_long_task = NULL;
  if (GNUNET_TIME_absolute_is_future (long_next))
  {
    AG_long_task = GNUNET_SCHEDULER_add_at (long_next,
                                            &long_task,
                                            NULL);
    return;
  }
  long_next = GNUNET_TIME_relative_to_absolute (LP_TIMEOUT);
  tspec = GNUNET_JSON_PACK (
    GNUNET_JSON_pack_time_rel ("timeout",
                               LP_TIMEOUT));
  AG_long_action
    = ANASTASIS_redux_action (AG_redux_state,
                              "poll",
                              tspec,
                              &long_action_cb,
                              NULL);
  json_decref (tspec);
}


/**
 * Function called with the results of #ANASTASIS_redux_action on "poll".
 *
 * @param cls closure, NULL
 * @param error_code Error code
 * @param response new state as result or config information of a provider
 */
static void
long_action_cb (void *cls,
                enum TALER_ErrorCode error_code,
                json_t *response)
{
  AG_long_action = NULL;
  switch (error_code)
  {
  case TALER_EC_NONE:
    /* continued below */
    break;
  default:
    GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                "'poll' action failed: %s\n",
                TALER_ErrorCode_get_hint (error_code));
    /* simply try again */
    AG_long_task = GNUNET_SCHEDULER_add_now (&long_task,
                                             NULL);
    return;
  }
  if (NULL != AG_ra)
  {
    GNUNET_break (0);
    ANASTASIS_redux_action_cancel (AG_ra);
  }
  AG_action_cb (NULL,
                TALER_EC_NONE,
                response);
}


/**
 * The user must select the next challenge to solve
 * during the recovery process.
 */
static void
action_challenge_selecting (void)
{
  json_t *rd;

  AG_hide_all_frames ();
  rd = json_object_get (AG_redux_state,
                        "recovery_document");
  {
    json_t *challenges;
    size_t index;
    json_t *challenge;
    GtkListStore *ls;

    ls = GTK_LIST_STORE (GCG_get_main_window_object (
                           "challenge_status_liststore"));
    gtk_list_store_clear (ls);
    challenges = json_object_get (rd,
                                  "cs");
    json_array_foreach (challenges, index, challenge)
    {
      const char *instructions;
      const char *provider;
      const char *type;
      const char *uuid;
      struct TALER_Amount cost;
      bool async = false;
      struct GNUNET_JSON_Specification spec[] = {
        GNUNET_JSON_spec_string ("instructions",
                                 &instructions),
        GNUNET_JSON_spec_string ("type",
                                 &type),
        GNUNET_JSON_spec_string ("url",
                                 &provider),
        GNUNET_JSON_spec_string ("uuid",
                                 &uuid),
        GNUNET_JSON_spec_mark_optional (
          GNUNET_JSON_spec_bool ("async",
                                 &async)),
        GNUNET_JSON_spec_end ()
      };

      {
        const json_t *ks;

        ks = json_object_get (challenge,
                              "key_share");
        if ( (NULL != ks) &&
             (! json_is_null (ks)) )
          continue; /* already solved */
      }
      if (GNUNET_OK !=
          GNUNET_JSON_parse (challenge,
                             spec,
                             NULL, NULL))
      {
        GNUNET_break (0);
        continue;
      }
      if (GNUNET_OK !=
          lookup_recovery_cost (provider,
                                type,
                                &cost))
      {
        GNUNET_break (0);
        continue;
      }
      if (challenge_ls_has_uuid (GTK_TREE_MODEL (ls),
                                 uuid,
                                 NULL))
        continue;
      if (async &&
          (NULL == AG_long_task) )
      {
        long_next = GNUNET_TIME_UNIT_ZERO_ABS;
        AG_long_task
          = GNUNET_SCHEDULER_add_now (&long_task,
                                      NULL);
      }
      gtk_list_store_insert_with_values (
        ls,
        NULL,
        -1,                                /* append */
        AG_CSM_CHALLENGE_OFFSET, (guint) (index + 1),
        AG_CSM_CHALLENGE_UUID, uuid,
        AG_CSM_SOLVED, false,
        AG_CSM_STATUS, _ ("new"),
        AG_CSM_PAYMENT_QR_CODE, NULL,
        AG_CSM_ERROR_MESSAGE, NULL,
        AG_CSM_PAYTO_URI, NULL,
        AG_CSM_PAYING, false,
        AG_CSM_HAS_ERROR, false,
        AG_CSM_COST, TALER_amount2s (&cost),
        AG_CSM_REDIRECT_URL, NULL,
        AG_CSM_HAVE_REDIRECT, false,
        AG_CSM_NOT_SOLVED, true,
        AG_CSM_TYPE, type,
        AG_CSM_INSTRUCTIONS, instructions,
        AG_CSM_PROVIDER_URL, provider,
        -1);
    }
  }
  show_challenge_feedback ();

  {
    GtkTreeStore *ts;
    json_t *policies;
    size_t pindex;
    json_t *policy;
    char *summary = NULL;

    ts = GTK_TREE_STORE (GCG_get_main_window_object (
                           "policy_review_treestore"));
    gtk_tree_store_clear (ts);
    policies = json_object_get (rd,
                                "dps");
    GNUNET_assert (NULL != policies);
    json_array_foreach (policies, pindex, policy)
    {
      json_t *challenges;
      size_t index;
      json_t *challenge;
      GtkTreeIter piter;

      gtk_tree_store_insert (ts,
                             &piter,
                             NULL, /* no parent */
                             -1 /* append */);
      challenges = json_object_get (policy,
                                    "challenges");
      if (NULL == challenges)
      {
        GNUNET_break_op (0);
        AG_error ("Policy did not parse correctly");
        return;
      }
      json_array_foreach (challenges, index, challenge)
      {
        const char *uuid = json_string_value (json_object_get (challenge,
                                                               "uuid"));
        const json_t *cs;
        const char *type;
        const char *provider;
        const char *instructions;
        bool solved = false;
        struct GNUNET_JSON_Specification cspec[] = {
          GNUNET_JSON_spec_string ("type",
                                   &type),
          GNUNET_JSON_spec_string ("url",
                                   &provider),
          GNUNET_JSON_spec_string ("instructions",
                                   &instructions),
          GNUNET_JSON_spec_mark_optional (
            GNUNET_JSON_spec_bool ("solved",
                                   &solved)),
          GNUNET_JSON_spec_end ()
        };
        struct TALER_Amount recovery_cost;

        GNUNET_assert (NULL != uuid);
        cs = find_challenge_by_uuid (uuid);
        if (NULL == cs)
        {
          GNUNET_break_op (0);
          AG_error ("Policy did not parse correctly");
          return;
        }
        if (GNUNET_OK !=
            GNUNET_JSON_parse (cs,
                               cspec,
                               NULL, NULL))
        {
          GNUNET_break_op (0);
          AG_error ("Policy did not parse correctly");
          return;
        }

        if (GNUNET_OK !=
            lookup_recovery_cost (provider,
                                  type,
                                  &recovery_cost))
        {
          GNUNET_break_op (0);
          AG_error ("Policy did not parse correctly");
          return;
        }
        gtk_tree_store_insert_with_values (ts,
                                           NULL,
                                           &piter, /* parent */
                                           -1, /* append */
                                           AG_PRMC_POLICY_NAME,
                                           instructions,
                                           AG_PRMC_METHOD_TYPE,
                                           type,
                                           AG_PRMC_COST,
                                           TALER_amount2s (&recovery_cost),
                                           AG_PRMC_PROVIDER_URL,
                                           provider,
                                           AG_PRMC_WAS_SOLVED,
                                           solved,
                                           -1);
        if (NULL == summary)
        {
          summary = GNUNET_strdup (type);
        }
        else
        {
          char *tmp;

          GNUNET_asprintf (&tmp,
                           "%s + %s",
                           summary,
                           type);
          GNUNET_free (summary);
          summary = tmp;
        }
      } /* for each challenge */
      if (NULL != summary)
      {
        gtk_tree_store_set (ts,
                            &piter,
                            AG_PRMC_POLICY_NAME, summary,
                            -1);
        GNUNET_free (summary);
      }
    } /* for each policy */
  }
  {
    GtkTreeView *tv;

    tv = GTK_TREE_VIEW (GCG_get_main_window_object (
                          "anastasis_gtk_choose_policy_treeview"));
    gtk_tree_view_expand_all (tv);
  }
  AG_sensitive ("anastasis_gtk_review_policy_treeview");
  AG_show ("anastasis_gtk_progress_vbox");
  AG_progress_update ();
  AG_show ("anastasis_gtk_recovery_progress_scrolled_window");
  AG_hide ("anastasis_gtk_backup_progress_scrolled_window");
  AG_show ("anastasis_gtk_main_control_vbox");
  AG_show ("anastasis_gtk_main_window_save_as_button");
  AG_show ("anastasis_gtk_challenge_frame");
  AG_show ("anastasis_gtk_main_window_prev_button");
  AG_hide ("anastasis_gtk_main_window_quit_button");
  AG_hide ("anastasis_gtk_main_window_forward_button");
}


/**
 * An Anastasis provider requires payment for a challenge.
 * Give opportunity to the user to pay.
 */
static void
action_challenge_paying (void)
{
  json_t *pprs;
  json_t *ppr;
  GtkListStore *ls;
  const char *uuid;
  bool found = false;
  const char *ps;

  AG_hide_all_frames ();
  ls = GTK_LIST_STORE (GCG_get_main_window_object (
                         "unpaid_qrcodes_liststore"));
  gtk_list_store_clear (ls);
  pprs = json_object_get (AG_redux_state,
                          "challenge_feedback");
  json_object_foreach (pprs, uuid, ppr)
  {
    const char *state;
    const char *payto = NULL;
    const char *provider = NULL;
    struct GNUNET_JSON_Specification spec[] = {
      GNUNET_JSON_spec_string ("state",
                               &state),
      GNUNET_JSON_spec_mark_optional (
        GNUNET_JSON_spec_string ("taler_pay_uri",
                                 &payto)),
      GNUNET_JSON_spec_mark_optional (
        GNUNET_JSON_spec_string ("provider",
                                 &provider)),
      GNUNET_JSON_spec_mark_optional (
        GNUNET_JSON_spec_string ("payment_secret",
                                 &ps)),
      GNUNET_JSON_spec_end ()
    };
    GdkPixbuf *pb;

    if (GNUNET_OK !=
        GNUNET_JSON_parse (ppr,
                           spec,
                           NULL, NULL))
    {
      GNUNET_break (0);
      json_dumpf (ppr,
                  stderr,
                  JSON_INDENT (2));
      continue;
    }
    if (NULL == payto)
      continue;
    if (0 != strcmp (state,
                     "payment"))
      continue;
    found = true;
    pb = setup_qrcode ("unpaid_qr_treeview",
                       payto,
                       strlen (payto));
    if (NULL == pb)
      GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                  _ ("Failed to initialize QR-code pixbuf for `%s'\n"),
                  payto);
    gtk_list_store_insert_with_values (ls,
                                       NULL,
                                       -1, /* append */
                                       AG_UQRMC_QR_IMAGE, pb,
                                       AG_UQRMC_URL, payto,
                                       AG_UQRMC_PROVIDER, provider,
                                       -1);
    g_object_unref (pb);
    break;
  }

  if (found)
  {
    json_t *args;
    struct GNUNET_TIME_Relative timeout;

    timeout = GNUNET_TIME_UNIT_MINUTES;
    GNUNET_assert (NULL == AG_ra);
    args = GNUNET_JSON_PACK (
      GNUNET_JSON_pack_time_rel ("timeout",
                                 timeout),
      GNUNET_JSON_pack_string ("payment_secret",
                               ps));
    AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                    "pay",
                                    args,
                                    &AG_action_cb,
                                    NULL);
    json_decref (args);
  }
  else
  {
    AG_error ("ERROR: Internal error: should pay, but do not know what");
  }
  AG_show ("anastasis_gtk_progress_vbox");
  AG_progress_update ();
  AG_show ("anastasis_gtk_recovery_progress_scrolled_window");
  AG_hide ("anastasis_gtk_backup_progress_scrolled_window");
  AG_show ("anastasis_gtk_pay_frame");
  AG_show ("anastasis_gtk_pay_image");
  AG_show ("anastasis_gtk_main_control_vbox");
  AG_sensitive ("anastasis_gtk_main_window_prev_button");
  AG_show ("anastasis_gtk_main_window_prev_button");
  AG_hide ("anastasis_gtk_main_window_forward_button");
}


/**
 * Render challenge feedback for challenge @a uuid_str in a dialog of
 * @a builder in the label under @a target_widget.
 *
 * @param builder a builder to get widgets from
 * @param target_widget the widget to upate
 * @param uuid_str the UUID to render feedback for
 */
static void
render_feedback (GtkBuilder *builder,
                 const char *target_widget,
                 const char *uuid_str)
{
  json_t *cf;
  json_t *cs;
  const char *state;
  const char *redirect_url = NULL;
  const char *hint = NULL;
  json_t *details = NULL;
  const char *taler_pay_uri = NULL;
  uint32_t ec = 0;
  uint32_t http_status = 0;
  struct GNUNET_JSON_Specification spec[] = {
    GNUNET_JSON_spec_string ("state",
                             &state),
    GNUNET_JSON_spec_mark_optional (
      GNUNET_JSON_spec_string ("taler_pay_uri",
                               &taler_pay_uri)),
    GNUNET_JSON_spec_mark_optional (
      GNUNET_JSON_spec_json ("details",
                             &details)),
    GNUNET_JSON_spec_mark_optional (
      GNUNET_JSON_spec_string ("redirect_url",
                               &redirect_url)),
    GNUNET_JSON_spec_mark_optional (
      GNUNET_JSON_spec_string ("hint",
                               &hint)),
    GNUNET_JSON_spec_mark_optional (
      GNUNET_JSON_spec_uint32 ("http_status",
                               &http_status)),
    GNUNET_JSON_spec_mark_optional (
      GNUNET_JSON_spec_uint32 ("error_code",
                               &ec)),
    GNUNET_JSON_spec_end ()
  };
  GtkLabel *elabel;
  char *msg;

  cf = json_object_get (AG_redux_state,
                        "challenge_feedback");
  cs = json_object_get (cf,
                        uuid_str);
  if (NULL == cs)
    return;

  elabel = GTK_LABEL (gtk_builder_get_object (builder,
                                              target_widget));
  if (NULL == elabel)
  {
    GNUNET_break (0);
    return;
  }
  if (GNUNET_OK !=
      GNUNET_JSON_parse (cs,
                         spec,
                         NULL, NULL))
  {
    GNUNET_break (0);
    gtk_label_set_text (elabel,
                        _ ("INTERNAL ERROR: could not parse state"));
    gtk_widget_show (GTK_WIDGET (elabel));
    return;
  }
  if ( (0 == strcmp (state,
                     "hint")) &&
       (NULL != hint) )
  {
    GNUNET_asprintf (&msg,
                     _ ("Hint (#%u): %s"),
                     (unsigned int) http_status,
                     dgettext ("taler-exchange",
                               hint));
  }
  else if ( (0 == strcmp (state,
                          "details")) &&
            (NULL != details) )
  {
    uint32_t code;
    const char *hint = NULL;
    const char *detail = NULL;
    struct GNUNET_JSON_Specification ispec[] = {
      GNUNET_JSON_spec_uint32 ("code",
                               &code),
      GNUNET_JSON_spec_mark_optional (
        GNUNET_JSON_spec_string ("hint",
                                 &hint)),
      GNUNET_JSON_spec_mark_optional (
        GNUNET_JSON_spec_string ("detail",
                                 &detail)),
      GNUNET_JSON_spec_end ()
    };

    if (GNUNET_OK !=
        GNUNET_JSON_parse (details,
                           ispec,
                           NULL, NULL))
    {
      GNUNET_break (0);
      json_dumpf (details,
                  stderr,
                  JSON_INDENT (2));
      msg = GNUNET_strdup (
        _ ("ERROR: failed to parse server JSON instructions"));
    }
    else
    {
      const char *ihint;

      ihint = TALER_ErrorCode_get_hint (code);
      if ( (NULL != hint) &&
           ( (NULL == ihint) ||
             ('<' == ihint[0])) )
        ihint = hint;           /* use server hint */
      ihint = dgettext ("taler-exchange",
                        ihint);
      if (NULL == detail)
      {
        if (NULL == ihint)
          GNUNET_asprintf (&msg,
                           "Error #%u",
                           (unsigned int) code);
        else
          GNUNET_asprintf (&msg,
                           "Error #%u: %s",
                           (unsigned int) code,
                           ihint);
      }
      else
      {
        if (NULL == ihint)
          GNUNET_asprintf (&msg,
                           "Error #%u (%s)",
                           (unsigned int) code,
                           detail);
        else
          GNUNET_asprintf (&msg,
                           "Error #%u: %s (%s)",
                           (unsigned int) code,
                           ihint,
                           detail);
      }
    }
  }
  else
  {
    GNUNET_asprintf (&msg,
                     "ERROR: state `%s` with HTTP Status %u",
                     state,
                     (unsigned int) http_status);
  }
  gtk_label_set_text (elabel,
                      msg);
  GNUNET_free (msg);
  gtk_widget_show (GTK_WIDGET (elabel));
  GNUNET_JSON_parse_free (spec);
}


/**
 * Open dialog to allow user to answer security question.
 *
 * @param details details about the challenge
 * @return the dialog object, or NULL on error
 */
static GtkDialog *
diag_question (const json_t *details)
{
  GtkBuilder *builder;
  GtkDialog *ad;

  builder = GNUNET_GTK_get_new_builder (
    "anastasis_gtk_challenge_question.glade",
    NULL);
  if (NULL == builder)
  {
    GNUNET_break (0);
    return NULL;
  }
  ad = GTK_DIALOG (gtk_builder_get_object (builder,
                                           "anastasis_gtk_c_question_dialog"));
  {
    GtkLabel *label;
    const char *instructions;

    label = GTK_LABEL (gtk_builder_get_object (builder,
                                               "security_question_label"));
    instructions = json_string_value (json_object_get (details,
                                                       "instructions"));
    gtk_label_set_text (label,
                        instructions);
  }
  {
    const char *uuid_str;

    uuid_str = json_string_value (json_object_get (details,
                                                   "uuid"));
    /* Why do we do this? */
    render_feedback (builder,
                     "anastasis_gtk_c_question_error_label",
                     uuid_str);
  }
  return ad;
}


/**
 * Create a dialog for the user to enter a PIN code.
 *
 * @param details details about the dialog to render
 * @return dialog object
 */
static GtkDialog *
diag_code (const json_t *details)
{
  GtkBuilder *builder;
  const char *instructions;
  const char *uuid_str;
  struct GNUNET_JSON_Specification spec[] = {
    GNUNET_JSON_spec_string ("instructions",
                             &instructions),
    GNUNET_JSON_spec_string ("uuid",
                             &uuid_str),
    GNUNET_JSON_spec_end ()
  };

  if (GNUNET_OK !=
      GNUNET_JSON_parse (details,
                         spec,
                         NULL, NULL))
  {
    GNUNET_break (0);
    json_dumpf (details,
                stderr,
                JSON_INDENT (2));
    return NULL;
  }

  builder = GNUNET_GTK_get_new_builder ("anastasis_gtk_challenge_code.glade",
                                        NULL);
  if (NULL == builder)
  {
    GNUNET_break (0);
    return NULL;
  }
  {
    GtkLabel *label;

    label = GTK_LABEL (gtk_builder_get_object (builder,
                                               "challenge_instructions_label"));
    gtk_label_set_text (label,
                        instructions);
    label = GTK_LABEL (gtk_builder_get_object (builder,
                                               "anastasis_gtk_c_challenge_label"));
    gtk_label_set_text (label,
                        uuid_str);
    /* Why do we do this? */
    render_feedback (builder,
                     "anastasis_gtk_c_code_error_label",
                     uuid_str);
  }
  {
    GtkDialog *ad;

    ad = GTK_DIALOG (gtk_builder_get_object (builder,
                                             "anastasis_gtk_c_code_dialog"));
    return ad;
  }
}


/**
 * Create a dialog for the user to make an IBAN transfer.
 *
 * @param details details about the dialog to render
 * @return dialog object
 */
static GtkDialog *
diag_iban (const json_t *details)
{
  GtkBuilder *builder;
  struct TALER_Amount amount;
  const char *credit_iban;
  const char *business;
  const char *subject;
  const char *uuid_str;
  const char *debit_iban_hint;
  struct GNUNET_JSON_Specification spec[] = {
    GNUNET_JSON_spec_string ("uuid",
                             &uuid_str),
    GNUNET_JSON_spec_string ("instructions",
                             &debit_iban_hint),
    GNUNET_JSON_spec_end ()
  };

  if (GNUNET_OK !=
      GNUNET_JSON_parse (details,
                         spec,
                         NULL, NULL))
  {
    GNUNET_break (0);
    json_dumpf (details,
                stderr,
                JSON_INDENT (2));
    return NULL;
  }
  {
    json_t *cf = json_object_get (AG_redux_state,
                                  "challenge_feedback");
    json_t *ci = json_object_get (cf,
                                  uuid_str);
    json_t *cd = json_object_get (ci,
                                  "details");
    struct GNUNET_JSON_Specification ispec[] = {
      TALER_JSON_spec_amount_any ("challenge_amount",
                                  &amount),
      GNUNET_JSON_spec_string ("credit_iban",
                               &credit_iban),
      GNUNET_JSON_spec_string ("business_name",
                               &business),
      GNUNET_JSON_spec_string ("wire_transfer_subject",
                               &subject),
      GNUNET_JSON_spec_end ()
    };

    if ( (NULL == cd) ||
         (GNUNET_OK !=
          GNUNET_JSON_parse (cd,
                             ispec,
                             NULL, NULL)) )
    {
      GNUNET_break (0);
      json_dumpf (AG_redux_state,
                  stderr,
                  JSON_INDENT (2));
      return NULL;
    }
  }

  builder = GNUNET_GTK_get_new_builder ("anastasis_gtk_challenge_iban.glade",
                                        NULL);
  if (NULL == builder)
  {
    GNUNET_break (0);
    return NULL;
  }
  {
    GtkLabel *label;

    label = GTK_LABEL (gtk_builder_get_object (builder,
                                               "debit_account_label"));
    gtk_label_set_text (label,
                        debit_iban_hint);
    label = GTK_LABEL (gtk_builder_get_object (builder,
                                               "credit_account_label"));
    gtk_label_set_text (label,
                        credit_iban);
    label = GTK_LABEL (gtk_builder_get_object (builder,
                                               "provider_name_label"));
    gtk_label_set_text (label,
                        business);
    label = GTK_LABEL (gtk_builder_get_object (builder,
                                               "wire_transfer_subject_label"));
    gtk_label_set_text (label,
                        subject);
    label = GTK_LABEL (gtk_builder_get_object (builder,
                                               "amount_label"));
    gtk_label_set_text (label,
                        TALER_amount2s (&amount));
  }

  {
    GtkDialog *ad;

    ad = GTK_DIALOG (gtk_builder_get_object (builder,
                                             "anastasis_gtk_c_iban_dialog"));
    return ad;
  }
}


/**
 * The user wants to solve the selected challenge. Launch the
 * dialog to allow the user to enter the solution.
 */
static void
action_challenge_solving (void)
{
  struct
  {
    const char *type;
    GtkDialog *(*ctor)(const json_t *details);
  } type_map [] = {
    { .type = gettext_noop ("question"),
      .ctor = &diag_question },
    { .type = gettext_noop ("sms"),
      .ctor = &diag_code },
    { .type = gettext_noop ("post"),
      .ctor = &diag_code },
    { .type = gettext_noop ("email"),
      .ctor = &diag_code },
    { .type = gettext_noop ("iban"),
      .ctor = &diag_iban },
    { .type = NULL,
      .ctor = NULL }
  };
  const char *type;
  GtkDialog *diag;
  const char *uuid;
  const json_t *challenge;

  uuid = json_string_value (json_object_get (AG_redux_state,
                                             "selected_challenge_uuid"));
  if (NULL == uuid)
  {
    GNUNET_break (0);
    return;
  }
  challenge = find_challenge_by_uuid (uuid);
  if (NULL == challenge)
  {
    GNUNET_break (0);
    return;
  }
  type = json_string_value (json_object_get (challenge,
                                             "type"));
  if (NULL == type)
  {
    GNUNET_break (0);
    return;
  }
  /* create dialog based on challenge type */
  diag = NULL;
  for (unsigned int i = 0; NULL != type_map[i].type; i++)
  {
    if (0 != strcmp (type_map[i].type,
                     type))
      continue;
    diag = type_map[i].ctor (challenge);
    break;
  }
  if (NULL == diag)
  {
    GNUNET_break (0);
    return;
  }
  /* show dialog */
  {
    GtkWidget *toplevel;
    GtkBox *box;

    box = GTK_BOX (GCG_get_main_window_object (
                     "anastasis_gtk_open_challenge_box"));
    toplevel = gtk_widget_get_toplevel (GTK_WIDGET (box));
    gtk_window_set_transient_for (GTK_WINDOW (diag),
                                  GTK_WINDOW (toplevel));
    gtk_window_present (GTK_WINDOW (diag));
  }
}


/**
 * The recovery process was finished. Show the recovered secret to the
 * user.
 */
static void
action_recovery_finished (void)
{
  const char *mime = NULL;
  const char *text = NULL;
  const char *name = NULL;
  void *data = NULL;
  size_t data_size = 0;
  const json_t *cs;
  struct GNUNET_JSON_Specification spec[] = {
    GNUNET_JSON_spec_mark_optional (
      GNUNET_JSON_spec_string ("mime",
                               &mime)),
    GNUNET_JSON_spec_mark_optional (
      GNUNET_JSON_spec_string ("text",
                               &text)),
    GNUNET_JSON_spec_mark_optional (
      GNUNET_JSON_spec_varsize ("value",
                                &data,
                                &data_size)),
    GNUNET_JSON_spec_end ()
  };
  GdkPixbuf *pb;
  GtkImage *img;

  AG_hide_all_frames ();
  name = json_string_value (json_object_get (json_object_get (AG_redux_state,
                                                              "recovery_information"),
                                             "secret_name"));

  cs = json_object_get (AG_redux_state,
                        "core_secret");
  GNUNET_assert (NULL != cs);
  GNUNET_assert (GNUNET_OK ==
                 GNUNET_JSON_parse (cs,
                                    spec,
                                    NULL, NULL));
  AG_hide ("anastasis_gtk_secret_copy_button");
  update_label ("anastasis_gtk_secret_value_label",
                text);
  if ( (NULL != name) &&
       (0 != strlen (name)) )
    update_label ("recovery_secret_name_value_label",
                  name);
  else
    update_label ("recovery_secret_name_value_label",
                  _ ("You did not name this secret"));
  if ( (0 == strncasecmp (mime,
                          "text/",
                          strlen ("text/"))) ||
       (0 == strncasecmp (mime,
                          "image/",
                          strlen ("image/"))) ||
       (NULL != text) )
  {
    /* images and text can be copied */
    AG_show ("anastasis_gtk_secret_copy_button");
  }
  pb = NULL;
  if (NULL != text)
  {
    pb = setup_qrcode ("anastasis_gtk_secret_qr_image",
                       text,
                       strlen (text));
  }
  else
  {
    pb = setup_qrcode ("anastasis_gtk_secret_qr_image",
                       data,
                       data_size);
  }
  if (NULL != pb)
  {
    img = GTK_IMAGE (GCG_get_main_window_object (
                       "anastasis_gtk_secret_qr_image"));
    gtk_image_set_from_pixbuf (img,
                               pb);
    g_object_unref (pb);
  }
  else
  {
    AG_hide ("anastasis_gtk_secret_qr_image");
  }
  GNUNET_JSON_parse_free (spec);
  AG_hide ("anastasis_gtk_progress_vbox");
  AG_hide ("anastasis_gtk_recovery_progress_scrolled_window");
  AG_hide ("anastasis_gtk_backup_progress_scrolled_window");
  AG_show ("anastasis_gtk_completed_frame");
  AG_hide ("anastasis_gtk_backup_complete_box");
  AG_hide ("anastasis_gtk_success_backup_label");
  AG_show ("anastasis_gtk_success_recovery_box");
  AG_show ("anastasis_gtk_completed_image");
  AG_show ("anastasis_gtk_main_control_vbox");
  AG_hide ("anastasis_gtk_main_window_save_as_button");
  AG_show ("anastasis_gtk_restart_button");
  AG_show ("anastasis_gtk_main_window_quit_button");
  AG_hide ("anastasis_gtk_main_window_prev_button");
  AG_hide ("anastasis_gtk_main_window_forward_button");
}


/**
 * Function called with the results of #ANASTASIS_redux_action.
 *
 * @param cls closure
 * @param error_code Error code
 * @param response new state as result or config information of a provider
 */
void
AG_action_cb (void *cls,
              enum TALER_ErrorCode error_code,
              json_t *response)
{
  struct DispatchItem actions[] = {
    { .state = "CONTINENT_SELECTING",
      .action = &action_continent_selecting },
    { .state = "COUNTRY_SELECTING",
      .action = &action_country_selecting },
    { .state = "USER_ATTRIBUTES_COLLECTING",
      .action = &action_user_attributes_collecting },
    { .state = "AUTHENTICATIONS_EDITING",
      .action = &action_authentications_editing },
    { .state = "POLICIES_REVIEWING",
      .action = &action_policies_reviewing },
    { .state = "SECRET_EDITING",
      .action = &action_secret_editing },
    { .state = "TRUTHS_PAYING",
      .action = &action_truths_paying },
    { .state = "POLICIES_PAYING",
      .action = &action_policies_paying },
    { .state = "BACKUP_FINISHED",
      .action = &action_backup_finished },
    { .state = "SECRET_SELECTING",
      .action = &action_secret_selecting },
    { .state = "CHALLENGE_SELECTING",
      .action = &action_challenge_selecting },
    { .state = "CHALLENGE_PAYING",
      .action = &action_challenge_paying },
    { .state = "CHALLENGE_SOLVING",
      .action = &action_challenge_solving },
    { .state = "RECOVERY_FINISHED",
      .action = &action_recovery_finished },
    { .state = NULL,
      .action = NULL }
  };

  (void) cls;
  AG_ra = NULL;
  AG_thaw ();
#if DEBUG
  fprintf (stderr,
           "Action result %d\n",
           error_code);
  json_dumpf (response,
              stderr,
              JSON_INDENT (2));
  fprintf (stderr,
           "END action result %d\n",
           error_code);
#endif
  if (TALER_EC_NONE != error_code)
  {
    /* TODO: maybe also render 'detail'
       if present in state? */
    AG_error ("Error #%d: %s\n",
              (int) error_code,
              TALER_ErrorCode_get_hint (error_code));
    if (AG_in_action)
    {
      GNUNET_break (0);
      return;
    }
  }
  if ( (NULL != json_object_get (response,
                                 "backup_state")) ||
       (NULL != json_object_get (response,
                                 "recovery_state")) )
  {
    json_decref (AG_redux_state);
    AG_stop_long_action ();
    AG_redux_state = json_incref (response);
  }
  if ( (TALER_EC_ANASTASIS_TRUTH_UNKNOWN == error_code) ||
       (TALER_EC_ANASTASIS_TRUTH_RATE_LIMITED == error_code) )
  {
    /* special case: do not remain in previous (challenge selected)
       state but revert to challenge selecting */
    GNUNET_assert (0 ==
                   json_object_set_new (AG_redux_state,
                                        "recovery_state",
                                        json_string ("CHALLENGE_SELECTING")));
  }
  if ( (TALER_EC_ANASTASIS_REDUCER_NETWORK_FAILED == error_code) ||
       (TALER_EC_ANASTASIS_REDUCER_POLICY_MALFORMED == error_code) ||
       (TALER_EC_ANASTASIS_REDUCER_POLICY_LOOKUP_FAILED == error_code) )
  {
    /* special case: do not remain in previous (enter identity)
       state but advance to secret selecting */
    GNUNET_assert (0 ==
                   json_object_set_new (AG_redux_state,
                                        "recovery_state",
                                        json_string ("SECRET_SELECTING")));
  }
  AG_in_action = true;
  if (GNUNET_OK ==
      AG_dispatch (actions))
  {
    AG_in_action = false;
    return;
  }
  AG_in_action = false;
  AG_error ("Unhandled state `%s/%s'",
            json_string_value (json_object_get (AG_redux_state,
                                                "backup_state")),
            json_string_value (json_object_get (AG_redux_state,
                                                "recovery_state")));
  json_dumpf (AG_redux_state,
              stderr,
              JSON_INDENT (2));
  json_decref (AG_redux_state);
  AG_redux_state = NULL;
  AG_hide_all_frames ();
  AG_show ("anastasis_gtk_start_frame");
}
