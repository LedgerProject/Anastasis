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
 * @file testing/testing_api_cmd_policy_lookup.c
 * @brief command to execute the anastasis backend service.
 * @author Dennis Neufeld
 * @author Dominik Meister
 */

#include "platform.h"
#include "anastasis_testing_lib.h"
#include <taler/taler_util.h>
#include <taler/taler_testing_lib.h>


/**
 * State for a "policy lookup" CMD.
 */
struct PolicyLookupState
{
  /**
   * The interpreter state.
   */
  struct TALER_TESTING_Interpreter *is;

  /**
   * Eddsa Publickey.
   */
  struct ANASTASIS_CRYPTO_AccountPublicKeyP anastasis_pub;

  /**
   * Hash of the upload (all zeros if there was no upload).
   */
  const struct GNUNET_HashCode *upload_hash;

  /**
   * URL of the anastasis backend.
   */
  const char *anastasis_url;

  /**
   * Expected status code.
   */
  unsigned int http_status;

  /**
   * Reference to upload command we expect to lookup.
   */
  const char *upload_reference;

  /**
   * The /policy GET operation handle.
   */
  struct ANASTASIS_PolicyLookupOperation *plo;
};


/**
 * Function called with the results of a #ANASTASIS_policy_lookup().
 *
 * @param cls closure
 * @param http_status HTTP status of the request
 * @param dd details about the lookup operation
 */
static void
policy_lookup_cb (void *cls,
                  unsigned int http_status,
                  const struct ANASTASIS_DownloadDetails *dd)
{
  struct PolicyLookupState *pls = cls;

  pls->plo = NULL;
  if (http_status != pls->http_status)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Unexpected response code %u to command %s in %s:%u\n",
                http_status,
                pls->is->commands[pls->is->ip].label,
                __FILE__,
                __LINE__);
    TALER_TESTING_interpreter_fail (pls->is);
    return;
  }
  if (NULL != pls->upload_reference)
  {
    if ( (MHD_HTTP_OK == http_status) &&
         (0 != GNUNET_memcmp (&dd->curr_policy_hash,
                              pls->upload_hash)) )
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (pls->is);
      return;
    }
  }
  TALER_TESTING_interpreter_next (pls->is);
}


/**
 * Run a "policy lookup" CMD.
 *
 * @param cls closure.
 * @param cmd command currently being run.
 * @param is interpreter state.
 */
static void
policy_lookup_run (void *cls,
                   const struct TALER_TESTING_Command *cmd,
                   struct TALER_TESTING_Interpreter *is)
{
  struct PolicyLookupState *pls = cls;

  pls->is = is;
  if (NULL != pls->upload_reference)
  {
    const struct TALER_TESTING_Command *upload_cmd;
    const struct ANASTASIS_CRYPTO_AccountPublicKeyP *anastasis_pub;

    upload_cmd = TALER_TESTING_interpreter_lookup_command
                   (is,
                   pls->upload_reference);
    if (NULL == upload_cmd)
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (pls->is);
      return;
    }
    if (GNUNET_OK !=
        ANASTASIS_TESTING_get_trait_hash (upload_cmd,
                                          &pls->upload_hash))
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (pls->is);
      return;
    }
    if (GNUNET_OK !=
        ANASTASIS_TESTING_get_trait_account_pub (upload_cmd,
                                                 &anastasis_pub))
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (pls->is);
      return;
    }
    pls->anastasis_pub = *anastasis_pub;
  }
  pls->plo = ANASTASIS_policy_lookup (is->ctx,
                                      pls->anastasis_url,
                                      &pls->anastasis_pub,
                                      &policy_lookup_cb,
                                      pls);
  if (NULL == pls->plo)
  {
    GNUNET_break (0);
    TALER_TESTING_interpreter_fail (pls->is);
    return;
  }
}


/**
 * Free the state of a "policy lookup" CMD, and possibly
 * cancel it if it did not complete.
 *
 * @param cls closure.
 * @param cmd command being freed.
 */
static void
policy_lookup_cleanup (void *cls,
                       const struct TALER_TESTING_Command *cmd)
{
  struct PolicyLookupState *pls = cls;

  if (NULL != pls->plo)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                "Command '%s' did not complete (policy lookup)\n",
                cmd->label);
    ANASTASIS_policy_lookup_cancel (pls->plo);
    pls->plo = NULL;
  }
  GNUNET_free (pls);
}


struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_policy_lookup (const char *label,
                                     const char *anastasis_url,
                                     unsigned int http_status,
                                     const char *upload_ref)
{
  struct PolicyLookupState *pls;

  GNUNET_assert (NULL != upload_ref);
  pls = GNUNET_new (struct PolicyLookupState);
  pls->http_status = http_status;
  pls->anastasis_url = anastasis_url;
  pls->upload_reference = upload_ref;
  {
    struct TALER_TESTING_Command cmd = {
      .cls = pls,
      .label = label,
      .run = &policy_lookup_run,
      .cleanup = &policy_lookup_cleanup
    };

    return cmd;
  }
}


struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_policy_nx (const char *label,
                                 const char *anastasis_url)
{
  struct PolicyLookupState *pls;
  struct GNUNET_CRYPTO_EddsaPrivateKey priv;

  pls = GNUNET_new (struct PolicyLookupState);
  pls->http_status = MHD_HTTP_NOT_FOUND;
  pls->anastasis_url = anastasis_url;
  GNUNET_CRYPTO_eddsa_key_create (&priv);
  GNUNET_CRYPTO_eddsa_key_get_public (&priv,
                                      &pls->anastasis_pub.pub);
  {
    struct TALER_TESTING_Command cmd = {
      .cls = pls,
      .label = label,
      .run = &policy_lookup_run,
      .cleanup = &policy_lookup_cleanup
    };

    return cmd;
  }
}
