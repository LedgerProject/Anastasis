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
#include <qrencode.h>
#include <gdk-pixbuf/gdk-pixbuf.h>


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


/**
 * Create a the QR code image from a given @a text.
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


GdkPixbuf *
AG_setup_qrcode (GtkWidget *w,
                 const char *text,
                 size_t text_size)
{
  GdkScreen *screen;
  GtkSettings *settings;
  gint dpi;
  int scale;

  if (NULL == w)
  {
    GNUNET_break (0);
    return NULL;
  }
  /* adjust scale to screen resolution */
  screen = gtk_widget_get_screen (w);
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
