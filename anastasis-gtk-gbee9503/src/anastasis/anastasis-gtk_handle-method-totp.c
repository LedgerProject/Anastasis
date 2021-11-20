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
 * @file src/anastasis/anastasis-gtk_handle-method-totp.c
 * @brief Handle dialogs for TOTP (RFC 6238)
 * @author Christian Grothoff
 */
#include <gnunet/platform.h>
#include <gnunet/gnunet_util_lib.h>
#include "anastasis-gtk_action.h"
#include "anastasis-gtk_helper.h"
#include "anastasis-gtk_handle-identity-changed.h"
#include <jansson.h>
#include <gcrypt.h>

/**
 * How long is a TOTP code valid?
 */
#define TOTP_VALIDITY_PERIOD GNUNET_TIME_relative_multiply ( \
    GNUNET_TIME_UNIT_SECONDS, 30)

/**
 * Range of time we allow (plus-minus).
 */
#define TIME_INTERVAL_RANGE 2

/**
 * How long is the shared secret in bytes?
 */
#define SECRET_LEN 32

/**
 * Random secret used in the current dialog.
 */
static char totp_key[SECRET_LEN];


/**
 * Compute TOTP code at current time with offset
 * @a time_off for the @a key.
 *
 * @param time_off offset to apply when computing the code
 * @return TOTP code at this time
 */
static uint64_t
compute_totp (int time_off)
{
  struct GNUNET_TIME_Absolute now;
  time_t t;
  uint64_t ctr;
  uint8_t hmac[20]; /* SHA1: 20 bytes */

  now = GNUNET_TIME_absolute_get ();
  (void) GNUNET_TIME_round_abs (&now);
  while (time_off < 0)
  {
    now = GNUNET_TIME_absolute_subtract (now,
                                         TOTP_VALIDITY_PERIOD);
    time_off++;
  }
  while (time_off > 0)
  {
    now = GNUNET_TIME_absolute_add (now,
                                    TOTP_VALIDITY_PERIOD);
    time_off--;
  }
  t = now.abs_value_us / GNUNET_TIME_UNIT_SECONDS.rel_value_us;
  ctr = GNUNET_htonll (t / 30LLU);

  {
    gcry_md_hd_t md;
    const unsigned char *mc;

    GNUNET_assert (GPG_ERR_NO_ERROR ==
                   gcry_md_open (&md,
                                 GCRY_MD_SHA1,
                                 GCRY_MD_FLAG_HMAC));
    gcry_md_setkey (md,
                    totp_key,
                    sizeof (totp_key));
    gcry_md_write (md,
                   &ctr,
                   sizeof (ctr));
    mc = gcry_md_read (md,
                       GCRY_MD_SHA1);
    GNUNET_assert (NULL != mc);
    memcpy (hmac,
            mc,
            sizeof (hmac));
    gcry_md_close (md);
  }

  {
    uint32_t code = 0;
    int offset;

    offset = hmac[sizeof (hmac) - 1] & 0x0f;
    for (int count = 0; count < 4; count++)
      code |= hmac[offset + 3 - count] << (8 * count);
    code &= 0x7fffffff;
    /* always use 8 digits (maximum) */
    code = code % 100000000;
    return code;
  }
}


/**
 * Compute RFC 3548 base32 encoding of @a val and write
 * result to @a enc.
 *
 * @param val value to encode
 * @param val_size number of bytes in @a val
 * @param[out] enc where to write the 0-terminated result
 */
static void
base32enc (const void *val,
           size_t val_size,
           char *enc)
{
  /**
   * 32 characters for encoding, using RFC 3548.
   */
  static char *encTable__ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  unsigned int wpos;
  unsigned int rpos;
  unsigned int bits;
  unsigned int vbit;
  const unsigned char *udata;

  udata = val;
  vbit = 0;
  wpos = 0;
  rpos = 0;
  bits = 0;
  while ((rpos < val_size) || (vbit > 0))
  {
    if ((rpos < val_size) && (vbit < 5))
    {
      bits = (bits << 8) | udata[rpos++];     /* eat 8 more bits */
      vbit += 8;
    }
    if (vbit < 5)
    {
      bits <<= (5 - vbit);     /* zero-padding */
      GNUNET_assert (vbit == ((val_size * 8) % 5));
      vbit = 5;
    }
    enc[wpos++] = encTable__[(bits >> (vbit - 5)) & 31];
    vbit -= 5;
  }
  GNUNET_assert (0 == vbit);
  if (wpos < val_size)
    enc[wpos] = '\0';
}


/**
 * Recompute the QR code shown in @a builder from
 * totp and the user's name for the secret.
 *
 * @param builder the dialog builder
 */
static void
refresh_totp (GtkBuilder *builder)
{
  GtkEntry *q;
  const char *name;
  char *u_name;
  char *uri;
  char base_sec[sizeof (totp_key) * 2];
  GdkPixbuf *pb;
  GtkImage *img;

  gtk_widget_set_sensitive (
    GTK_WIDGET (gtk_builder_get_object (builder,
                                        "anastasis_gtk_b_totp_dialog_btn_ok")),
    FALSE);
  q = GTK_ENTRY (gtk_builder_get_object (builder,
                                         "anastasis_gtk_b_totp_dialog_name_entry"));
  name = gtk_entry_get_text (q);
  u_name = TALER_urlencode (name);
  base32enc (totp_key,
             sizeof (totp_key),
             base_sec);
  GNUNET_asprintf (&uri,
                   "otpauth://totp/%s?digits=8&secret=%s",
                   u_name,
                   base_sec);
  GNUNET_free (u_name);
  img = GTK_IMAGE (gtk_builder_get_object (builder,
                                           "qr_image"));
  pb = AG_setup_qrcode (GTK_WIDGET (img),
                        uri,
                        strlen (uri));
  if (NULL != pb)
  {
    gtk_image_set_from_pixbuf (img,
                               pb);
    g_object_unref (pb);
  }
}


/**
 * Function called from the totp dialog upon completion.
 *
 * @param dialog the pseudonym selection dialog
 * @param response_id response code from the dialog
 * @param user_data the builder of the dialog
 */
void
anastasis_gtk_b_totp_dialog_response_cb (GtkDialog *dialog,
                                         gint response_id,
                                         gpointer user_data)
{
  GtkBuilder *builder = GTK_BUILDER (user_data);
  GtkEntry *q;
  const char *name;
  json_t *args;

  if (GTK_RESPONSE_OK != response_id)
  {
    gtk_widget_destroy (GTK_WIDGET (dialog));
    g_object_unref (G_OBJECT (builder));
    return;
  }
  q = GTK_ENTRY (gtk_builder_get_object (builder,
                                         "anastasis_gtk_b_totp_dialog_name_entry"));
  name = gtk_entry_get_text (q);
  args = json_pack ("{ s:{s:s, s:o, s:s}}",
                    "authentication_method",
                    "type",
                    "totp",
                    "challenge",
                    GNUNET_JSON_from_data (totp_key,
                                           sizeof (totp_key)),
                    "instructions",
                    name);
  gtk_widget_destroy (GTK_WIDGET (dialog));
  g_object_unref (G_OBJECT (builder));
  memset (totp_key,
          0,
          sizeof (totp_key));
  AG_freeze ();
  AG_ra = ANASTASIS_redux_action (AG_redux_state,
                                  "add_authentication",
                                  args,
                                  &AG_action_cb,
                                  NULL);
  json_decref (args);
}


void
totp_entry_changed_cb (GtkEntry *entry,
                       gpointer user_data)
{
  GtkBuilder *builder = GTK_BUILDER (user_data);
  GtkWidget *but;
  GtkEntry *q;
  const char *code;
  unsigned int val;
  char dummy;
  bool found = false;

  q = GTK_ENTRY (gtk_builder_get_object (builder,
                                         "totp_entry"));
  code = gtk_entry_get_text (q);
  if (1 != sscanf (code,
                   "%u%c",
                   &val,
                   &dummy))
    return;
  for (int i = -TIME_INTERVAL_RANGE;
       i <= TIME_INTERVAL_RANGE;
       i++)
  {
    if (val == compute_totp (i))
    {
      found = true;
      break;
    }
  }
  if (! found)
    return;
  but = GTK_WIDGET (gtk_builder_get_object (builder,
                                            "anastasis_gtk_b_totp_dialog_btn_ok"));
  gtk_widget_set_sensitive (but,
                            TRUE);
}


void
anastasis_gtk_b_totp_dialog_name_entry_changed_cb (GtkEntry *entry,
                                                   gpointer user_data)
{
  GtkBuilder *builder = GTK_BUILDER (user_data);
  GtkEntry *e;

  /* clear code user already entered, if any */
  e = GTK_ENTRY (gtk_builder_get_object (builder,
                                         "totp_entry"));
  gtk_entry_set_text (e, "");
  refresh_totp (builder);
}


/**
 * Callback invoked if the the "totp"-button is clicked.
 *
 * @param object
 * @param user_data unused
 */
void
anastasis_gtk_btn_add_auth_totp_clicked_cb (GObject *object,
                                            gpointer user_data)
{
  GtkWidget *ad;
  GtkBuilder *builder;

  GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_NONCE,
                              totp_key,
                              sizeof (totp_key));
  builder = GNUNET_GTK_get_new_builder ("anastasis_gtk_auth_add_totp.glade",
                                        NULL);
  if (NULL == builder)
  {
    GNUNET_break (0);
    return;
  }
  ad = GTK_WIDGET (gtk_builder_get_object (builder,
                                           "anastasis_gtk_b_totp_dialog"));
  refresh_totp (builder);
  {
    GtkWidget *toplevel;

    toplevel = gtk_widget_get_toplevel (GTK_WIDGET (object));
    gtk_window_set_transient_for (GTK_WINDOW (ad),
                                  GTK_WINDOW (toplevel));
    gtk_window_present (GTK_WINDOW (ad));
  }
}
