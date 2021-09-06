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
 * @file testing/testing_cmd_policy_create.c
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
 * State for a "policy create" CMD.
 */
struct PolicyCreateState
{
  /**
   * The interpreter state.
   */
  struct TALER_TESTING_Interpreter *is;

  /**
   * Label of this command.
   */
  const char *label;

  /**
   * References to upload commands of previous truth uploads.
   */
  const char **cmd_label_array;

  /**
   * Length of array of command labels (cmd_label_array).
   */
  unsigned int cmd_label_array_length;

  /**
   * Policy object
   */
  struct ANASTASIS_Policy *policy;
};


/**
 * Run a "policy create" CMD.
 *
 * @param cls closure.
 * @param cmd command currently being run.
 * @param is interpreter state.
 */
static void
policy_create_run (void *cls,
                   const struct TALER_TESTING_Command *cmd,
                   struct TALER_TESTING_Interpreter *is)
{
  struct PolicyCreateState *pcs = cls;
  const struct ANASTASIS_Truth *truths[pcs->cmd_label_array_length];

  GNUNET_assert (pcs->cmd_label_array_length > 0);
  GNUNET_assert (NULL != pcs->cmd_label_array);
  pcs->is = is;
  if (NULL != pcs->cmd_label_array)
  {
    for (unsigned int i = 0; i < pcs->cmd_label_array_length; i++)
    {
      const struct TALER_TESTING_Command *ref;
      const struct ANASTASIS_Truth *truth;

      ref = TALER_TESTING_interpreter_lookup_command (is,
                                                      pcs->cmd_label_array[i]);
      if (NULL == ref)
      {
        GNUNET_break (0);
        TALER_TESTING_interpreter_fail (pcs->is);
        return;
      }
      if (GNUNET_OK !=
          ANASTASIS_TESTING_get_trait_truth (ref,
                                             0,
                                             &truth))
      {
        GNUNET_break (0);
        TALER_TESTING_interpreter_fail (pcs->is);
        return;
      }
      GNUNET_assert (NULL != truth);
      truths[i] = truth;
    }
  }

  pcs->policy = ANASTASIS_policy_create (truths,
                                         pcs->cmd_label_array_length);

  if (NULL == pcs->policy)
  {
    GNUNET_break (0);
    TALER_TESTING_interpreter_fail (pcs->is);
    return;
  }
  TALER_TESTING_interpreter_next (pcs->is);
}


/**
 * Free the state of a "policy create" CMD, and possibly
 * cancel it if it did not complete.
 *
 * @param cls closure.
 * @param cmd command being freed.
 */
static void
policy_create_cleanup (void *cls,
                       const struct TALER_TESTING_Command *cmd)
{
  struct PolicyCreateState *pcs = cls;

  GNUNET_free (pcs->cmd_label_array);
  if (NULL != pcs->policy)
  {
    ANASTASIS_policy_destroy (pcs->policy);
    pcs->policy = NULL;
  }
  GNUNET_free (pcs);
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
policy_create_traits (void *cls,
                      const void **ret,
                      const char *trait,
                      unsigned int index)
{
  struct PolicyCreateState *pcs = cls;
  struct TALER_TESTING_Trait traits[] = {
    ANASTASIS_TESTING_make_trait_policy (0,
                                         pcs->policy),
    TALER_TESTING_trait_end ()
  };

  return TALER_TESTING_get_trait (traits,
                                  ret,
                                  trait,
                                  index);
}


struct TALER_TESTING_Command
ANASTASIS_TESTING_cmd_policy_create (const char *label,
                                     ...)
{
  struct PolicyCreateState *pcs;
  va_list ap;
  const char *truth_upload_cmd;

  pcs = GNUNET_new (struct PolicyCreateState);
  pcs->label = label;

  va_start (ap,
            label);
  while (NULL != (truth_upload_cmd = va_arg (ap, const char *)))
  {
    GNUNET_array_append (pcs->cmd_label_array,
                         pcs->cmd_label_array_length,
                         truth_upload_cmd);
  }
  va_end (ap);
  {
    struct TALER_TESTING_Command cmd = {
      .cls = pcs,
      .label = label,
      .run = &policy_create_run,
      .cleanup = &policy_create_cleanup,
      .traits = &policy_create_traits
    };

    return cmd;
  }
}


/* end of testing_cmd_policy_create.c */
