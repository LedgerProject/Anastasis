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
 * @file src/anastasis/anastasis-gtk_handle-secret-buttons.c
 * @brief Main function of anastasis-gtk
 * @author Christian Grothoff
 * @author Dennis Neufeld
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_handle-expiration-change.h"
#include "anastasis-gtk_helper.h"
#include <jansson.h>
#include <magic.h>


/**
 * Global handle to MAGIC data.
 */
static magic_t magic;


/**
 * Function called from the open-file dialog upon completion.
 *
 * @param dialog the secret selection dialog
 * @param response_id response code from the dialog
 * @param user_data the builder of the dialog
 */
void
open_secret_dialog_response_cb (GtkDialog *dialog,
                                gint response_id,
                                gpointer user_data)
{
  GtkBuilder *builder = GTK_BUILDER (user_data);
  char *filename;
  const char *fn;
  size_t data_size;
  void *data;
  const char *mime;
  GtkEntry *entry;
  const char *name;

  if (GTK_RESPONSE_OK != response_id)
  {
    gtk_widget_destroy (GTK_WIDGET (dialog));
    g_object_unref (G_OBJECT (builder));
    return;
  }
  filename =
    GNUNET_GTK_filechooser_get_filename_utf8 (GTK_FILE_CHOOSER (dialog));
  gtk_widget_destroy (GTK_WIDGET (dialog));
  g_object_unref (G_OBJECT (builder));
  fn = strrchr (filename,
                '/');
  if (NULL == fn)
    fn = filename;
  else
    fn++; /* skip '/' itself */
  {
    struct GNUNET_DISK_FileHandle *fh;
    off_t size;
    enum GNUNET_GenericReturnValue ret;

    fh = GNUNET_DISK_file_open (filename,
                                GNUNET_DISK_OPEN_READ,
                                GNUNET_DISK_PERM_NONE);
    if (NULL == fh)
    {
      AG_error ("Failed to open file `%s': %s",
                filename,
                strerror (errno));
      GNUNET_free (filename);
      return;
    }
    ret = GNUNET_DISK_file_handle_size (fh,
                                        &size);
    if (GNUNET_OK != ret)
    {
      AG_error ("Failed to obtain file size `%s': %s",
                filename,
                strerror (errno));
      GNUNET_free (filename);
      GNUNET_DISK_file_close (fh);
      return;
    }
    data_size = (size_t) size;
    data = GNUNET_malloc_large (data_size);
    if (GNUNET_OK != ret)
    {
      AG_error ("Failed to allocate memory for file `%s': %s",
                filename,
                strerror (errno));
      GNUNET_free (filename);
      GNUNET_DISK_file_close (fh);
      return;
    }
    if (size !=
        GNUNET_DISK_file_read (fh,
                               data,
                               data_size))
    {
      AG_error ("Failed read file `%s': %s",
                filename,
                strerror (errno));
      GNUNET_free (data);
      GNUNET_free (filename);
      GNUNET_DISK_file_close (fh);
      return;
    }
    GNUNET_DISK_file_close (fh);
  }
  entry = GTK_ENTRY (GCG_get_main_window_object (
                       "anastasis_gtk_secret_name_entry"));
  name = gtk_entry_get_text (entry);
  mime = magic_buffer (magic,
                       data,
                       data_size);
  {
    json_t *arguments;
    struct GNUNET_TIME_Absolute expiration;

    expiration = AG_get_desired_expiration ();
    if (0 == expiration.abs_value_us)
    {
      GNUNET_free (data);
      GNUNET_free (filename);
      return; /* failured */
    }
    arguments = json_pack ("{s:s?,s:{s:o,s:s,s:s?},s:o}",
                           "name",
                           name,
                           "secret",
                           "value",
                           GNUNET_JSON_from_data (data,
                                                  data_size),
                           "filename",
                           fn,
                           "mime",
                           mime,
                           "expiration",
                           GNUNET_JSON_from_time_abs (expiration));
    GNUNET_free (filename);
    GNUNET_free (data);
    GNUNET_assert (NULL != arguments);
    AG_freeze ();
    AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                    "enter_secret",
                                    arguments,
                                    &AG_action_cb,
                                    NULL);
    json_decref (arguments);
  }
}


/**
 * User clicked the "open" button in the dialog where the secret is entered.
 *
 * @param button the button
 * @param user_data unused
 */
void
anastasis_gtk_enter_secret_open_button_clicked_cb (GtkButton *button,
                                                   gpointer user_data)
{
  GtkWidget *ad;
  GtkBuilder *builder;

  (void) button;
  (void) user_data;
  builder = GNUNET_GTK_get_new_builder (
    "anastasis_gtk_open_secret_dialog.glade",
    NULL);
  if (NULL == builder)
  {
    GNUNET_break (0);
    return;
  }
  ad = GTK_WIDGET (gtk_builder_get_object (builder,
                                           "open_file_dialog"));
  {
    GtkWidget *toplevel;

    toplevel = gtk_widget_get_toplevel (GTK_WIDGET (button));
    gtk_window_set_transient_for (GTK_WINDOW (ad),
                                  GTK_WINDOW (toplevel));
    gtk_window_present (GTK_WINDOW (ad));
  }
}


/**
 * Function called from the open-directory dialog upon completion.
 *
 * @param dialog the pseudonym selection dialog
 * @param response_id response code from the dialog
 * @param user_data the builder of the dialog
 */
void
save_secret_dialog_response_cb (GtkDialog *dialog,
                                gint response_id,
                                gpointer user_data)
{
  GtkBuilder *builder = GTK_BUILDER (user_data);
  char *filename;
  size_t data_len;
  const char *text;
  void *data;
  json_t *cs;
  struct GNUNET_JSON_Specification cspec[] = {
    GNUNET_JSON_spec_mark_optional (
      GNUNET_JSON_spec_string ("text",
                               &text)),
    GNUNET_JSON_spec_mark_optional (
      GNUNET_JSON_spec_varsize ("value",
                                &data,
                                &data_len)),
    GNUNET_JSON_spec_end ()
  };

  if (GTK_RESPONSE_ACCEPT != response_id)
  {
    gtk_widget_destroy (GTK_WIDGET (dialog));
    g_object_unref (G_OBJECT (builder));
    return;
  }
  filename =
    GNUNET_GTK_filechooser_get_filename_utf8 (GTK_FILE_CHOOSER (dialog));
  gtk_widget_destroy (GTK_WIDGET (dialog));
  g_object_unref (G_OBJECT (builder));
  cs = json_object_get (AG_redux_state,
                        "core_secret");
  GNUNET_assert (NULL != cs);
  if (GNUNET_OK !=
      GNUNET_JSON_parse (cs,
                         cspec,
                         NULL, NULL))
  {
    GNUNET_break (0);
    return;
  }
  {
    enum GNUNET_GenericReturnValue ret;

    ret = GNUNET_DISK_fn_write (filename,
                                (NULL == data)
                                ? text
                                : data,
                                (NULL == data)
                                ? strlen (text)
                                : data_len,
                                GNUNET_DISK_PERM_USER_READ);
    switch (ret)
    {
    case GNUNET_OK:
      break;
    case GNUNET_NO:
      AG_error ("File `%s' exists",
                filename);
      break;
    case GNUNET_SYSERR:
      AG_error ("Writing to file `%s' failed: %s",
                filename,
                strerror (errno));
      break;
    }
  }
  GNUNET_JSON_parse_free (cspec);
  GNUNET_free (filename);
}


/**
 * User clicked the "save as" button in the dialog with the recovered secret.
 *
 * @param button the button
 * @param user_data unused
 */
void
anastasis_gtk_secret_save_as_button_clicked_cb (GtkButton *button,
                                                gpointer user_data)
{
  static const struct
  {
    const char *mime;
    const char *fn;
  } mime_map [] = {
    { .mime = "text/plain",
      .fn = "untitled.txt" },
    { .mime = "text/html",
      .fn = "untitled.html" },
    { .mime = "text/xml",
      .fn = "untitled.xml" },
    { .mime = "text/csv",
      .fn = "untitled.csv" },
    { .mime = "image/jpeg",
      .fn = "untitled.jpeg" },
    { .mime = "image/png",
      .fn = "untitled.png" },
    { .mime = "application/pgp-keys",
      .fn = "untitled.pgp" },
    { .mime = "application/json",
      .fn = "untitled.json" },
    { .mime = "application/taler-wallet-secret",
      .fn = "untitled.tws" },
    { .mime = "application/taler-wallet",
      .fn = "untitled.twd" },
    { .mime = NULL,
      .fn = NULL }
  };

  GtkWidget *ad;
  GtkBuilder *builder;
  const char *mime;
  const char *fn;
  json_t *cs;
  struct GNUNET_JSON_Specification spec[] = {
    GNUNET_JSON_spec_mark_optional (
      GNUNET_JSON_spec_string ("filename",
                               &fn)),
    GNUNET_JSON_spec_mark_optional (
      GNUNET_JSON_spec_string ("mime",
                               &mime)),
    GNUNET_JSON_spec_end ()
  };

  (void) button;
  (void) user_data;
  cs = json_object_get (AG_redux_state,
                        "core_secret");
  GNUNET_assert (NULL != cs);
  GNUNET_assert (GNUNET_OK ==
                 GNUNET_JSON_parse (cs,
                                    spec,
                                    NULL, NULL));
  builder = GNUNET_GTK_get_new_builder (
    "anastasis_gtk_save_secret_dialog.glade",
    NULL);
  if (NULL == builder)
  {
    GNUNET_break (0);
    return;
  }
  ad = GTK_WIDGET (gtk_builder_get_object (builder,
                                           "save_file_dialog"));
  if ( (NULL == fn) &&
       (NULL != mime) )
  {
    fn = "untitled.secret";
    for (unsigned int i = 0; NULL != mime_map[i].mime; i++)
    {
      if (0 != strcmp (mime_map[i].mime,
                       mime))
        continue;
      fn = mime_map[i].fn;
      break;
    }
  }
  gtk_file_chooser_set_current_name (GTK_FILE_CHOOSER (ad),
                                     fn);
  {
    GtkWidget *toplevel;

    toplevel = gtk_widget_get_toplevel (GTK_WIDGET (button));
    gtk_window_set_transient_for (GTK_WINDOW (ad),
                                  GTK_WINDOW (toplevel));
    gtk_window_present (GTK_WINDOW (ad));
  }
}


/**
 * User clicked the "copy" button in the dialog with the recovered secret.
 *
 * @param button the button
 * @param user_data unused
 */
void
anastasis_gtk_secret_copy_button_clicked_cb (GtkButton *button,
                                             gpointer user_data)
{
  size_t data_len;
  void *data;
  const char *mime;
  const char *text;
  json_t *cs;
  struct GNUNET_JSON_Specification spec[] = {
    GNUNET_JSON_spec_mark_optional (
      GNUNET_JSON_spec_varsize ("value",
                                &data,
                                &data_len)),
    GNUNET_JSON_spec_mark_optional (
      GNUNET_JSON_spec_string ("mime",
                               &mime)),
    GNUNET_JSON_spec_mark_optional (
      GNUNET_JSON_spec_string ("text",
                               &text)),
    GNUNET_JSON_spec_end ()
  };
  GtkClipboard *cb;

  (void) button;
  (void) user_data;
  cs = json_object_get (AG_redux_state,
                        "core_secret");
  GNUNET_assert (NULL != cs);
  GNUNET_assert (GNUNET_OK ==
                 GNUNET_JSON_parse (cs,
                                    spec,
                                    NULL, NULL));
  cb = gtk_clipboard_get (GDK_SELECTION_CLIPBOARD);
  GNUNET_assert (NULL != cb);
  if (NULL != text)
  {
    gtk_clipboard_set_text (cb,
                            text,
                            strlen (text));
  }
  else
  {
    if (0 == strncasecmp (mime,
                          "text/",
                          strlen ("text/")))
    {
      gtk_clipboard_set_text (cb,
                              data,
                              data_len);
    }
    else if (0 == strncasecmp (mime,
                               "image/",
                               strlen ("image/")))
    {
      GdkPixbufLoader *loader;

      loader = gdk_pixbuf_loader_new_with_mime_type (mime,
                                                     NULL);
      if (NULL != loader)
      {
        GdkPixbuf *pb;

        gdk_pixbuf_loader_write (loader,
                                 data,
                                 data_len,
                                 NULL);
        pb = gdk_pixbuf_loader_get_pixbuf (loader);
        if (NULL != pb)
        {
          gtk_clipboard_set_image (cb,
                                   pb);
          g_object_unref (pb);
        }
        else
        {
          GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                      "Failed to parse secret image data.\n");
        }
        g_object_unref (loader);
      }
      else
      {
        GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                    "Unsupported image mime type `%s'\n",
                    mime);
      }
    }
    else
    {
      GNUNET_break (0);
    }
  }
  GNUNET_JSON_parse_free (spec);
}


/**
 * Constructor for the library.  Loads the magic file.
 */
void __attribute__ ((constructor))
mime_ltdl_init ()
{
  magic = magic_open (MAGIC_MIME_TYPE);
  if (0 != magic_load (magic,
                       NULL))
  {
    GNUNET_break (0);
  }
}


/**
 * Destructor for the library, cleans up.
 */
void __attribute__ ((destructor))
mime_ltdl_fini ()
{
  if (NULL != magic)
  {
    magic_close (magic);
    magic = NULL;
  }
}
