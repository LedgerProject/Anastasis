/*
  This file is part of Anastasis
  Copyright (C) 2020, 2021 Anastasis SARL

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
 * @file testing/testing_cmd_recover_secret.c
 * @brief command to execute the anastasis recovery service
 * @author Christian Grothoff
 * @author Dennis Neufeld
 * @author Dominik Meister
 */
#include "platform.h"
#include "anastasis_testing_lib.h"
#include <taler/taler_util.h>
#include <taler/taler_testing_lib.h>


/**
 * State for a "recover secret" CMD.
 */
struct RecoverSecretState
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
   * The /policy GET operation handle.
   */
  struct ANASTASIS_Recovery *recovery;

  /**
   * Reference to download command we expect to look up.
   */
  const char *download_reference;

  /**
   * Reference to core secret share we expect to look up.
   */
  const char *core_secret_reference;

  /**
   * Options for how we are supposed to do the download.
   */
  enum ANASTASIS_TESTING_RecoverSecretOption rsopt;

  /**
   * Identification data from the user
   */
  json_t *id_data;

  /**
   * Salt to be used to derive the id
   */
  struct ANASTASIS_CRYPTO_ProviderSaltP *salt;

  /**
   * Recovery information from the lookup
   */
  struct ANASTASIS_RecoveryInformation *ri;

  /**
   * Coresecret to check if decryption worked
   */
  const void **core_secret;

  /**
   * Task scheduled to wait for recovery to complete.
   */
  struct GNUNET_SCHEDULER_Task *recovery_task;

  /**
   * version of the recovery document
   */
  unsigned int version;

  /**
   * #GNUNET_OK if the secret was recovered, #GNUNET_SYSERR if
   * recovery failed (yielded wrong secret).
   */
  int recovered;
};


/**
 * Callback which passes back the recovery document and its possible
 * policies. Also passes back the version of the document for the user
 * to check.
 *
 * @param cls closure for the callback
 * @param ri recovery information struct which contains the policies
 */
static void
policy_lookup_cb (void *cls,
                  const struct ANASTASIS_RecoveryInformation *ri)
{
  struct RecoverSecretState *rss = cls;

  rss->ri = (struct ANASTASIS_RecoveryInformation *) ri;
  if (NULL == ri)
  {
    GNUNET_break (0);
    TALER_TESTING_interpreter_fail (rss->is);
    return;
  }
  TALER_TESTING_interpreter_next (rss->is);
}


/**
 * This function is called whenever the recovery process ends.
 * On success, the secret is returned in @a secret.
 *
 * @param cls closure
 * @param rc error code
 * @param secret contains the core secret which is passed to the user
 * @param secret_size defines the size of the core secret
 */
static void
core_secret_cb (void *cls,
                enum ANASTASIS_RecoveryStatus rc,
                const void *secret,
                size_t secret_size)
{
  struct RecoverSecretState *rss = cls;

  rss->recovery = NULL;
  if (ANASTASIS_RS_SUCCESS != rc)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Recovery failed with status %d\n",
                rc);
    TALER_TESTING_interpreter_fail (rss->is);
    return;
  }
  if (0 != memcmp (secret,
                   *rss->core_secret,
                   secret_size))
  {
    GNUNET_break (0);
    rss->recovered = GNUNET_SYSERR;
    if (NULL != rss->recovery_task)
    {
      GNUNET_SCHEDULER_cancel (rss->recovery_task);
      rss->recovery_task = NULL;
      TALER_TESTING_interpreter_fail (rss->is);
    }
    return;
  }
  rss->recovered = GNUNET_OK;
  if (NULL != rss->recovery_task)
  {
    GNUNET_SCHEDULER_cancel (rss->recovery_task);
    rss->recovery_task = NULL;
    TALER_TESTING_interpreter_next (rss->is);
  }
}


/**
 * Run a "recover secret" CMD.
 *
 * @param cls closure.
 * @param cmd command currently being run.
 * @param is interpreter state.
 */
static void
recover_secret_run (void *cls,
                    const struct TALER_TESTING_Command *cmd,
                    struct TALER_TESTING_Interpreter *is)
{
  struct RecoverSecretState *rss = cls;
  const struct TALER_TESTING_Command *ref;
  const struct ANASTASIS_CRYPTO_ProviderSaltP *salt;
  rss->is = is;

  if (NULL != rss->download_reference)
  {
    ref = TALER_TESTING_interpreter_lookup_command
            (is,
            rss->download_reference);
    if (NULL == ref)
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (rss->is);
      return;
    }
    if (GNUNET_OK !=
        ANASTASIS_TESTING_get_trait_salt (ref,
                                          &salt))
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (rss->is);
      return;
    }
  }
  if (NULL != rss->core_secret_reference)
  {
    ref = TALER_TESTING_interpreter_lookup_command (
      is,
      rss->core_secret_reference);
    if (NULL == ref)
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (rss->is);
      return;
    }
    if (GNUNET_OK !=
        ANASTASIS_TESTING_get_trait_core_secret (
          ref,
          (const void ***) &rss->core_secret))
    {
      GNUNET_break (0);
      TALER_TESTING_interpreter_fail (rss->is);
      return;
    }
  }
  rss->recovery = ANASTASIS_recovery_begin (is->ctx,
                                            rss->id_data,
                                            rss->version,
                                            rss->anastasis_url,
                                            salt,
                                            &policy_lookup_cb,
                                            rss,
                                            &core_secret_cb,
                                            rss);
  if (NULL == rss->recovery)
  {
    GNUNET_break (0);
    TALER_TESTING_interpreter_fail (rss->is);
    return;
  }
}


/**
 * Task to run the abort routine on the given @a cls object
 * after the stack has fully unwound.
 *
 * @param cls a `struct ANASTASIS_Recovery *`
 */
static void
delayed_abort (void *cls)
{
  struct ANASTASIS_Recovery *recovery = cls;

  ANASTASIS_recovery_abort (recovery);
}


/**
 * Free the state of a "recover secret" CMD, and possibly
 * cancel it if it did not complete.
 *
 * @param cls closure
 * @param cmd command being freed.
 */
static void
recover_secret_cleanup (void *cls,
                        const struct TALER_TESTING_Command *cmd)
{
  struct RecoverSecretState *rss = cls;

  if (NULL != rss->recovery)
  {
    /* must run first, or at least before #core_secret_cb */
    (void) GNUNET_SCHEDULER_add_with_priority (
      GNUNET_SCHEDULER_PRIORITY_SHUTDOWN,
      &delayed_abort,
      rss->recovery);
    rss->recovery = NULL;
  }
  if (NULL != rss->recovery_task)
  {
    GNUNET_SCHEDULER_cancel (rss->recovery_task);
    rss->recovery_task = NULL;
  }
  json_decref (rss->id_data);
  GNUNET_free (rss);
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
recover_secret_traits (void *cls,
                       const void **ret,
                       const char *trait,
                       unsigned int index)
{
  struct RecoverSecretState *rss = cls;

  if (NULL == rss->ri)
  {
    GNUNET_break (0);
    return GNUNET_SYSERR;
  }
  if (index >= rss->ri->cs_len)
  {
    GNUNET_break (0);
    return GNUNET_SYSERR;
  }
  {
    struct TALER_TESTING_Trait traits[] = {
      ANASTASIS_TESTING_make_trait_challenges (
        index,
        (const struct ANASTASIS_Challenge **) &rss->ri->cs[index]),
      TALER_TESTING_trait_end ()
    };

    return TALER_TESTING_get_trait (traits,
                                    ret,
                                    trait,
                                    index);
  }
}


/**
 * Function called on timeout of the secret finishing operation.
 *
 * @param cls a `struct RecoverSecretState *`
 */
static void
recovery_fail (void *cls)
{
  struct RecoverSecretState *rss = cls;

  rss->recovery_task = NULL;
  GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
              "Timeout during secret recovery\n");
  TALER_TESTING_interpreter_fail (rss->is);
}


/**
 * Wait @a delay for @a cmd to finish secret recovery.
 *
 * @param cmd command to wait on
 * @param delay how long to wait at most
 */
static void
recover_secret_finish (struct TALER_TESTING_Command *cmd,
                       struct GNUNET_TIME_Relative delay)
{
  struct RecoverSecretState *rss = cmd->cls;

  GNUNET_assert (&recover_secret_run == cmd->run);
  GNUNET_assert (NULL == rss->recovery_task);
  switch (rss->recovered)
  {
  case GNUNET_OK:
    TALER_TESTING_interpreter_next (rss->is);
    break;
  case GNUNET_NO:
    rss->recovery_task = GNUNET_SCHEDULER_add_delayed (delay,
                                                       &recovery_fail,
                                                       rss);
    break;
  case GNUNET_SYSERR:
    TALER_TESTING_interpreter_fail (rss->is);
    break;
  }
}


struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_recover_secret (
  const char *label,
  const char *anastasis_url,
  const json_t *id_data,
  unsigned int version,
  enum ANASTASIS_TESTING_RecoverSecretOption rso,
  const char *download_ref,
  const char *core_secret_ref)
{
  struct RecoverSecretState *rss;

  rss = GNUNET_new (struct RecoverSecretState);
  rss->version = version;
  rss->id_data = json_incref ((json_t *) id_data);
  rss->rsopt = rso;
  rss->anastasis_url = anastasis_url;
  rss->download_reference = download_ref;
  rss->core_secret_reference = core_secret_ref;
  {
    struct TALER_TESTING_Command cmd = {
      .cls = rss,
      .label = label,
      .run = &recover_secret_run,
      .cleanup = &recover_secret_cleanup,
      .traits = &recover_secret_traits
    };

    return cmd;
  }
}


/**
 * State for a "recover secret finish" CMD.
 */
struct RecoverSecretFinishState
{
  /**
   * The interpreter state.
   */
  struct TALER_TESTING_Interpreter *is;

  /**
   * URL of the anastasis backend.
   */
  const char *recover_label;

  /**
   * Timeout.
   */
  struct GNUNET_TIME_Relative timeout;

};


/**
 * Run a "recover secret finish" CMD.
 *
 * @param cls closure.
 * @param cmd command currently being run.
 * @param is interpreter state.
 */
static void
recover_secret_finish_run (void *cls,
                           const struct TALER_TESTING_Command *cmd,
                           struct TALER_TESTING_Interpreter *is)
{
  struct RecoverSecretFinishState *rsfs = cls;
  struct TALER_TESTING_Command *ref;

  rsfs->is = is;
  ref = (struct TALER_TESTING_Command *)
        TALER_TESTING_interpreter_lookup_command (is,
                                                  rsfs->recover_label);
  if (NULL == ref)
  {
    GNUNET_break (0);
    TALER_TESTING_interpreter_fail (rsfs->is);
    return;
  }
  recover_secret_finish (ref,
                         rsfs->timeout);
}


/**
 * Free the state of a "recover secret finish" CMD, and possibly
 * cancel it if it did not complete.
 *
 * @param cls closure
 * @param cmd command being freed.
 */
static void
recover_secret_finish_cleanup (void *cls,
                               const struct TALER_TESTING_Command *cmd)
{
  struct RecoverSecretFinishState *rsfs = cls;

  GNUNET_free (rsfs);
}


struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_recover_secret_finish (
  const char *label,
  const char *recover_label,
  struct GNUNET_TIME_Relative timeout)
{
  struct RecoverSecretFinishState *rsfs;

  rsfs = GNUNET_new (struct RecoverSecretFinishState);
  rsfs->recover_label = recover_label;
  rsfs->timeout = timeout;
  {
    struct TALER_TESTING_Command cmd = {
      .cls = rsfs,
      .label = label,
      .run = &recover_secret_finish_run,
      .cleanup = &recover_secret_finish_cleanup
    };

    return cmd;
  }
}


/* end of testing_cmd_recover_secret.c */
