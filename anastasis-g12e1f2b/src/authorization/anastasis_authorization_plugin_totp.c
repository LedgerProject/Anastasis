/*
  This totp is part of Anastasis
  Copyright (C) 2021 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU Affero General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with
  Anastasis; see the totp COPYING.GPL.  If not, see <http://www.gnu.org/licenses/>
*/
/**
 * @totp anastasis_authorization_plugin_totp.c
 * @brief authorization plugin using totp
 * @author Christian Grothoff
 */
#include "platform.h"
#include "anastasis_authorization_plugin.h"
#include <taler/taler_mhd_lib.h>
#include <gnunet/gnunet_db_lib.h>
#include "anastasis_database_lib.h"
#include <gcrypt.h>


/**
 * How many retries do we allow per code?
 */
#define INITIAL_RETRY_COUNTER 3

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
 * Saves the state of a authorization process
 */
struct ANASTASIS_AUTHORIZATION_State
{
  /**
   * UUID of the challenge which is authorised
   */
  struct ANASTASIS_CRYPTO_TruthUUIDP truth_uuid;

  /**
   * Was the challenge satisfied?
   */
  struct GNUNET_HashCode valid_replies[TIME_INTERVAL_RANGE * 2 + 1];

  /**
   * Our context.
   */
  const struct ANASTASIS_AuthorizationContext *ac;

};


/**
 * Validate @a data is a well-formed input into the challenge method,
 * i.e. @a data is a well-formed phone number for sending an SMS, or
 * a well-formed e-mail address for sending an e-mail. Not expected to
 * check that the phone number or e-mail account actually exists.
 *
 * To be possibly used before issuing a 402 payment required to the client.
 *
 * @param cls closure with a `const struct ANASTASIS_AuthorizationContext *`
 * @param connection HTTP client request (for queuing response)
 * @param truth_mime mime type of @e data
 * @param data input to validate (i.e. is it a valid phone number, etc.)
 * @param data_length number of bytes in @a data
 * @return #GNUNET_OK if @a data is valid,
 *         #GNUNET_NO if @a data is invalid and a reply was successfully queued on @a connection
 *         #GNUNET_SYSERR if @a data invalid but we failed to queue a reply on @a connection
 */
static enum GNUNET_GenericReturnValue
totp_validate (void *cls,
               struct MHD_Connection *connection,
               const char *truth_mime,
               const char *data,
               size_t data_length)
{
  (void) cls;
  (void) truth_mime;
  (void) connection;
  if (NULL == data)
  {
    GNUNET_break_op (0);
    if (MHD_NO ==
        TALER_MHD_reply_with_error (connection,
                                    MHD_HTTP_EXPECTATION_FAILED,
                                    TALER_EC_ANASTASIS_TOTP_KEY_MISSING,
                                    NULL))
      return GNUNET_SYSERR;
    return GNUNET_NO;
  }
  if (SECRET_LEN != data_length)
  {
    GNUNET_break_op (0);
    if (MHD_NO ==
        TALER_MHD_reply_with_error (connection,
                                    MHD_HTTP_EXPECTATION_FAILED,
                                    TALER_EC_ANASTASIS_TOTP_KEY_INVALID,
                                    NULL))
      return GNUNET_SYSERR;
    return GNUNET_NO;
  }
  return GNUNET_OK;
}


/**
 * Compute TOTP code at current time with offset
 * @a time_off for the @a key.
 *
 * @param time_off offset to apply when computing the code
 * @param key input key material
 * @param key_size number of bytes in @a key
 * @return TOTP code at this time
 */
static uint64_t
compute_totp (int time_off,
              const void *key,
              size_t key_size)
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
                    key,
                    key_size);
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
 * Begin issuing authentication challenge to user based on @a data.
 *
 * @param cls closure
 * @param trigger function to call when we made progress
 * @param trigger_cls closure for @a trigger
 * @param truth_uuid Identifier of the challenge, to be (if possible) included in the
 *             interaction with the user
 * @param code always 0 (direct validation, backend does
 *             not generate a code in this mode)
 * @param data truth for input to validate (i.e. the shared secret)
 * @param data_length number of bytes in @a data
 * @return state to track progress on the authorization operation, NULL on failure
 */
static struct ANASTASIS_AUTHORIZATION_State *
totp_start (void *cls,
            GNUNET_SCHEDULER_TaskCallback trigger,
            void *trigger_cls,
            const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
            uint64_t code,
            const void *data,
            size_t data_length)
{
  const struct ANASTASIS_AuthorizationContext *ac = cls;
  struct ANASTASIS_AUTHORIZATION_State *as;
  uint64_t want;
  unsigned int off = 0;

  GNUNET_assert (0 == code);
  as = GNUNET_new (struct ANASTASIS_AUTHORIZATION_State);
  as->ac = ac;
  as->truth_uuid = *truth_uuid;
  for (int i = -TIME_INTERVAL_RANGE;
       i <= TIME_INTERVAL_RANGE;
       i++)
  {
    want = compute_totp (i,
                         data,
                         data_length);
    ANASTASIS_hash_answer (want,
                           &as->valid_replies[off++]);
  }
  return as;
}


/**
 * Begin issuing authentication challenge to user based on @a data.
 *
 * @param as authorization state
 * @param timeout how long do we have to produce a reply
 * @param connection HTTP client request (for queuing response, such as redirection to video portal)
 * @return state of the request
 */
static enum ANASTASIS_AUTHORIZATION_Result
totp_process (struct ANASTASIS_AUTHORIZATION_State *as,
              struct GNUNET_TIME_Absolute timeout,
              struct MHD_Connection *connection)
{
  MHD_RESULT mres;
  const char *mime;
  const char *lang;
  const char *challenge_response_s;
  struct GNUNET_HashCode challenge_response;

  challenge_response_s = MHD_lookup_connection_value (connection,
                                                      MHD_GET_ARGUMENT_KIND,
                                                      "response");
  if ( (NULL == challenge_response_s) ||
       (GNUNET_OK !=
        GNUNET_CRYPTO_hash_from_string (challenge_response_s,
                                        &challenge_response)) )
  {
    GNUNET_break_op (0);
    mres = TALER_MHD_reply_with_error (connection,
                                       MHD_HTTP_BAD_REQUEST,
                                       TALER_EC_GENERIC_PARAMETER_MALFORMED,
                                       "response");
    if (MHD_YES != mres)
      return ANASTASIS_AUTHORIZATION_RES_FAILED_REPLY_FAILED;
    return ANASTASIS_AUTHORIZATION_RES_FAILED;

  }
  for (unsigned int i = 0; i<=TIME_INTERVAL_RANGE * 2; i++)
    if (0 ==
        GNUNET_memcmp (&challenge_response,
                       &as->valid_replies[i]))
      return ANASTASIS_AUTHORIZATION_RES_FINISHED;
  mime = MHD_lookup_connection_value (connection,
                                      MHD_HEADER_KIND,
                                      MHD_HTTP_HEADER_ACCEPT);
  if (NULL == mime)
    mime = "text/plain";
  lang = MHD_lookup_connection_value (connection,
                                      MHD_HEADER_KIND,
                                      MHD_HTTP_HEADER_ACCEPT_LANGUAGE);
  if (NULL == lang)
    lang = "en";

  /* Build HTTP response */
  {
    struct MHD_Response *resp;
    struct GNUNET_TIME_Absolute now;

    now = GNUNET_TIME_absolute_get ();
    (void) GNUNET_TIME_round_abs (&now);
    if (TALER_MHD_xmime_matches (mime,
                                 "application/json"))
    {
      resp = TALER_MHD_MAKE_JSON_PACK (
        GNUNET_JSON_pack_uint64 ("code",
                                 TALER_EC_ANASTASIS_TRUTH_CHALLENGE_FAILED),
        GNUNET_JSON_pack_string ("hint",
                                 TALER_ErrorCode_get_hint (
                                   TALER_EC_ANASTASIS_TRUTH_CHALLENGE_FAILED)),
        GNUNET_JSON_pack_time_abs ("server_time",
                                   now));
    }
    else
    {
      size_t response_size;
      char *response;

      // FIXME: i18n of the message based on 'lang' ...
      response_size
        = GNUNET_asprintf (&response,
                           "Server time: %s",
                           GNUNET_STRINGS_absolute_time_to_string (now));
      resp = MHD_create_response_from_buffer (response_size,
                                              response,
                                              MHD_RESPMEM_MUST_COPY);
      TALER_MHD_add_global_headers (resp);
      GNUNET_break (MHD_YES ==
                    MHD_add_response_header (resp,
                                             MHD_HTTP_HEADER_CONTENT_TYPE,
                                             "text/plain"));
    }
    mres = MHD_queue_response (connection,
                               MHD_HTTP_FORBIDDEN,
                               resp);
    MHD_destroy_response (resp);
  }
  if (MHD_YES != mres)
    return ANASTASIS_AUTHORIZATION_RES_FAILED_REPLY_FAILED;
  return ANASTASIS_AUTHORIZATION_RES_FAILED;
}


/**
 * Free internal state associated with @a as.
 *
 * @param as state to clean up
 */
static void
totp_cleanup (struct ANASTASIS_AUTHORIZATION_State *as)
{
  GNUNET_free (as);
}


/**
 * Initialize Totp based authorization plugin
 *
 * @param cls a configuration instance
 * @return NULL on error, otherwise a `struct ANASTASIS_AuthorizationPlugin`
 */
void *
libanastasis_plugin_authorization_totp_init (void *cls)
{
  const struct ANASTASIS_AuthorizationContext *ac = cls;
  struct ANASTASIS_AuthorizationPlugin *plugin;

  plugin = GNUNET_new (struct ANASTASIS_AuthorizationPlugin);
  plugin->cls = (void *) ac;
  plugin->user_provided_code = true;
  plugin->retry_counter = INITIAL_RETRY_COUNTER;
  plugin->code_validity_period = TOTP_VALIDITY_PERIOD;
  plugin->code_rotation_period = plugin->code_validity_period;
  plugin->code_retransmission_frequency = plugin->code_validity_period;
  plugin->validate = &totp_validate;
  plugin->start = &totp_start;
  plugin->process = &totp_process;
  plugin->cleanup = &totp_cleanup;
  return plugin;
}


/**
 * Unload authorization plugin
 *
 * @param cls a `struct ANASTASIS_AuthorizationPlugin`
 * @return NULL (always)
 */
void *
libanastasis_plugin_authorization_totp_done (void *cls)
{
  struct ANASTASIS_AuthorizationPlugin *plugin = cls;

  GNUNET_free (plugin);
  return NULL;
}
