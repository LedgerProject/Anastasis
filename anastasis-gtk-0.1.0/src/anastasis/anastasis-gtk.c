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
 * @file src/anastasis/anastasis-gtk.c
 * @brief Main function of anastasis-gtk
 * @author Christian Grothoff
 * @author Dennis Neufeld
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_helper.h"
#include <jansson.h>

/**
 * Handle to our main loop.
 */
struct GNUNET_GTK_MainLoop *AG_ml;

/**
 * Our configuration.
 */
const struct GNUNET_CONFIGURATION_Handle *AG_cfg;

/**
 * Closure for #GNUNET_CURL_gnunet_scheduler_reschedule().
 */
static struct GNUNET_CURL_RescheduleContext *rc;

/**
 * Hash map from UUID hashes to GtkWidgets.
 */
struct GNUNET_CONTAINER_MultiHashMap *AG_entry_attributes;

/**
 * Curl context for communication with taler backend
 */
static struct GNUNET_CURL_Context *ctx;

/**
 * Handle to an ongoing action.
 */
struct ANASTASIS_ReduxAction *AG_ra;

/**
 * Handle to an ongoing background action.
 */
struct ANASTASIS_ReduxAction *AG_long_action;

/**
 * Handle to task to reschedule #AG_long_action.
 */
struct GNUNET_SCHEDULER_Task *AG_long_task;


/**
 * Actual state.
 */
json_t *AG_redux_state;


/**
 * Callback invoked if the the "show animation"-menuitem (Help) is clicked.
 *
 * @param menuitem the object which received the signal.
 * @param user_data user data set when the signal handler was connected.
 */
void
anastasis_gtk_animation_activate_cb (GtkMenuItem *menuitem,
                                     gpointer user_data)
{
  static const struct
  {
    const char *png;
    const char *widget;
  } map[] = {
    { .png = "continent_selection.jpg",
      .widget = "anastasis_gtk_continent_selection_image" },
    { .png = "country_selection.jpg",
      .widget = "anastasis_gtk_country_selection_image" },
    { .png = "user_attributes.png",
      .widget = "anastasis_gtk_user_attributes_image" },
    { .png = "authentication_methods.png",
      .widget = "anastasis_gtk_b_authentication_methods_image" },
    { .png = "policy_confirmation.png",
      .widget = "anastasis_gtk_b_policies_image" },
    { .png = "enter_secret.jpg",
      .widget = "anastasis_gtk_enter_secret_image" },
    { .png = "pay_with_taler.png",
      .widget = "anastasis_gtk_pay_image" },
    { .png = NULL,
      .widget = NULL },
    { .png = NULL,
      .widget = "anastasis_gtk_completed_image" }
  };
  char *path;

  if (gtk_widget_is_visible (GTK_WIDGET (GCG_get_main_window_object (
                                           "anastasis_gtk_illustration_vbox"))))
  {
    AG_hide ("anastasis_gtk_illustration_vbox");
    return;
  }
  AG_show ("anastasis_gtk_illustration_vbox");
  path = GNUNET_OS_installation_get_path (GNUNET_OS_IPK_PREFIX);
  if (NULL == path)
  {
    GNUNET_break (0);
    return;
  }
  for (unsigned int i = 0; NULL != map[i].png; i++)
  {
    GObject *img;

    img = GCG_get_main_window_object (map[i].widget);
    if (NULL == img)
    {
      GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                  "Could not find widget `%s' to set image path\n",
                  map[i].widget);
    }
    else
    {
      char *ip;

      GNUNET_asprintf (&ip,
                       "%s/share/anastasis/%s",
                       path,
                       map[i].png);
      gtk_image_set_from_file (GTK_IMAGE (img),
                               ip);
      GNUNET_free (ip);
    }
  }
  GNUNET_free (path);
}


void
AG_stop_long_action (void)
{
  if (NULL != AG_long_action)
  {
    ANASTASIS_redux_action_cancel (AG_long_action);
    AG_long_action = NULL;
  }
  if (NULL != AG_long_task)
  {
    GNUNET_SCHEDULER_cancel (AG_long_task);
    AG_long_task = NULL;
  }
}


/**
 * Task run on shutdown.
 *
 * @param cls unused
 */
static void
shutdown_task (void *cls)
{
  (void) cls;
  GNUNET_log (GNUNET_ERROR_TYPE_INFO,
              "Shutdown initiated\n");
  ANASTASIS_redux_done ();
  if (NULL != AG_ra)
  {
    ANASTASIS_redux_action_cancel (AG_ra);
    AG_ra = NULL;
  }
  AG_stop_long_action ();
  if (NULL != ctx)
  {
    GNUNET_CURL_fini (ctx);
    ctx = NULL;
  }
  if (NULL != rc)
  {
    GNUNET_CURL_gnunet_rc_destroy (rc);
    rc = NULL;
  }
  GNUNET_GTK_main_loop_quit (AG_ml);
  AG_ml = NULL;
  GNUNET_CONTAINER_multihashmap_destroy (AG_entry_attributes);
  AG_entry_attributes = NULL;
  GNUNET_log (GNUNET_ERROR_TYPE_INFO,
              "Shutdown complete\n");
}


/**
 * Callback invoked if the application is supposed to exit.
 *
 * @param object
 * @param user_data unused
 */
void
anastasis_gtk_quit_cb (GObject *object,
                       gpointer user_data)
{
  GNUNET_SCHEDULER_shutdown ();
}


/**
 * User clicked the "quit" button.
 *
 * @param button the button
 * @param user_data unused
 */
void
anastasis_gtk_main_window_quit_button_clicked_cb (GtkButton *button,
                                                  gpointer user_data)
{
  GNUNET_SCHEDULER_shutdown ();
}


void
AG_load (const char *filename)
{
  json_error_t error;
  json_t *in;

  in = json_load_file (filename,
                       JSON_REJECT_DUPLICATES,
                       &error);
  if (NULL == in)
  {
    AG_error ("Failed to parse file `%s' at %d:%d: %s\n",
              filename,
              error.line,
              error.column,
              error.text);
    return;
  }
  AG_action_cb (NULL,
                TALER_EC_NONE,
                in);
  json_decref (in);
}


/**
 * Actual main function run right after GNUnet's scheduler
 * is initialized.  Initializes up GTK and Glade.
 *
 * @param cls NULL
 */
static void
run (void *cls)
{
  GtkWidget *main_window;
  int argc;
  char *const *argv;

  AG_ml = cls;
  AG_entry_attributes = GNUNET_CONTAINER_multihashmap_create (16,
                                                              GNUNET_NO);
  GNUNET_GTK_set_icon_search_path ();
  GNUNET_OS_init (ANASTASIS_project_data_default ());
  GNUNET_GTK_setup_nls ();
  if (GNUNET_OK !=
      GNUNET_GTK_main_loop_build_window (AG_ml,
                                         NULL))
    return;
  AG_cfg = GNUNET_GTK_main_loop_get_configuration (AG_ml);
  GNUNET_GTK_main_loop_get_args (AG_ml,
                                 &argc,
                                 &argv);
  /* setup main window */
  main_window = GTK_WIDGET (
    GCG_get_main_window_object ("anastasis_gtk_main_window"));
  gtk_window_maximize (GTK_WINDOW (main_window));
  /* make GUI visible */
  gtk_widget_show (main_window);
  gtk_window_present (GTK_WINDOW (main_window));
  GNUNET_SCHEDULER_add_shutdown (&shutdown_task,
                                 NULL);
  /* initialize HTTP client */
  ctx = GNUNET_CURL_init (&GNUNET_CURL_gnunet_scheduler_reschedule,
                          &rc);
  rc = GNUNET_CURL_gnunet_rc_create (ctx);
  ANASTASIS_redux_init (ctx);
  if (0 != argc)
    AG_load (argv[0]);
}


/**
 * Main function of anastasis-gtk.
 *
 * @param argc number of arguments
 * @param argv arguments
 * @return 0 on success
 */
int
main (int argc,
      char *const *argv)
{
  struct GNUNET_GETOPT_CommandLineOption options[] = {
    GNUNET_GETOPT_OPTION_END
  };
  int ret;

  if (GNUNET_OK !=
      GNUNET_GTK_main_loop_start ("anastasis-gtk",
                                  "GTK GUI for Anastasis",
                                  argc,
                                  argv,
                                  options,
                                  "anastasis_gtk_main_window.glade",
                                  &run))
    ret = 1;
  else
    ret = 0;
  return ret;
}


/* end of anastasis-gtk.c */
