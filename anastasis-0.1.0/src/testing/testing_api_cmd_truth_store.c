/*
  This file is part of Anastasis
  Copyright (C) 2020 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU Lesser General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with
  Anastasis; see the file COPYING.GPL.  If not, see <http://www.gnu.org/licenses/>
*/
/**
 * @file testing/testing_api_cmd_truth_store.c
 * @brief command to execute the anastasis backend service.
 * @author Dennis Neufeld
 */
#include "platform.h"
#include "anastasis_testing_lib.h"
#include <taler/taler_util.h>
#include <taler/taler_testing_lib.h>
#include <taler/taler_merchant_service.h>

/**
 * State for a "truth store" CMD.
 */
struct TruthStoreState
{
  /**
   * UUID of the uploaded truth
   */
  struct ANASTASIS_CRYPTO_TruthUUIDP uuid;

  /**
   * Key used to encrypt the @e truth_data on the server.
   */
  struct ANASTASIS_CRYPTO_TruthKeyP key;

  /**
   * "Encrypted" key share data we store at the server.
   */
  struct ANASTASIS_CRYPTO_EncryptedKeyShareP encrypted_keyshare;

  /**
   * The /truth POST operation handle.
   */
  struct ANASTASIS_TruthStoreOperation *tso;

  /**
   * URL of the anastasis backend.
   */
  const char *anastasis_url;

  /**
   * The interpreter state.
   */
  struct TALER_TESTING_Interpreter *is;

  /**
   * Previous upload, or NULL for none. Used to calculate what THIS
   * upload is based on.
   */
  const char *prev_upload;

  /**
   * Authorization method / plugin name.
   */
  const char *method;

  /**
   * Mimetype of @e truth_data.
   */
  const char *mime_type;

  /**
   * Number of bytes in @e truth_data
   */
  size_t truth_data_size;

  /**
   * Data used by the authorization process.
   */
  void *truth_data;

  /**
   * Name of the file where the service will write the challenge, or NULL.
   */
  char *filename;

  /**
   * Expected status code.
   */
  unsigned int http_status;

  /**
   * Payment request we got back, or NULL.
   */
  char *pay_uri;

  /**
   * Payment order ID we got back, or all zeros.
   */
  struct ANASTASIS_PaymentSecretP payment_secret_response;

  /**
   * Options for how we are supposed to do the upload.
   */
  enum ANASTASIS_TESTING_TruthStoreOption tsopt;
};

/**
 * Function called with the results of an #ANASTASIS_truth_store()
 * operation.
 *
 * @param cls closure
 * @param ud details about the upload operation
 */
static void
truth_store_cb (void *cls,
                const struct ANASTASIS_UploadDetails *ud)
{
  struct TruthStoreState *tss = cls;

  tss->tso = NULL;
  if ( (NULL == ud) ||
       (ud->http_status != tss->http_status) )
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Unexpected response code %u to command %s in %s:%u\n",
                (NULL != ud) ? ud->http_status : 0,
                tss->is->commands[tss->is->ip].label,
                __FILE__,
                __LINE__);
    TALER_TESTING_interpreter_fail (tss->is);
    return;
  }
  switch (ud->us)
  {
  case ANASTASIS_US_SUCCESS:
    break;
  case ANASTASIS_US_PAYMENT_REQUIRED:
    tss->pay_uri = GNUNET_strdup (ud->details.payment.payment_request);
    tss->payment_secret_response = ud->details.payment.ps;
    break;
  case ANASTASIS_US_CONFLICTING_TRUTH:
    GNUNET_break (0);
    TALER_TESTING_interpreter_fail (tss->is);
    return;
  case ANASTASIS_US_HTTP_ERROR:
    GNUNET_break (0);
    TALER_TESTING_interpreter_fail (tss->is);
    return;
  case ANASTASIS_US_CLIENT_ERROR:
    GNUNET_break (0);
    TALER_TESTING_interpreter_fail (tss->is);
    return;
  case ANASTASIS_US_SERVER_ERROR:
    GNUNET_break (0);
    TALER_TESTING_interpreter_fail (tss->is);
    return;
  default:
    GNUNET_break (0);
    TALER_TESTING_interpreter_fail (tss->is);
    return;
  }
  TALER_TESTING_interpreter_next (tss->is);
}


/**
 * Run a "truth store" CMD.
 *
 * @param cls closure.
 * @param cmd command currently being run.
 * @param is interpreter state.
 */
static void
truth_store_run (void *cls,
                 const struct TALER_TESTING_Command *cmd,
                 struct TALER_TESTING_Interpreter *is)
{
  struct TruthStoreState *tss = cls;

  tss->is = is;
  if (NULL != tss->prev_upload)
  {
    const struct TALER_TESTING_Command *ref;

    ref = TALER_TESTING_interpreter_lookup_command (is,
                                                    tss->prev_upload);
    if (NULL == ref)
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (tss->is);
      return;
    }

    if (0 != (ANASTASIS_TESTING_TSO_REFERENCE_UUID & tss->tsopt))
    {
      const struct ANASTASIS_CRYPTO_TruthUUIDP *uuid;
      const struct ANASTASIS_CRYPTO_EncryptedKeyShareP *eks;

      if (GNUNET_OK !=
          ANASTASIS_TESTING_get_trait_truth_uuid (ref,
                                                  0,
                                                  &uuid))
      {
        GNUNET_break (0);
        TALER_TESTING_interpreter_fail (tss->is);
        return;
      }
      tss->uuid = *uuid;
      if (GNUNET_OK !=
          ANASTASIS_TESTING_get_trait_eks (ref,
                                           0,
                                           &eks))
      {
        GNUNET_break (0);
        TALER_TESTING_interpreter_fail (tss->is);
        return;
      }
      tss->encrypted_keyshare = *eks;
    }
  }
  else
  {
    GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_NONCE,
                                &tss->uuid,
                                sizeof (struct ANASTASIS_CRYPTO_TruthUUIDP));
    GNUNET_CRYPTO_random_block (
      GNUNET_CRYPTO_QUALITY_WEAK,
      &tss->encrypted_keyshare,
      sizeof (struct ANASTASIS_CRYPTO_EncryptedKeyShareP));
  }
  GNUNET_CRYPTO_random_block (
    GNUNET_CRYPTO_QUALITY_WEAK,
    &tss->key,
    sizeof (struct ANASTASIS_CRYPTO_TruthKeyP));

  {
    void *encrypted_truth;
    size_t size_encrypted_truth;
    struct ANASTASIS_CRYPTO_NonceP nonce;

    GNUNET_CRYPTO_random_block (GNUNET_CRYPTO_QUALITY_NONCE,
                                &nonce,
                                sizeof (nonce));
    ANASTASIS_CRYPTO_truth_encrypt (&nonce,
                                    &tss->key,
                                    tss->truth_data,
                                    tss->truth_data_size,
                                    &encrypted_truth,
                                    &size_encrypted_truth);
    {
      void *t;
      size_t t_size;

      ANASTASIS_CRYPTO_truth_decrypt (&tss->key,
                                      encrypted_truth,
                                      size_encrypted_truth,
                                      &t,
                                      &t_size);
      if ( (t_size != tss->truth_data_size) ||
           (0 != memcmp (tss->truth_data,
                         t,
                         t_size)) )
      {
        GNUNET_break (0);
        TALER_TESTING_interpreter_fail (tss->is);
        return;
      }
      GNUNET_free (t);
    }
    tss->tso = ANASTASIS_truth_store (
      is->ctx,
      tss->anastasis_url,
      &tss->uuid,
      tss->method,
      &tss->encrypted_keyshare,
      tss->mime_type,
      size_encrypted_truth,
      encrypted_truth,
      (0 != (ANASTASIS_TESTING_TSO_REQUEST_PAYMENT & tss->tsopt)),
      GNUNET_TIME_UNIT_ZERO,
      &truth_store_cb,
      tss);
    GNUNET_free (encrypted_truth);
  }
  if (NULL == tss->tso)
  {
    GNUNET_break (0);
    TALER_TESTING_interpreter_fail (tss->is);
    return;
  }
}


/**
 * Free the state of a "truth store" CMD, and possibly
 * cancel it if it did not complete.
 *
 * @param cls closure.
 * @param cmd command being freed.
 */
static void
truth_store_cleanup (void *cls,
                     const struct TALER_TESTING_Command *cmd)
{
  struct TruthStoreState *tss = cls;

  if (NULL != tss->tso)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                "Command '%s' did not complete (truth post)\n",
                cmd->label);
    ANASTASIS_truth_store_cancel (tss->tso);
    tss->tso = NULL;
  }
  GNUNET_free (tss->truth_data);
  GNUNET_free (tss->pay_uri);
  GNUNET_free (tss->filename);
  GNUNET_free (tss);
}


/**
 * Offer internal data to other commands.
 *
 * @param cls closure
 * @param[out] ret result (could be anything)
 * @param[out] trait name of the trait
 * @param index index number of the object to extract.
 * @return #GNUNET_OK on success
 */
static int
truth_store_traits (void *cls,
                    const void **ret,
                    const char *trait,
                    unsigned int index)
{
  struct TruthStoreState *tss = cls;
  struct TALER_TESTING_Trait traits[] = {
    ANASTASIS_TESTING_make_trait_truth_uuid (0,
                                             &tss->uuid),
    ANASTASIS_TESTING_make_trait_truth_key (0,
                                            &tss->key),
    ANASTASIS_TESTING_make_trait_eks (0,
                                      &tss->encrypted_keyshare),
    ANASTASIS_TESTING_make_trait_payment_secret (0,
                                                 &tss->payment_secret_response),
    TALER_TESTING_make_trait_url (TALER_TESTING_UT_TALER_URL,
                                  tss->pay_uri),
    TALER_TESTING_make_trait_string (0,
                                     tss->filename),
    TALER_TESTING_trait_end ()
  };

  return TALER_TESTING_get_trait (traits,
                                  ret,
                                  trait,
                                  index);
}


struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_truth_store (const char *label,
                                   const char *anastasis_url,
                                   const char *prev_upload,
                                   const char *method,
                                   const char *mime_type,
                                   size_t truth_data_size,
                                   const void *truth_data,
                                   enum ANASTASIS_TESTING_TruthStoreOption tso,
                                   unsigned int http_status)
{
  struct TruthStoreState *tss;

  GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
              "Storing %u bytes of truth\n",
              (unsigned int) truth_data_size);
  tss = GNUNET_new (struct TruthStoreState);
  tss->http_status = http_status;
  tss->tsopt = tso;
  tss->anastasis_url = anastasis_url;
  tss->prev_upload = prev_upload;
  tss->method = method;
  tss->mime_type = mime_type;
  tss->truth_data = GNUNET_memdup (truth_data,
                                   truth_data_size);
  tss->truth_data_size = truth_data_size;
  if (0 == strcasecmp (method,
                       "file"))
    tss->filename = GNUNET_strndup (truth_data,
                                    truth_data_size);
  {
    struct TALER_TESTING_Command cmd = {
      .cls = tss,
      .label = label,
      .run = &truth_store_run,
      .cleanup = &truth_store_cleanup,
      .traits = &truth_store_traits
    };

    return cmd;
  }
}


struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_truth_question (
  const char *label,
  const char *anastasis_url,
  const char *prev_upload,
  const char *answer,
  enum ANASTASIS_TESTING_TruthStoreOption tso,
  unsigned int http_status)
{
  struct GNUNET_HashCode h;

  GNUNET_CRYPTO_hash (answer,
                      strlen (answer),
                      &h);
  return ANASTASIS_TESTING_cmd_truth_store (label,
                                            anastasis_url,
                                            prev_upload,
                                            "question",
                                            "binary/sha512",
                                            sizeof (h),
                                            &h,
                                            tso,
                                            http_status);
}
