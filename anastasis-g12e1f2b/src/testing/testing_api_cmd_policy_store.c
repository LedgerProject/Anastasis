/*
  This file is part of ANASTASIS
  Copyright (C) 2014-2019 Anastasis SARL

  ANASTASIS is free software; you can redistribute it and/or modify
  it under the terms of the GNU General Public License as
  published by the Free Software Foundation; either version 3, or
  (at your option) any later version.

  ANASTASIS is distributed in the hope that it will be useful, but
  WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public
  License along with ANASTASIS; see the file COPYING.  If not, see
  <http://www.gnu.org/licenses/>
*/

/**
 * @file testing/testing_api_cmd_policy_store.c
 * @brief command to execute the anastasis backend service.
 * @author Christian Grothoff
 * @author Dominik Meister
 * @author Dennis Neufeld
 */

#include "platform.h"
#include "anastasis_testing_lib.h"
#include <taler/taler_util.h>
#include <taler/taler_testing_lib.h>
#include <taler/taler_merchant_service.h>


/**
 * State for a "policy store" CMD.
 */
struct PolicyStoreState
{
  /**
   * Claim token we got back, if any. Otherwise all zeros.
   */
  struct TALER_ClaimTokenP claim_token;

  /**
   * The policy data.
   */
  const void *recovery_data;

  /**
   * Number of bytes in @e recovery_data
   */
  size_t recovery_data_size;

  /**
   * Expected status code.
   */
  unsigned int http_status;

  /**
   * Eddsa Publickey.
   */
  struct ANASTASIS_CRYPTO_AccountPublicKeyP anastasis_pub;

  /**
   * Eddsa Privatekey.
   */
  struct ANASTASIS_CRYPTO_AccountPrivateKeyP anastasis_priv;

  /**
   * Hash of uploaded data, used to verify the response.
   */
  struct GNUNET_HashCode curr_hash;

  /**
   * The /policy POST operation handle.
   */
  struct ANASTASIS_PolicyStoreOperation *pso;

  /**
   * The nonce.
   */
  struct ANASTASIS_CRYPTO_NonceP nonce;

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
   * Payment order ID we are to provide in the request, or zero.
   */
  struct ANASTASIS_PaymentSecretP payment_secret_request;

  /**
   * The order ID, for making the payment.
   */
  char *order_id;

  /**
   * Payment order ID we are to provide in the response, or zero.
   */
  struct ANASTASIS_PaymentSecretP payment_secret_response;

  /**
   * Options for how we are supposed to do the upload.
   */
  enum ANASTASIS_TESTING_PolicyStoreOption psopt;

  /**
   * True if @e payment_secret_request is initialized.
   */
  bool payment_secret_set;
};

/**
 * Function called with the results of an #ANASTASIS_policy_store() operation.
 *
 * @param cls closure
 * @param ud details about the upload operation
 */
static void
policy_store_cb (void *cls,
                 const struct ANASTASIS_UploadDetails *ud)
{
  struct PolicyStoreState *pss = cls;

  pss->pso = NULL;
  if (ud->http_status != pss->http_status)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Unexpected response code %u to command %s in %s:%u\n",
                ud->http_status,
                pss->is->commands[pss->is->ip].label,
                __FILE__,
                __LINE__);
    TALER_TESTING_interpreter_fail (pss->is);
    return;
  }
  switch (ud->us)
  {
  case ANASTASIS_US_SUCCESS:
    if (0 != GNUNET_memcmp (&pss->curr_hash,
                            ud->details.success.curr_backup_hash))
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (pss->is);
      return;
    }
    break;
  case ANASTASIS_US_PAYMENT_REQUIRED:
    pss->payment_secret_response = ud->details.payment.ps;
    {
      struct TALER_MERCHANT_PayUriData pd;

      if (GNUNET_OK !=
          TALER_MERCHANT_parse_pay_uri (ud->details.payment.payment_request,
                                        &pd))
      {
        GNUNET_break (0);
        TALER_TESTING_interpreter_fail (pss->is);
        return;
      }
      pss->order_id = GNUNET_strdup (pd.order_id);
      if (NULL != pd.claim_token)
        pss->claim_token = *pd.claim_token;
      TALER_MERCHANT_parse_pay_uri_free (&pd);
    }
    break;
  case ANASTASIS_US_HTTP_ERROR:
    break;
  case ANASTASIS_US_CLIENT_ERROR:
    GNUNET_break (0);
    TALER_TESTING_interpreter_fail (pss->is);
    return;
  case ANASTASIS_US_SERVER_ERROR:
    GNUNET_break (0);
    TALER_TESTING_interpreter_fail (pss->is);
    return;
  default:
    GNUNET_break (0);
    TALER_TESTING_interpreter_fail (pss->is);
    return;
  }
  TALER_TESTING_interpreter_next (pss->is);
}


/**
 * Run a "policy store" CMD.
 *
 * @param cls closure.
 * @param cmd command currently being run.
 * @param is interpreter state.
 */
static void
policy_store_run (void *cls,
                  const struct TALER_TESTING_Command *cmd,
                  struct TALER_TESTING_Interpreter *is)
{
  struct PolicyStoreState *pss = cls;

  pss->is = is;
  if (NULL != pss->prev_upload)
  {
    const struct TALER_TESTING_Command *ref;

    ref = TALER_TESTING_interpreter_lookup_command (is,
                                                    pss->prev_upload);
    if (NULL == ref)
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (pss->is);
      return;
    }
    {
      const struct ANASTASIS_CRYPTO_AccountPrivateKeyP *priv;

      if (GNUNET_OK !=
          ANASTASIS_TESTING_get_trait_account_priv (ref,
                                                    &priv))
      {
        GNUNET_break (0);
        TALER_TESTING_interpreter_fail (pss->is);
        return;
      }
      pss->anastasis_priv = *priv;
    }
    {
      const struct ANASTASIS_CRYPTO_AccountPublicKeyP *pub;

      if (GNUNET_OK !=
          ANASTASIS_TESTING_get_trait_account_pub (ref,
                                                   &pub))
      {
        GNUNET_break (0);
        TALER_TESTING_interpreter_fail (pss->is);
        return;
      }
      pss->anastasis_pub = *pub;
    }
    {
      const struct ANASTASIS_PaymentSecretP *ps;

      if (GNUNET_OK !=
          ANASTASIS_TESTING_get_trait_payment_secret (ref,
                                                      &ps))
      {
        GNUNET_break (0);
        TALER_TESTING_interpreter_fail (pss->is);
        return;
      }
      pss->payment_secret_request = *ps;
      pss->payment_secret_set = true;
    }
  }
  else
  {
    GNUNET_CRYPTO_eddsa_key_create (&pss->anastasis_priv.priv);
    GNUNET_CRYPTO_eddsa_key_get_public (&pss->anastasis_priv.priv,
                                        &pss->anastasis_pub.pub);
  }

  GNUNET_CRYPTO_hash (pss->recovery_data,
                      pss->recovery_data_size,
                      &pss->curr_hash);
  pss->pso = ANASTASIS_policy_store (
    is->ctx,
    pss->anastasis_url,
    &pss->anastasis_priv,
    pss->recovery_data,
    pss->recovery_data_size,
    (0 != (ANASTASIS_TESTING_PSO_REQUEST_PAYMENT & pss->psopt)),
    pss->payment_secret_set ? &pss->payment_secret_request : NULL,
    GNUNET_TIME_UNIT_ZERO,
    &policy_store_cb,
    pss);
  if (NULL == pss->pso)
  {
    GNUNET_break (0);
    TALER_TESTING_interpreter_fail (pss->is);
    return;
  }
}


/**
 * Free the state of a "policy store" CMD, and possibly
 * cancel it if it did not complete.
 *
 * @param cls closure.
 * @param cmd command being freed.
 */
static void
policy_store_cleanup (void *cls,
                      const struct TALER_TESTING_Command *cmd)
{
  struct PolicyStoreState *pss = cls;

  if (NULL != pss->pso)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                "Command '%s' did not complete (policy post)\n",
                cmd->label);
    ANASTASIS_policy_store_cancel (pss->pso);
    pss->pso = NULL;
  }
  GNUNET_free (pss->order_id);
  GNUNET_free (pss);
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
policy_store_traits (void *cls,
                     const void **ret,
                     const char *trait,
                     unsigned int index)
{
  struct PolicyStoreState *pss = cls;
  struct TALER_TESTING_Trait traits[] = {
    TALER_TESTING_make_trait_claim_token (&pss->claim_token),
    TALER_TESTING_make_trait_order_id (
      (const char **) &pss->order_id),
    ANASTASIS_TESTING_make_trait_hash (&pss->curr_hash),
    ANASTASIS_TESTING_make_trait_account_pub (&pss->anastasis_pub),
    ANASTASIS_TESTING_make_trait_account_priv (&pss->anastasis_priv),
    ANASTASIS_TESTING_make_trait_payment_secret (&pss->payment_secret_response),
    TALER_TESTING_trait_end ()
  };

  return TALER_TESTING_get_trait (traits,
                                  ret,
                                  trait,
                                  index);
}


struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_policy_store (
  const char *label,
  const char *anastasis_url,
  const char *prev_upload,
  unsigned int http_status,
  enum ANASTASIS_TESTING_PolicyStoreOption pso,
  const void *recovery_data,
  size_t recovery_data_size)
{
  struct PolicyStoreState *pss;

  pss = GNUNET_new (struct PolicyStoreState);
  pss->recovery_data = recovery_data;
  pss->recovery_data_size = recovery_data_size;
  pss->http_status = http_status;
  pss->psopt = pso;
  pss->anastasis_url = anastasis_url;
  pss->prev_upload = prev_upload;
  {
    struct TALER_TESTING_Command cmd = {
      .cls = pss,
      .label = label,
      .run = &policy_store_run,
      .cleanup = &policy_store_cleanup,
      .traits = &policy_store_traits
    };

    return cmd;
  }
}
