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
 * @file testing/testing_cmd_truth_upload.c
 * @brief command to execute the anastasis secret share service
 * @author Christian Grothoff
 * @author Dennis Neufeld
 * @author Dominik Meister
 */

#include "platform.h"
#include "anastasis_testing_lib.h"
#include <taler/taler_util.h>
#include <taler/taler_testing_lib.h>


/**
 * State for a "truth upload" CMD.
 */
struct TruthUploadState
{
  /**
   * The interpreter state.
   */
  struct TALER_TESTING_Interpreter *is;

  /**
   * URL of the anastasis backend.
   */
  const char *anastasis_url;

  /**
   * Label of this command.
   */
  const char *label;

  /**
   * The ID data to generate user identifier
   */
  json_t *id_data;

  /**
   * The escrow method
   */
  const char *method;

  /**
   * Instructions to be returned to client/user
   * (e.g. "Look at your smartphone. SMS was sent to you")
   */
  const char *instructions;

  /**
   * Mime type of truth_data (eg. jpeg, string etc.)
   */
  const char *mime_type;

  /**
   * The truth_data (e.g. hash of answer to a secure question)
   */
  void *truth_data;

  /**
   * Requested order ID for this upload (if unpaid).
   */
  struct ANASTASIS_PaymentSecretP payment_secret_response;

  /**
   * Size of truth_data
   */
  size_t truth_data_size;

  /**
   * Expected status code.
   */
  unsigned int http_status;

  /**
   * The /truth POST operation handle.
   */
  struct ANASTASIS_TruthUpload *tuo;

  /**
   * closure for the payment callback
   */
  void *tpc_cls;

  /**
   * Reference to salt download.
   */
  const char *salt_reference;

  /**
   * Options for how we are supposed to do the upload.
   */
  enum ANASTASIS_TESTING_TruthStoreOption tsopt;

  /**
   * Truth object
   */
  struct ANASTASIS_Truth *truth;
};


/**
 * Upload information
 * caller MUST free 't' using ANASTASIS_truth_free()
 *
 * @param cls closure for callback
 * @param t Truth object (contains provider url and truth public key)
 * @param ud upload details, useful to continue in case of errors, NULL on success
 */
static void
truth_upload_cb (void *cls,
                 struct ANASTASIS_Truth *t,
                 const struct ANASTASIS_UploadDetails *ud)
{
  struct TruthUploadState *tus = cls;

  tus->tuo = NULL;
  if (NULL == ud)
  {
    GNUNET_break (0);
    TALER_TESTING_interpreter_fail (tus->is);
    return;
  }
  if (ud->http_status != tus->http_status)
  {
    GNUNET_break (0);
    TALER_TESTING_interpreter_fail (tus->is);
    return;
  }
  if (MHD_HTTP_PAYMENT_REQUIRED == ud->http_status)
  {
    if (ANASTASIS_US_PAYMENT_REQUIRED != ud->us)
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (tus->is);
      return;
    }
    tus->payment_secret_response = ud->details.payment.ps;
    TALER_TESTING_interpreter_next (tus->is);
    return;
  }
  if ( (ANASTASIS_US_SUCCESS == ud->us) &&
       (NULL == t) )
  {
    GNUNET_break (0);
    TALER_TESTING_interpreter_next (tus->is);
    return;
  }
  tus->truth = t;
  TALER_TESTING_interpreter_next (tus->is);
}


/**
 * Run a "truth upload" CMD.
 *
 * @param cls closure.
 * @param cmd command currently being run.
 * @param is interpreter state.
 */
static void
truth_upload_run (void *cls,
                  const struct TALER_TESTING_Command *cmd,
                  struct TALER_TESTING_Interpreter *is)
{
  struct TruthUploadState *tus = cls;
  const struct TALER_TESTING_Command *ref;
  const struct ANASTASIS_CRYPTO_ProviderSaltP *salt;
  struct ANASTASIS_CRYPTO_UserIdentifierP user_id;

  tus->is = is;
  if (NULL != tus->salt_reference)
  {
    ref = TALER_TESTING_interpreter_lookup_command
            (is,
            tus->salt_reference);
    if (NULL == ref)
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (tus->is);
      return;
    }
    if (GNUNET_OK !=
        ANASTASIS_TESTING_get_trait_salt (ref,
                                          0,
                                          &salt))
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (tus->is);
      return;
    }
  }

  ANASTASIS_CRYPTO_user_identifier_derive (tus->id_data,
                                           salt,
                                           &user_id);

  tus->tuo = ANASTASIS_truth_upload (is->ctx,
                                     &user_id,
                                     tus->anastasis_url,
                                     tus->method,
                                     tus->instructions,
                                     tus->mime_type,
                                     salt,
                                     tus->truth_data,
                                     tus->truth_data_size,
                                     false, /* force payment */
                                     GNUNET_TIME_UNIT_ZERO,
                                     &truth_upload_cb,
                                     tus);
  if (NULL == tus->tuo)
  {
    GNUNET_break (0);
    TALER_TESTING_interpreter_fail (tus->is);
  }
}


/**
 * Free the state of a "truth upload" CMD, and possibly
 * cancel it if it did not complete.
 *
 * @param cls closure.
 * @param cmd command being freed.
 */
static void
truth_upload_cleanup (void *cls,
                      const struct TALER_TESTING_Command *cmd)
{
  struct TruthUploadState *tus = cls;

  if (NULL != tus->tuo)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                "Command '%s' did not complete\n",
                cmd->label);
    ANASTASIS_truth_upload_cancel (tus->tuo);
    tus->tuo = NULL;
  }
  if (NULL != tus->id_data)
  {
    json_decref (tus->id_data);
    tus->id_data = NULL;
  }
  if (NULL != tus->truth)
  {
    ANASTASIS_truth_free (tus->truth);
    tus->truth = NULL;
  }
  GNUNET_free (tus->truth_data);
  GNUNET_free (tus);
}


/**
 * Offer internal data to other commands.
 *
 * @param cls closure
 * @param[out] ret result (could be anything)
 * @param trait name of the trait
 * @param index index number of the object to extract.
 * @return #GNUNET_OK on success
 */
static int
truth_upload_traits (void *cls,
                     const void **ret,
                     const char *trait,
                     unsigned int index)
{
  struct TruthUploadState *tus = cls;
  struct TALER_TESTING_Trait traits[] = {
    ANASTASIS_TESTING_make_trait_truth (0,
                                        tus->truth),
    ANASTASIS_TESTING_make_trait_payment_secret (0,
                                                 &tus->payment_secret_response),
    TALER_TESTING_trait_end ()
  };

  return TALER_TESTING_get_trait (traits,
                                  ret,
                                  trait,
                                  index);
}


json_t *
ANASTASIS_TESTING_make_id_data_example (const char *id_data)
{
  return GNUNET_JSON_PACK (
    GNUNET_JSON_pack_string ("id_data",
                             id_data));
}


struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_truth_upload (
  const char *label,
  const char *anastasis_url,
  const json_t *id_data,
  const char *method,
  const char *instructions,
  const char *mime_type,
  const void *truth_data,
  size_t truth_data_size,
  unsigned int http_status,
  enum ANASTASIS_TESTING_TruthStoreOption tso,
  const char *salt_ref)
{
  struct TruthUploadState *tus;

  tus = GNUNET_new (struct TruthUploadState);
  tus->label = label;
  tus->http_status = http_status;
  tus->tsopt = tso;
  tus->anastasis_url = anastasis_url;
  tus->salt_reference = salt_ref;
  tus->id_data = json_incref ((json_t *) id_data);
  tus->method = method;
  tus->instructions = instructions;
  tus->mime_type = mime_type;
  tus->truth_data_size = truth_data_size;
  tus->truth_data = GNUNET_memdup (truth_data,
                                   truth_data_size);
  {
    struct TALER_TESTING_Command cmd = {
      .cls = tus,
      .label = label,
      .run = &truth_upload_run,
      .cleanup = &truth_upload_cleanup,
      .traits = &truth_upload_traits
    };

    return cmd;
  }
}


struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_truth_upload_question (
  const char *label,
  const char *anastasis_url,
  const json_t *id_data,
  const char *instructions,
  const char *mime_type,
  const void *answer,
  unsigned int http_status,
  enum ANASTASIS_TESTING_TruthStoreOption tso,
  const char *salt_ref)
{
  return ANASTASIS_TESTING_cmd_truth_upload (label,
                                             anastasis_url,
                                             id_data,
                                             "question",
                                             instructions,
                                             mime_type,
                                             answer,
                                             strlen (answer),
                                             http_status,
                                             tso,
                                             salt_ref);
}


/* end of testing_cmd_truth_upload.c */
