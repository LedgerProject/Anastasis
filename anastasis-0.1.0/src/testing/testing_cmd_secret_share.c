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
 * @file testing/testing_cmd_secret_share.c
 * @brief command to execute the anastasis secret share service
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
 * State for a "secret share" CMD.
 */
struct SecretShareState
{
  /**
   * Claim token we got back, if any. Otherwise all zeros.
   */
  struct TALER_ClaimTokenP token;

  /**
   * The interpreter state.
   */
  struct TALER_TESTING_Interpreter *is;

  /**
   * Label of this command.
   */
  const char *label;

  /**
   * References to commands of previous policy creations.
   */
  const char **cmd_label_array;

  /**
   * Data to derive user identifier from.
   */
  json_t *id_data;

  /**
   * The core secret to backup/recover.
   */
  const void *core_secret;

  /**
   * URL of the anastasis backend.
   */
  const char *anastasis_url;

  /**
   * URL of a /config command for the @e anastasis_url.
   */
  const char *config_ref;

  /**
   * The /truth GET operation handle.
   */
  struct ANASTASIS_SecretShare *sso;

  /**
   * Reference to previous secret share command we expect to lookup.
   */
  const char *prev_secret_share;

  /**
   * closure for the payment callback
   */
  void *spc_cls;

  /**
   * closure for the result callback
   */
  void *src_cls;

  /**
   * Payment order ID we got back, if any. Otherwise NULL.
   */
  char *payment_order_id;

  /**
   * Size of core_secret.
   */
  size_t core_secret_size;

  /**
   * Length of array of command labels (cmd_label_array).
   */
  unsigned int cmd_label_array_length;

  /**
   * Expected status code.
   */
  enum ANASTASIS_ShareStatus want_status;

  /**
   * Options for how we are supposed to do the upload.
   */
  enum ANASTASIS_TESTING_SecretShareOption ssopt;
};


/**
 * Function called with the results of a #ANASTASIS_secret_share().
 *
 * @param cls closure
 * @param sr result from the operation
 */
static void
secret_share_result_cb (void *cls,
                        const struct ANASTASIS_ShareResult *sr)
{
  struct SecretShareState *sss = cls;

  sss->sso = NULL;
  if (sr->ss != sss->want_status)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Unexpected response code %u to command %s in %s:%u\n",
                sr->ss,
                sss->is->commands[sss->is->ip].label,
                __FILE__,
                __LINE__);
    TALER_TESTING_interpreter_fail (sss->is);
    return;
  }
  switch (sr->ss)
  {
  case ANASTASIS_SHARE_STATUS_SUCCESS:
    break;
  case ANASTASIS_SHARE_STATUS_PAYMENT_REQUIRED:
    {
      struct TALER_MERCHANT_PayUriData pd;

      GNUNET_assert (0 < sr->details.payment_required.payment_requests_length);
      if (GNUNET_OK !=
          TALER_MERCHANT_parse_pay_uri (
            sr->details.payment_required.payment_requests[0].payment_request_url,
            &pd))
      {
        GNUNET_break (0);
        TALER_TESTING_interpreter_fail (sss->is);
        return;
      }
      sss->payment_order_id = GNUNET_strdup (pd.order_id);
      TALER_MERCHANT_parse_pay_uri_free (&pd);
      GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                  "Order ID from Anastasis service is `%s'\n",
                  sss->payment_order_id);
    }
  case ANASTASIS_SHARE_STATUS_PROVIDER_FAILED:
    break;
  }
  TALER_TESTING_interpreter_next (sss->is);
}


/**
 * Run a "secret share" CMD.
 *
 * @param cls closure.
 * @param cmd command currently being run.
 * @param is interpreter state.
 */
static void
secret_share_run (void *cls,
                  const struct TALER_TESTING_Command *cmd,
                  struct TALER_TESTING_Interpreter *is)
{
  struct SecretShareState *sss = cls;
  const struct ANASTASIS_Policy *policies[sss->cmd_label_array_length];
  struct ANASTASIS_ProviderDetails pds;

  GNUNET_assert (sss->cmd_label_array_length > 0);
  GNUNET_assert (NULL != sss->cmd_label_array);
  sss->is = is;
  if (NULL != sss->cmd_label_array)
  {
    for (unsigned int i = 0; i < sss->cmd_label_array_length; i++)
    {
      const struct TALER_TESTING_Command *ref;
      const struct ANASTASIS_Policy *policy;

      ref = TALER_TESTING_interpreter_lookup_command (is,
                                                      sss->cmd_label_array[i]);
      if (NULL == ref)
      {
        GNUNET_break (0);
        TALER_TESTING_interpreter_fail (sss->is);
        return;
      }
      if (GNUNET_OK !=
          ANASTASIS_TESTING_get_trait_policy (ref,
                                              0,
                                              &policy))
      {
        GNUNET_break (0);
        TALER_TESTING_interpreter_fail (sss->is);
        return;
      }
      GNUNET_assert (NULL != policy);
      policies[i] = policy;
    }
  }

  if (NULL != sss->prev_secret_share)
  {
    const struct TALER_TESTING_Command *ref;
    const char *order_id;

    ref = TALER_TESTING_interpreter_lookup_command (is,
                                                    sss->prev_secret_share);
    if (NULL == ref)
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (sss->is);
      return;
    }
    if (GNUNET_OK !=
        TALER_TESTING_get_trait_order_id (ref,
                                          0,
                                          &order_id))
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (sss->is);
      return;
    }
    sss->payment_order_id = (char *) order_id;

    if (NULL == sss->payment_order_id)
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (sss->is);
      return;
    }
  }

  memset (&pds,
          0,
          sizeof (pds));
  if (NULL != sss->payment_order_id)
  {
    if (GNUNET_OK !=
        GNUNET_STRINGS_string_to_data (
          sss->payment_order_id,
          strlen (sss->payment_order_id),
          &pds.payment_secret,
          sizeof (struct ANASTASIS_PaymentSecretP)))
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (sss->is);
      GNUNET_free (sss->payment_order_id);
      return;
    }
    GNUNET_free (sss->payment_order_id);
  }
  pds.provider_url = sss->anastasis_url;
  {
    const struct TALER_TESTING_Command *ref;
    const struct ANASTASIS_CRYPTO_ProviderSaltP *salt;

    ref = TALER_TESTING_interpreter_lookup_command (is,
                                                    sss->config_ref);
    if (NULL == ref)
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (sss->is);
      return;
    }
    if (GNUNET_OK !=
        ANASTASIS_TESTING_get_trait_salt (ref,
                                          0,
                                          &salt))
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (sss->is);
      return;
    }
    pds.provider_salt = *salt;
  }

  sss->sso = ANASTASIS_secret_share (is->ctx,
                                     sss->id_data,
                                     &pds,
                                     1,
                                     policies,
                                     sss->cmd_label_array_length,
                                     false,
                                     GNUNET_TIME_UNIT_ZERO,
                                     &secret_share_result_cb,
                                     sss,
                                     "test-case",
                                     sss->core_secret,
                                     sss->core_secret_size);
  if (NULL == sss->sso)
  {
    GNUNET_break (0);
    TALER_TESTING_interpreter_fail (sss->is);
    return;
  }
}


/**
 * Free the state of a "secret share" CMD, and possibly
 * cancel it if it did not complete.
 *
 * @param cls closure.
 * @param cmd command being freed.
 */
static void
secret_share_cleanup (void *cls,
                      const struct TALER_TESTING_Command *cmd)
{
  struct SecretShareState *sss = cls;

  if (NULL != sss->cmd_label_array)
  {
    GNUNET_free (sss->cmd_label_array);
  }
  if (NULL != sss->sso)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                "Command '%s' did not complete\n",
                cmd->label);
    ANASTASIS_secret_share_cancel (sss->sso);
    sss->sso = NULL;
  }
  json_decref (sss->id_data);
  GNUNET_free (sss);
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
secret_share_traits (void *cls,
                     const void **ret,
                     const char *trait,
                     unsigned int index)
{
  struct SecretShareState *sss = cls;
  struct TALER_TESTING_Trait traits[] = {
    TALER_TESTING_make_trait_claim_token (0,
                                          &sss->token),
    ANASTASIS_TESTING_make_trait_core_secret (0,
                                              sss->core_secret),
    TALER_TESTING_make_trait_order_id (0,
                                       sss->payment_order_id),
    TALER_TESTING_trait_end ()
  };

  return TALER_TESTING_get_trait (traits,
                                  ret,
                                  trait,
                                  index);
}


struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_secret_share (
  const char *label,
  const char *anastasis_url,
  const char *config_ref,
  const char *prev_secret_share,
  const json_t *id_data,
  const void *core_secret,
  size_t core_secret_size,
  enum ANASTASIS_ShareStatus want_status,
  enum ANASTASIS_TESTING_SecretShareOption sso,
  ...)
{
  struct SecretShareState *sss;

  sss = GNUNET_new (struct SecretShareState);
  sss->want_status = want_status;
  sss->ssopt = sso;
  sss->anastasis_url = anastasis_url;
  sss->config_ref = config_ref;
  sss->label = label;
  sss->id_data = json_incref ((json_t *) id_data);
  sss->core_secret = core_secret;
  sss->core_secret_size = core_secret_size;
  sss->prev_secret_share = prev_secret_share;

  {
    const char *policy_create_cmd;
    va_list ap;

    va_start (ap,
              sso);
    while (NULL != (policy_create_cmd = va_arg (ap, const char *)))
    {
      GNUNET_array_append (sss->cmd_label_array,
                           sss->cmd_label_array_length,
                           policy_create_cmd);
    }
    va_end (ap);
  }
  {
    struct TALER_TESTING_Command cmd = {
      .cls = sss,
      .label = label,
      .run = &secret_share_run,
      .cleanup = &secret_share_cleanup,
      .traits = &secret_share_traits
    };

    return cmd;
  }
}


/* end of testing_cmd_secret_share.c */
