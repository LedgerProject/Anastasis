/*
  This file is part of Anastasis
  Copyright (C) 2020 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

  You should have received a copy of the GNU General Public License along with
  Anastasis; see the file COPYING.GPL.  If not, see <http://www.gnu.org/licenses/>
*/
/**
 * @file testing/testing_api_cmd_keyshare_lookup.c
 * @brief Testing of Implementation of the /truth GET
 * @author Christian Grothoff
 * @author Dennis Neufeld
 * @author Dominik Meister
 */

#include "platform.h"
#include "anastasis_testing_lib.h"
#include <taler/taler_util.h>
#include <taler/taler_testing_lib.h>
#include <taler/taler_merchant_service.h>


/**
 * State for a "keyshare lookup" CMD.
 */
struct KeyShareLookupState
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
   * Expected status code.
   */
  enum ANASTASIS_KeyShareDownloadStatus expected_ksdd;

  /**
   * The /truth GET operation handle.
   */
  struct ANASTASIS_KeyShareLookupOperation *kslo;

  /**
   * answer to a challenge
   */
  const char *answer;

  /**
   * Reference to upload command we expect to lookup.
   */
  const char *upload_reference;

  /**
   * Reference to upload command we expect to lookup.
   */
  const char *payment_reference;

  /**
   * Payment secret requested by the service, if any.
   */
  struct ANASTASIS_PaymentSecretP payment_secret_response;

  /**
   * Taler-URI with payment request, if any.
   */
  char *pay_uri;

  /**
   * Order ID for payment request, if any.
   */
  char *order_id;

  /**
   * Redirect-URI for challenge, if any.
   */
  char *redirect_uri;

  /**
   * "code" returned by service, if any.
   */
  char *code;

  /**
   * "instructions" for how to solve the challenge as returned by service, if any.
   */
  char *instructions;

  /**
   * Name of the file where the service will write the challenge, if method is "file".
   * Otherwise NULL.
   */
  char *filename;

  /**
   * Mode for the lookup(0 = question, 1 = code based)
   */
  int lookup_mode;

};


static void
keyshare_lookup_cb (void *cls,
                    const struct ANASTASIS_KeyShareDownloadDetails *dd)
{
  struct KeyShareLookupState *ksls = cls;

  ksls->kslo = NULL;
  if (dd->status != ksls->expected_ksdd)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Unexpected response code %u to command %s in %s:%u\n",
                dd->status,
                ksls->is->commands[ksls->is->ip].label,
                __FILE__,
                __LINE__);
    TALER_TESTING_interpreter_fail (ksls->is);
    return;
  }
  switch (dd->status)
  {
  case ANASTASIS_KSD_SUCCESS:
    break;
  case ANASTASIS_KSD_PAYMENT_REQUIRED:
    ksls->pay_uri = GNUNET_strdup (dd->details.payment_required.taler_pay_uri);
    ksls->payment_secret_response = dd->details.payment_required.payment_secret;
    {
      struct TALER_MERCHANT_PayUriData pd;

      if (GNUNET_OK !=
          TALER_MERCHANT_parse_pay_uri (ksls->pay_uri,
                                        &pd))
      {
        GNUNET_break (0);
        TALER_TESTING_interpreter_fail (ksls->is);
        return;
      }
      ksls->order_id = GNUNET_strdup (pd.order_id);
      TALER_MERCHANT_parse_pay_uri_free (&pd);
    }

    break;
  case ANASTASIS_KSD_INVALID_ANSWER:
    if (ksls->filename)
    {
      FILE *file;
      char code[22];

      file = fopen (ksls->filename,
                    "r");
      if (NULL == file)
      {
        GNUNET_log_strerror_file (GNUNET_ERROR_TYPE_ERROR,
                                  "open",
                                  ksls->filename);
        TALER_TESTING_interpreter_fail (ksls->is);
        return;
      }
      if (0 == fscanf (file,
                       "%21s",
                       code))
      {
        GNUNET_log_strerror_file (GNUNET_ERROR_TYPE_ERROR,
                                  "fscanf",
                                  ksls->filename);
        GNUNET_break (0 == fclose (file));
        TALER_TESTING_interpreter_fail (ksls->is);
        return;
      }
      GNUNET_break (0 == fclose (file));
      ksls->code = GNUNET_strdup (code);
      GNUNET_log (GNUNET_ERROR_TYPE_DEBUG,
                  "Read code `%s'\n",
                  code);
    }
    else
    {
      ksls->instructions = GNUNET_strndup (
        dd->details.open_challenge.body,
        dd->details.open_challenge.body_size);
    }
    break;
  case ANASTASIS_KSD_REDIRECT_FOR_AUTHENTICATION:
    ksls->redirect_uri = GNUNET_strdup (dd->details.redirect_url);
    break;
  case ANASTASIS_KSD_SERVER_ERROR:
    break;
  case ANASTASIS_KSD_CLIENT_FAILURE:
    break;
  case ANASTASIS_KSD_TRUTH_UNKNOWN:
    break;
  case ANASTASIS_KSD_RATE_LIMIT_EXCEEDED:
    break;
  case ANASTASIS_KSD_AUTHENTICATION_TIMEOUT:
    break;
  case ANASTASIS_KSD_EXTERNAL_CHALLENGE_INSTRUCTIONS:
    break;
  }
  TALER_TESTING_interpreter_next (ksls->is);
}


static void
keyshare_lookup_run (void *cls,
                     const struct TALER_TESTING_Command *cmd,
                     struct TALER_TESTING_Interpreter *is)
{
  struct KeyShareLookupState *ksls = cls;
  const struct ANASTASIS_CRYPTO_TruthKeyP *truth_key;
  const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid;
  const struct ANASTASIS_PaymentSecretP *payment_secret;
  const char **answer;

  ksls->is = is;
  if (NULL == ksls->upload_reference)
  {
    GNUNET_break (0);
    TALER_TESTING_interpreter_fail (ksls->is);
    return;
  }
  {
    const struct TALER_TESTING_Command *upload_cmd;

    upload_cmd = TALER_TESTING_interpreter_lookup_command (
      is,
      ksls->upload_reference);
    if (NULL == upload_cmd)
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (ksls->is);
      return;
    }
    {
      const char **fn;

      if (GNUNET_OK !=
          ANASTASIS_TESTING_get_trait_filename (upload_cmd,
                                                &fn))
      {
        GNUNET_break (0);
        TALER_TESTING_interpreter_fail (ksls->is);
        return;
      }
      if (NULL != *fn)
        ksls->filename = GNUNET_strdup (*fn);
    }
    if (GNUNET_OK !=
        ANASTASIS_TESTING_get_trait_truth_uuid (upload_cmd,
                                                &truth_uuid))
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (ksls->is);
      return;
    }
    if (NULL == truth_uuid)
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (ksls->is);
      return;
    }
    if (GNUNET_OK !=
        ANASTASIS_TESTING_get_trait_truth_key (upload_cmd,
                                               &truth_key))
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (ksls->is);
      return;
    }
    if (NULL == truth_key)
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (ksls->is);
      return;
    }
  }

  if (ksls->lookup_mode == 1)
  {
    const struct TALER_TESTING_Command *download_cmd;

    download_cmd = TALER_TESTING_interpreter_lookup_command (is,
                                                             ksls->answer);
    if (NULL == download_cmd)
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (ksls->is);
      return;
    }
    if (GNUNET_OK !=
        ANASTASIS_TESTING_get_trait_code (download_cmd,
                                          &answer))
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (ksls->is);
      return;
    }
    if (NULL == *answer)
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (ksls->is);
      return;
    }
  }
  else
  {
    /* answer is the answer */
    answer = &ksls->answer;
  }

  if (NULL != ksls->payment_reference)
  {
    const struct TALER_TESTING_Command *payment_cmd;

    payment_cmd = TALER_TESTING_interpreter_lookup_command (
      is,
      ksls->payment_reference);
    if (GNUNET_OK !=
        ANASTASIS_TESTING_get_trait_payment_secret (payment_cmd,
                                                    &payment_secret))
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (ksls->is);
      return;
    }
  }
  else
  {
    payment_secret = NULL;
  }

  {
    struct GNUNET_HashCode h_answer;

    if (NULL != *answer)
      GNUNET_CRYPTO_hash (*answer,
                          strlen (*answer),
                          &h_answer);
    ksls->kslo = ANASTASIS_keyshare_lookup (is->ctx,
                                            ksls->anastasis_url,
                                            truth_uuid,
                                            truth_key,
                                            payment_secret,
                                            GNUNET_TIME_UNIT_ZERO,
                                            (NULL != *answer)
                                            ? &h_answer
                                            : NULL,
                                            &keyshare_lookup_cb,
                                            ksls);
  }
  if (NULL == ksls->kslo)
  {
    GNUNET_break (0);
    TALER_TESTING_interpreter_fail (ksls->is);
    return;
  }
}


static void
keyshare_lookup_cleanup (void *cls,
                         const struct TALER_TESTING_Command *cmd)
{
  struct KeyShareLookupState *ksls = cls;

  if (NULL != ksls->kslo)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                "Command '%s' did not complete (keyshare lookup)\n",
                cmd->label);
    ANASTASIS_keyshare_lookup_cancel (ksls->kslo);
    ksls->kslo = NULL;
  }
  GNUNET_free (ksls->pay_uri);
  GNUNET_free (ksls->order_id);
  GNUNET_free (ksls->code);
  GNUNET_free (ksls->instructions);
  GNUNET_free (ksls->redirect_uri);
  GNUNET_free (ksls);
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
keyshare_lookup_traits (void *cls,
                        const void **ret,
                        const char *trait,
                        unsigned int index)
{
  struct KeyShareLookupState *ksls = cls;
  struct TALER_TESTING_Trait traits[] = {
    ANASTASIS_TESTING_make_trait_payment_secret (
      &ksls->payment_secret_response),
    TALER_TESTING_make_trait_payto_uri (
      (const char **) ksls->pay_uri),
    TALER_TESTING_make_trait_order_id (
      (const char **) &ksls->order_id),
    ANASTASIS_TESTING_make_trait_code (
      (const char **) ksls->code),
    TALER_TESTING_trait_end ()
  };

  return TALER_TESTING_get_trait (traits,
                                  ret,
                                  trait,
                                  index);
}


struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_keyshare_lookup (
  const char *label,
  const char *anastasis_url,
  const char *answer,
  const char *payment_ref,
  const char *upload_ref,
  int lookup_mode,
  enum ANASTASIS_KeyShareDownloadStatus ksdd)
{
  struct KeyShareLookupState *ksls;

  GNUNET_assert (NULL != upload_ref);
  ksls = GNUNET_new (struct KeyShareLookupState);
  ksls->expected_ksdd = ksdd;
  ksls->anastasis_url = anastasis_url;
  ksls->upload_reference = upload_ref;
  ksls->payment_reference = payment_ref;
  ksls->answer = answer;
  ksls->lookup_mode = lookup_mode;
  {
    struct TALER_TESTING_Command cmd = {
      .cls = ksls,
      .label = label,
      .run = &keyshare_lookup_run,
      .cleanup = &keyshare_lookup_cleanup,
      .traits = &keyshare_lookup_traits
    };

    return cmd;
  }
}


/* end of testing_api_cmd_keyshare_lookup.c */
