/*
  This file is part of Anastasis
  Copyright (C) 2020, 2021 Anastasis SARL

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
 * @file reducer/anastasis_api_backup_redux.c
 * @brief anastasis reducer backup api
 * @author Christian Grothoff
 * @author Dominik Meister
 * @author Dennis Neufeld
 */

#include "platform.h"
#include "anastasis_redux.h"
#include "anastasis_api_redux.h"
#include <taler/taler_merchant_service.h>

/**
 * How long do Anastasis providers store data if the service
 * is free? Must match #ANASTASIS_MAX_YEARS_STORAGE from
 * anastasis-httpd.h.
 */
#define ANASTASIS_FREE_STORAGE GNUNET_TIME_relative_multiply ( \
    GNUNET_TIME_UNIT_YEARS, 5)

/**
 * CPU limiter: do not evaluate more than 16k
 * possible policy combinations to find the "best"
 * policy.
 */
#define MAX_EVALUATIONS (1024 * 16)


#define GENERATE_STRING(STRING) #STRING,
static const char *backup_strings[] = {
  ANASTASIS_BACKUP_STATES (GENERATE_STRING)
};
#undef GENERATE_STRING


/**
 * Linked list of costs.
 */
struct Costs
{

  /**
   * Kept in a LL.
   */
  struct Costs *next;

  /**
   * Cost in one of the currencies.
   */
  struct TALER_Amount cost;
};


/**
 * Add amount from @a cost to @a my_cost list.
 *
 * @param[in,out] my_cost pointer to list to modify
 * @param cost amount to add
 */
static void
add_cost (struct Costs **my_cost,
          const struct TALER_Amount *cost)
{
  for (struct Costs *pos = *my_cost;
       NULL != pos;
       pos = pos->next)
  {
    if (GNUNET_OK !=
        TALER_amount_cmp_currency (&pos->cost,
                                   cost))
      continue;
    GNUNET_assert (0 <=
                   TALER_amount_add (&pos->cost,
                                     &pos->cost,
                                     cost));
    return;
  }
  {
    struct Costs *nc;

    nc = GNUNET_new (struct Costs);
    nc->cost = *cost;
    nc->next = *my_cost;
    *my_cost = nc;
  }
}


/**
 * Add amount from @a cost to @a my_cost list.
 *
 * @param[in,out] my_cost pointer to list to modify
 * @param cost amount to add
 */
static void
add_costs (struct Costs **my_cost,
           const struct Costs *costs)
{
  for (const struct Costs *pos = costs;
       NULL != pos;
       pos = pos->next)
  {
    add_cost (my_cost,
              &pos->cost);
  }
}


enum ANASTASIS_BackupState
ANASTASIS_backup_state_from_string_ (const char *state_string)
{
  for (enum ANASTASIS_BackupState i = 0;
       i < sizeof (backup_strings) / sizeof(*backup_strings);
       i++)
    if (0 == strcmp (state_string,
                     backup_strings[i]))
      return i;
  return ANASTASIS_BACKUP_STATE_ERROR;
}


const char *
ANASTASIS_backup_state_to_string_ (enum ANASTASIS_BackupState bs)
{
  if ( (bs < 0) ||
       (bs >= sizeof (backup_strings) / sizeof(*backup_strings)) )
  {
    GNUNET_break_op (0);
    return NULL;
  }
  return backup_strings[bs];
}


/**
 * Update the 'backup_state' field of @a state to @a new_backup_state.
 *
 * @param[in,out] state the state to transition
 * @param new_backup_state the state to transition to
 */
static void
set_state (json_t *state,
           enum ANASTASIS_BackupState new_backup_state)
{
  GNUNET_assert (
    0 ==
    json_object_set_new (
      state,
      "backup_state",
      json_string (ANASTASIS_backup_state_to_string_ (new_backup_state))));
}


/**
 * Returns an initial ANASTASIS backup state (CONTINENT_SELECTING).
 *
 * @param cfg handle for gnunet configuration
 * @return NULL on failure
 */
json_t *
ANASTASIS_backup_start (const struct GNUNET_CONFIGURATION_Handle *cfg)
{
  json_t *initial_state;

  (void) cfg;
  initial_state = ANASTASIS_REDUX_load_continents_ ();
  if (NULL == initial_state)
    return NULL;
  set_state (initial_state,
             ANASTASIS_BACKUP_STATE_CONTINENT_SELECTING);
  return initial_state;
}


/**
 * Test if @a challenge_size is small enough for the provider's
 * @a size_limit_in_mb.
 *
 * We add 1024 to @a challenge_size here as a "safety margin" as
 * the encrypted challenge has some additional headers around it
 *
 * @param size_limit_in_mb provider's upload limit
 * @param challenge_size actual binary size of the challenge
 * @return true if this fits
 */
static bool
challenge_size_ok (uint32_t size_limit_in_mb,
                   size_t challenge_size)
{
  return (size_limit_in_mb * 1024LLU * 1024LLU >=
          challenge_size + 1024LLU);
}


/**
 * DispatchHandler/Callback function which is called for a
 * "add_authentication" action.
 * Returns an #ANASTASIS_ReduxAction if operation is async.
 *
 * @param state state to operate on
 * @param arguments arguments to use for operation on state
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 * @return NULL
 */
static struct ANASTASIS_ReduxAction *
add_authentication (json_t *state,
                    const json_t *arguments,
                    ANASTASIS_ActionCallback cb,
                    void *cb_cls)
{
  json_t *auth_providers;
  json_t *method;
  const char *method_type;
  void *challenge;
  size_t challenge_size;
  struct GNUNET_JSON_Specification spec[] = {
    GNUNET_JSON_spec_string ("type",
                             &method_type),
    GNUNET_JSON_spec_varsize ("challenge",
                              &challenge,
                              &challenge_size),
    GNUNET_JSON_spec_end ()
  };

  auth_providers = json_object_get (state,
                                    "authentication_providers");
  if (NULL == auth_providers)
  {
    GNUNET_break (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'authentication_providers' missing");
    return NULL;
  }

  method = json_object_get (arguments,
                            "authentication_method");
  if (NULL == method)
  {
    GNUNET_break (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "'authentication_method' required");
    return NULL;
  }
  if (GNUNET_OK !=
      GNUNET_JSON_parse (method,
                         spec,
                         NULL, NULL))
  {
    GNUNET_break (0);
    json_dumpf (method,
                stderr,
                JSON_INDENT (2));
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "'authentication_method' content malformed");
    return NULL;
  }
  /* Check we know at least one provider that supports this method */
  {
    bool found = false;
    bool too_big = false;
    json_t *details;
    const char *url;

    json_object_foreach (auth_providers, url, details)
    {
      json_t *methods;
      json_t *method;
      size_t index;
      uint32_t size_limit_in_mb;
      struct GNUNET_JSON_Specification ispec[] = {
        GNUNET_JSON_spec_uint32 ("storage_limit_in_megabytes",
                                 &size_limit_in_mb),
        GNUNET_JSON_spec_json ("methods",
                               &methods),
        GNUNET_JSON_spec_end ()
      };

      if (MHD_HTTP_OK !=
          json_integer_value (json_object_get (details,
                                               "http_status")))
        continue; /* skip providers that are down */
      if (GNUNET_OK !=
          GNUNET_JSON_parse (details,
                             ispec,
                             NULL, NULL))
      {
        GNUNET_break (0);
        continue;
      }
      json_array_foreach (methods, index, method)
      {
        const char *type;

        type = json_string_value (json_object_get (method,
                                                   "type"));
        GNUNET_break (NULL != type);
        if ( (NULL != type) &&
             (0 == strcmp (type,
                           method_type)) )
        {
          found = true;
          break;
        }
      }
      GNUNET_JSON_parse_free (ispec);
      if (! challenge_size_ok (size_limit_in_mb,
                               challenge_size))
      {
        /* Challenge data too big for this provider. Try to find another one.
           Note: we add 1024 to challenge-size here as a "safety margin" as
           the encrypted challenge has some additional headers around it */
        too_big = true;
        found = false;
      }
      if (found)
        break;
    }
    if (! found)
    {
      if (too_big)
      {
        ANASTASIS_redux_fail_ (cb,
                               cb_cls,
                               TALER_EC_ANASTASIS_REDUCER_CHALLENGE_DATA_TOO_BIG,
                               method_type);
      }
      else
      {
        ANASTASIS_redux_fail_ (cb,
                               cb_cls,
                               TALER_EC_ANASTASIS_REDUCER_AUTHENTICATION_METHOD_NOT_SUPPORTED,
                               method_type);
      }
      GNUNET_JSON_parse_free (spec);
      return NULL;
    }
  }
  GNUNET_JSON_parse_free (spec);

  /* append provided method to our array */
  {
    json_t *auth_method_arr;

    auth_method_arr = json_object_get (state,
                                       "authentication_methods");
    if (NULL == auth_method_arr)
    {
      auth_method_arr = json_array ();
      GNUNET_assert (0 == json_object_set_new (state,
                                               "authentication_methods",
                                               auth_method_arr));
    }
    if (! json_is_array (auth_method_arr))
    {
      GNUNET_break (0);
      ANASTASIS_redux_fail_ (cb,
                             cb_cls,
                             TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                             "'authentication_methods' must be an array");
      return NULL;
    }
    GNUNET_assert (0 ==
                   json_array_append (auth_method_arr,
                                      method));
    cb (cb_cls,
        TALER_EC_NONE,
        state);
  }
  return NULL;
}


/**
 * DispatchHandler/Callback function which is called for a
 * "delete_authentication" action.
 * Returns an #ANASTASIS_ReduxAction if operation is async.
 *
 * @param state state to operate on
 * @param arguments arguments to use for operation on state
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 * @return NULL
 */
static struct ANASTASIS_ReduxAction *
del_authentication (json_t *state,
                    const json_t *arguments,
                    ANASTASIS_ActionCallback cb,
                    void *cb_cls)
{
  json_t *idx;
  json_t *auth_method_arr;

  auth_method_arr = json_object_get (state,
                                     "authentication_methods");
  if (! json_is_array (auth_method_arr))
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'authentication_methods' must be an array");
    return NULL;
  }
  if (NULL == arguments)
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "arguments missing");
    return NULL;
  }
  idx = json_object_get (arguments,
                         "authentication_method");
  if ( (NULL == idx) ||
       (! json_is_integer (idx)) )
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "'authentication_method' must be a number");
    return NULL;
  }

  {
    size_t index = (size_t) json_integer_value (idx);

    if (0 != json_array_remove (auth_method_arr,
                                index))
    {
      ANASTASIS_redux_fail_ (cb,
                             cb_cls,
                             TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID_FOR_STATE,
                             "removal failed");
      return NULL;
    }
  }
  cb (cb_cls,
      TALER_EC_NONE,
      state);
  return NULL;
}


/* ********************** done_authentication ******************** */

/**
 * Which provider would be used for the given challenge,
 * and at what cost?
 */
struct PolicyEntry
{
  /**
   * URL of the provider.
   */
  const char *provider_name;

  /**
   * Recovery fee.
   */
  struct Costs *usage_fee;
};


/**
 * Map from challenges to providers.
 */
struct PolicyMap
{
  /**
   * Kept in a DLL.
   */
  struct PolicyMap *next;

  /**
   * Kept in a DLL.
   */
  struct PolicyMap *prev;

  /**
   * Array of proividers selected for each challenge,
   * with associated costs.
   * Length of the array will be 'req_methods'.
   */
  struct PolicyEntry *providers;

  /**
   * Diversity score for this policy mapping.
   */
  unsigned int diversity;

};


/**
 * Array of challenges for a policy, and DLL with
 * possible mappings of challenges to providers.
 */
struct Policy
{

  /**
   * Kept in DLL of all possible policies.
   */
  struct Policy *next;

  /**
   * Kept in DLL of all possible policies.
   */
  struct Policy *prev;

  /**
   * Head of DLL.
   */
  struct PolicyMap *pm_head;

  /**
   * Tail of DLL.
   */
  struct PolicyMap *pm_tail;

  /**
   * Challenges selected for this policy.
   * Length of the array will be 'req_methods'.
   */
  unsigned int *challenges;

};


/**
 * Information for running done_authentication() logic.
 */
struct PolicyBuilder
{
  /**
   * Authentication providers available overall, from our state.
   */
  json_t *providers;

  /**
   * Authentication methods available overall, from our state.
   */
  const json_t *methods;

  /**
   * Head of DLL of all possible policies.
   */
  struct Policy *p_head;

  /**
   * Tail of DLL of all possible policies.
   */
  struct Policy *p_tail;

  /**
   * Array of authentication policies to be computed.
   */
  json_t *policies;

  /**
   * Array of length @e req_methods.
   */
  unsigned int *m_idx;

  /**
   * Array of length @e req_methods identifying a set of providers selected
   * for each authentication method, while we are trying to compute the
   * 'best' allocation of providers to authentication methods.
   * Only valid during the go_with() function.
   */
  const char **best_sel;

  /**
   * Error hint to return on failure. Set if @e ec is not #TALER_EC_NONE.
   */
  const char *hint;

  /**
   * Policy we are currently building maps for.
   */
  struct Policy *current_policy;

  /**
   * LL of costs associated with the currently preferred
   * policy.
   */
  struct Costs *best_cost;

  /**
   * Array of 'best' policy maps found so far,
   * ordered by policy.
   */
  struct PolicyMap *best_map;

  /**
   * Array of the currency policy maps under evaluation
   * by find_best_map().
   */
  struct PolicyMap *curr_map;

  /**
   * How many mappings have we evaluated so far?
   * Used to limit the computation by aborting after
   * #MAX_EVALUATIONS trials.
   */
  unsigned int evaluations;

  /**
   * Overall number of challenges provided by the user.
   */
  unsigned int num_methods;

  /**
   * Number of challenges that must be satisfied to recover the secret.
   * Derived from the total number of challenges entered by the user.
   */
  unsigned int req_methods;

  /**
   * Number of different Anastasis providers selected in @e best_sel.
   * Only valid during the go_with() function.
   */
  unsigned int best_diversity;

  /**
   * Number of identical challenges duplicated at
   * various providers in the best case. Smaller is
   * better.
   */
  unsigned int best_duplicates;

  /**
   * Error code to return, #TALER_EC_NONE on success.
   */
  enum TALER_ErrorCode ec;

};


/**
 * Free @a costs LL.
 *
 * @param[in] costs linked list to free
 */
static void
free_costs (struct Costs *costs)
{
  while (NULL != costs)
  {
    struct Costs *next = costs->next;

    GNUNET_free (costs);
    costs = next;
  }
}


/**
 * Check if providers @a p1 and @a p2 have equivalent
 * methods and cost structures.
 *
 * @return true if the providers are fully equivalent
 */
static bool
equiv_provider (struct PolicyBuilder *pb,
                const char *p1,
                const char *p2)
{
  json_t *j1;
  json_t *j2;
  json_t *m1;
  json_t *m2;
  struct TALER_Amount uc1;
  struct TALER_Amount uc2;

  j1 = json_object_get (pb->providers,
                        p1);
  j2 = json_object_get (pb->providers,
                        p2);
  if ( (NULL == j1) ||
       (NULL == j2) )
  {
    GNUNET_break (0);
    return false;
  }

  {
    struct GNUNET_JSON_Specification s1[] = {
      GNUNET_JSON_spec_json ("methods",
                             &m1),
      TALER_JSON_spec_amount_any ("truth_upload_fee",
                                  &uc1),
      GNUNET_JSON_spec_end ()
    };

    if (GNUNET_OK !=
        GNUNET_JSON_parse (j1,
                           s1,
                           NULL, NULL))
    {
      GNUNET_break (0);
      return false;
    }
  }

  {
    struct GNUNET_JSON_Specification s2[] = {
      GNUNET_JSON_spec_json ("methods",
                             &m2),
      TALER_JSON_spec_amount_any ("truth_upload_fee",
                                  &uc2),
      GNUNET_JSON_spec_end ()
    };

    if (GNUNET_OK !=
        GNUNET_JSON_parse (j2,
                           s2,
                           NULL, NULL))
    {
      GNUNET_break (0);
      return false;
    }
  }

  if ( (GNUNET_OK !=
        TALER_amount_cmp_currency (&uc1,
                                   &uc2)) ||
       (0 !=
        TALER_amount_cmp (&uc1,
                          &uc2)) )
    return false;

  if (json_array_size (m1) != json_array_size (m2))
    return false;
  {
    size_t idx1;
    json_t *e1;

    json_array_foreach (m1, idx1, e1)
    {
      const char *type1;
      struct TALER_Amount fee1;
      struct GNUNET_JSON_Specification s1[] = {
        GNUNET_JSON_spec_string ("type",
                                 &type1),
        TALER_JSON_spec_amount_any ("usage_fee",
                                    &fee1),
        GNUNET_JSON_spec_end ()
      };
      bool matched = false;

      if (GNUNET_OK !=
          GNUNET_JSON_parse (e1,
                             s1,
                             NULL, NULL))
      {
        GNUNET_break (0);
        return false;
      }
      {
        size_t idx2;
        json_t *e2;

        json_array_foreach (m2, idx2, e2)
        {
          const char *type2;
          struct TALER_Amount fee2;
          struct GNUNET_JSON_Specification s2[] = {
            GNUNET_JSON_spec_string ("type",
                                     &type2),
            TALER_JSON_spec_amount_any ("usage_fee",
                                        &fee2),
            GNUNET_JSON_spec_end ()
          };

          if (GNUNET_OK !=
              GNUNET_JSON_parse (e2,
                                 s2,
                                 NULL, NULL))
          {
            GNUNET_break (0);
            return false;
          }
          if ( (0 == strcmp (type1,
                             type2)) &&
               (GNUNET_OK ==
                TALER_amount_cmp_currency (&fee1,
                                           &fee2)) &&
               (0 == TALER_amount_cmp (&fee1,
                                       &fee2)) )
          {
            matched = true;
            break;
          }
        }
      }
      if (! matched)
        return false;
    }
  }
  return true;
}


/**
 * Evaluate the cost/benefit of the provider selection in @a prov_sel
 * and if it is better then the best known one in @a pb, update @a pb.
 *
 * @param[in,out] pb our operational context
 * @param[in,out] prov_sel array of req_methods provider indices to complete
 */
static void
eval_provider_selection (struct PolicyBuilder *pb,
                         const char *prov_sel[])
{
  unsigned int curr_diversity;
  struct PolicyEntry policy_ent[pb->req_methods];

  memset (policy_ent,
          0,
          sizeof (policy_ent));
  for (unsigned int i = 0; i < pb->req_methods; i++)
  {
    const json_t *method_obj = json_array_get (pb->methods,
                                               pb->m_idx[i]);
    const json_t *provider_cfg = json_object_get (pb->providers,
                                                  prov_sel[i]);
    json_t *provider_methods;
    const char *method_type;
    json_t *md;
    size_t index;
    bool found = false;
    uint32_t size_limit_in_mb;
    struct TALER_Amount upload_cost;
    struct GNUNET_JSON_Specification pspec[] = {
      GNUNET_JSON_spec_uint32 ("storage_limit_in_megabytes",
                               &size_limit_in_mb),
      GNUNET_JSON_spec_json ("methods",
                             &provider_methods),
      TALER_JSON_spec_amount_any ("truth_upload_fee",
                                  &upload_cost),
      GNUNET_JSON_spec_end ()
    };
    void *challenge;
    size_t challenge_size;
    struct GNUNET_JSON_Specification mspec[] = {
      GNUNET_JSON_spec_string ("type",
                               &method_type),
      GNUNET_JSON_spec_varsize ("challenge",
                                &challenge,
                                &challenge_size),
      GNUNET_JSON_spec_end ()
    };

    policy_ent[i].provider_name = prov_sel[i];
    if (GNUNET_OK !=
        GNUNET_JSON_parse (method_obj,
                           mspec,
                           NULL, NULL))
    {
      GNUNET_break (0);
      pb->ec = TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID;
      pb->hint = "'authentication_method' content malformed";
      for (unsigned int i = 0; i<pb->req_methods; i++)
        free_costs (policy_ent[i].usage_fee);
      return;
    }

    if (MHD_HTTP_OK !=
        json_integer_value (json_object_get (provider_cfg,
                                             "http_status")))
    {
      GNUNET_JSON_parse_free (mspec);
      for (unsigned int i = 0; i<pb->req_methods; i++)
        free_costs (policy_ent[i].usage_fee);
      return; /* skip providers that are down */
    }
    if (GNUNET_OK !=
        GNUNET_JSON_parse (provider_cfg,
                           pspec,
                           NULL, NULL))
    {
      GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                  "Skipping provider %s: no suitable configuration\n",
                  prov_sel[i]);
      GNUNET_JSON_parse_free (mspec);
      for (unsigned int i = 0; i<pb->req_methods; i++)
        free_costs (policy_ent[i].usage_fee);
      return;
    }
    json_array_foreach (provider_methods, index, md)
    {
      const char *type;
      struct TALER_Amount method_cost;
      struct GNUNET_JSON_Specification spec[] = {
        GNUNET_JSON_spec_string ("type",
                                 &type),
        TALER_JSON_spec_amount_any ("usage_fee",
                                    &method_cost),
        GNUNET_JSON_spec_end ()
      };

      if (GNUNET_OK !=
          GNUNET_JSON_parse (md,
                             spec,
                             NULL, NULL))
      {
        GNUNET_break (0);
        pb->ec = TALER_EC_ANASTASIS_REDUCER_STATE_INVALID;
        pb->hint = "'methods' of provider";
        GNUNET_JSON_parse_free (pspec);
        for (unsigned int i = 0; i<pb->req_methods; i++)
          free_costs (policy_ent[i].usage_fee);
        return;
      }
      if ( (0 == strcmp (type,
                         method_type)) &&
           (challenge_size_ok (size_limit_in_mb,
                               challenge_size) ) )
      {
        found = true;

        add_cost (&policy_ent[i].usage_fee,
                  &method_cost);
        add_cost (&policy_ent[i].usage_fee,
                  &upload_cost);
      }
    }
    if (! found)
    {
      /* Provider does not OFFER this method, combination not possible.
         Cost is basically 'infinite', but we simply then skip this. */
      GNUNET_JSON_parse_free (pspec);
      GNUNET_JSON_parse_free (mspec);
      for (unsigned int i = 0; i<pb->req_methods; i++)
        free_costs (policy_ent[i].usage_fee);
      return;
    }
    GNUNET_JSON_parse_free (mspec);
    GNUNET_JSON_parse_free (pspec);
  }

  /* calculate provider diversity by counting number of different
     providers selected */
  curr_diversity = 0;
  for (unsigned int i = 0; i < pb->req_methods; i++)
  {
    bool found = false;

    for (unsigned int j = 0; j < i; j++)
    {
      if (prov_sel[i] == prov_sel[j])
      {
        found = true;
        break;
      }
    }
    if (! found)
      curr_diversity++;
  }
#if DEBUG
  fprintf (stderr,
           "Diversity: %u (best: %u)\n",
           curr_diversity,
           pb->best_diversity);
#endif
  if (curr_diversity < pb->best_diversity)
  {
    for (unsigned int i = 0; i<pb->req_methods; i++)
      free_costs (policy_ent[i].usage_fee);
    return; /* do not allow combinations that are bad
               for provider diversity */
  }
  if (curr_diversity > pb->best_diversity)
  {
    /* drop existing policies, they are all worse */
    struct PolicyMap *m;

    while (NULL != (m = pb->current_policy->pm_head))
    {
      GNUNET_CONTAINER_DLL_remove (pb->current_policy->pm_head,
                                   pb->current_policy->pm_tail,
                                   m);
      for (unsigned int i = 0; i<pb->req_methods; i++)
      {
        free_costs (m->providers[i].usage_fee);
        m->providers[i].usage_fee = NULL;
      }
      GNUNET_free (m->providers);
      GNUNET_free (m);
    }
    pb->best_diversity = curr_diversity;
  }
  if (NULL == pb->p_head)
  {
    /* For the first policy, check for equivalent
       policy mapping existing: we
     do not want to do spend CPU time investigating
     purely equivalent permutations */
    for (struct PolicyMap *m = pb->current_policy->pm_head;
         NULL != m;
         m = m->next)
    {
      bool equiv = true;
      for (unsigned int i = 0; i<pb->req_methods; i++)
      {
        if (! equiv_provider (pb,
                              m->providers[i].provider_name,
                              policy_ent[i].provider_name))
        {
          equiv = false;
          break;
        }
      }
      if (equiv)
      {
        for (unsigned int i = 0; i<pb->req_methods; i++)
          free_costs (policy_ent[i].usage_fee);
        return; /* equivalent to known allocation */
      }
    }
  }

  /* Add possible mapping to result list */
  {
    struct PolicyMap *m;

    m = GNUNET_new (struct PolicyMap);
    m->providers = GNUNET_new_array (pb->req_methods,
                                     struct PolicyEntry);
    memcpy (m->providers,
            policy_ent,
            sizeof (struct PolicyEntry) * pb->req_methods);
    m->diversity = curr_diversity;
    GNUNET_CONTAINER_DLL_insert (pb->current_policy->pm_head,
                                 pb->current_policy->pm_tail,
                                 m);
  }
}


/**
 * Recursively compute possible combination(s) of provider candidates
 * in @e prov_sel. The selection is complete up to index @a i.  Calls
 * eval_provider_selection() upon a feasible provider selection for
 * evaluation, resulting in "better" combinations being persisted in
 * @a pb.
 *
 * @param[in,out] pb our operational context
 * @param[in,out] prov_sel array of req_methods provider URLs to complete
 * @param i index up to which @a prov_sel is already initialized
 */
static void
provider_candidate (struct PolicyBuilder *pb,
                    const char *prov_sel[],
                    unsigned int i)
{
  const char *url;
  json_t *pconfig;

  json_object_foreach (pb->providers, url, pconfig)
  {
    prov_sel[i] = url;
    if (i == pb->req_methods - 1)
    {
      eval_provider_selection (pb,
                               prov_sel);
      if (TALER_EC_NONE != pb->ec)
        break;
      continue;
    }
    provider_candidate (pb,
                        prov_sel,
                        i + 1);
  }
}


/**
 * Using the selection of authentication methods from @a pb in
 * "m_idx", compute the best choice of providers.
 *
 * @param[in,out] pb our operational context
 */
static void
go_with (struct PolicyBuilder *pb)
{
  const char *prov_sel[pb->req_methods];
  struct Policy *policy;

  /* compute provider selection */
  policy = GNUNET_new (struct Policy);
  policy->challenges = GNUNET_new_array (pb->req_methods,
                                         unsigned int);
  memcpy (policy->challenges,
          pb->m_idx,
          pb->req_methods * sizeof (unsigned int));
  pb->current_policy = policy;
  pb->best_diversity = 0;
  provider_candidate (pb,
                      prov_sel,
                      0);
  GNUNET_CONTAINER_DLL_insert (pb->p_head,
                               pb->p_tail,
                               policy);
  pb->current_policy = NULL;
}


/**
 * Recursively computes all possible subsets of length "req_methods"
 * from an array of length "num_methods", calling "go_with" on each of
 * those subsets (in "m_idx").
 *
 * @param[in,out] pb our operational context
 * @param i offset up to which the "m_idx" has been computed
 */
static void
method_candidate (struct PolicyBuilder *pb,
                  unsigned int i)
{
  unsigned int start;
  unsigned int *m_idx = pb->m_idx;

  start = (i > 0) ? m_idx[i - 1] + 1 : 0;
  for (unsigned int j = start; j < pb->num_methods; j++)
  {
    m_idx[i] = j;
    if (i == pb->req_methods - 1)
    {
#if DEBUG
      fprintf (stderr,
               "Suggesting: ");
      for (unsigned int k = 0; k<pb->req_methods; k++)
      {
        fprintf (stderr,
                 "%u ",
                 m_idx[k]);
      }
      fprintf (stderr, "\n");
#endif
      go_with (pb);
      continue;
    }
    method_candidate (pb,
                      i + 1);
  }
}


/**
 * Lookup @a salt of @a provider_url in @a state.
 *
 * @param state the state to inspect
 * @param provider_url provider to look into
 * @param[out] salt value to extract
 * @return #GNUNET_OK on success
 */
static int
lookup_salt (const json_t *state,
             const char *provider_url,
             struct ANASTASIS_CRYPTO_ProviderSaltP *salt)
{
  const json_t *aps;
  const json_t *cfg;
  struct GNUNET_JSON_Specification spec[] = {
    GNUNET_JSON_spec_fixed_auto ("salt",
                                 salt),
    GNUNET_JSON_spec_end ()
  };

  aps = json_object_get (state,
                         "authentication_providers");
  if (NULL == aps)
  {
    GNUNET_break (0);
    return GNUNET_SYSERR;
  }
  cfg = json_object_get (aps,
                         provider_url);
  if (NULL == cfg)
  {
    GNUNET_break (0);
    return GNUNET_SYSERR;
  }
  if (MHD_HTTP_OK !=
      json_integer_value (json_object_get (cfg,
                                           "http_status")))
    return GNUNET_NO; /* skip providers that are down */
  if (GNUNET_OK !=
      GNUNET_JSON_parse (cfg,
                         spec,
                         NULL, NULL))
  {
    /* provider not working */
    GNUNET_break_op (0);
    return GNUNET_NO;
  }
  return GNUNET_OK;
}


/**
 * Compare two cost lists.
 *
 * @param my cost to compare
 * @param be cost to compare
 * @return 0 if costs are estimated equal,
 *         1 if @a my < @a be
 *        -1 if @a my > @a be
 */
static int
compare_costs (const struct Costs *my,
               const struct Costs *be)
{
  int ranking = 0;

  for (const struct Costs *cmp = be;
       NULL != cmp;
       cmp = cmp->next)
  {
    bool found = false;

    for (const struct Costs *pos = my;
         NULL != pos;
         pos = pos->next)
    {
      if (GNUNET_OK !=
          TALER_amount_cmp_currency (&cmp->cost,
                                     &pos->cost))
        continue;
      found = true;
    }
    if (! found)
      ranking--;   /* new policy has no cost in this currency */
  }

  for (const struct Costs *pos = my;
       NULL != pos;
       pos = pos->next)
  {
    bool found = false;

    for (const struct Costs *cmp = be;
         NULL != cmp;
         cmp = cmp->next)
    {
      if (GNUNET_OK !=
          TALER_amount_cmp_currency (&cmp->cost,
                                     &pos->cost))
        continue;
      found = true;
      switch (TALER_amount_cmp (&cmp->cost,
                                &pos->cost))
      {
      case -1:   /* cmp < pos */
        ranking--;
        break;
      case 0:
        break;
      case 1:   /* cmp > pos */
        ranking++;
        break;
      }
      break;
    }
    if (! found)
      ranking++;   /* old policy has no cost in this currency */
  }
  if (0 == ranking)
    return 0;
  return (0 > ranking) ? -1 : 1;
}


/**
 * Evaluate the combined policy map stack in the ``curr_map`` of @a pb
 * and compare to the current best cost. If we are better, save the
 * stack in the ``best_map``.
 *
 * @param[in,out] pb policy builder we evaluate for
 * @param num_policies length of the ``curr_map`` array
 */
static void
evaluate_map (struct PolicyBuilder *pb,
              unsigned int num_policies)
{
  struct Costs *my_cost = NULL;
  unsigned int i = 0;
  unsigned int duplicates = 0;
  int ccmp;

#if DEBUG
  fprintf (stderr,
           "Checking...\n");
#endif
  /* calculate cost */
  for (const struct Policy *p = pb->p_head;
       NULL != p;
       p = p->next)
  {
    const struct PolicyMap *pm = &pb->curr_map[i++];

#if DEBUG
    fprintf (stderr,
             "Evaluating %p (%u): ",
             p,
             pm->diversity);
    for (unsigned int k = 0; k<pb->req_methods; k++)
    {
      const struct PolicyEntry *pe = &pm->providers[k];

      fprintf (stderr,
               "%u->%s ",
               p->challenges[k],
               pe->provider_name);
    }
    fprintf (stderr, "\n");
#endif
    for (unsigned int j = 0; j<pb->req_methods; j++)
    {
      const struct PolicyEntry *pe = &pm->providers[j];
      unsigned int cv = p->challenges[j];
      bool found = false;
      unsigned int i2 = 0;

      /* check for duplicates */
      for (const struct Policy *p2 = pb->p_head;
           p2 != p;
           p2 = p2->next)
      {
        const struct PolicyMap *pm2 = &pb->curr_map[i2++];

        for (unsigned int j2 = 0; j2<pb->req_methods; j2++)
        {
          const struct PolicyEntry *pe2 = &pm2->providers[j2];
          unsigned int cv2 = p2->challenges[j2];

          if (cv != cv2)
            continue; /* different challenge */
          if (0 == strcmp (pe->provider_name,
                           pe2->provider_name))
            found = true; /* same challenge&provider! */
          else
            duplicates++; /* penalty for same challenge at two providers */
        }
      }
      if (! found)
      {
        add_costs (&my_cost,
                   pe->usage_fee);
      }
    }
  }

  ccmp = -1; /* non-zero if 'best_duplicates' is UINT_MAX */
  if ( (UINT_MAX != pb->best_duplicates) &&
       (0 > (ccmp = compare_costs (my_cost,
                                   pb->best_cost))) )
  {
    /* new method not clearly better, do not use it */
    free_costs (my_cost);
#if DEBUG
    fprintf (stderr,
             "... useless\n");
#endif
    return;
  }
  if ( (0 == ccmp) &&
       (duplicates > pb->best_duplicates) )
  {
    /* new method is cost-equal, but looses on duplicates,
       do not use it */
    free_costs (my_cost);
#if DEBUG
    fprintf (stderr,
             "... useless\n");
#endif
    return;
  }
  /* new method is better (or first), set as best */
#if DEBUG
  fprintf (stderr,
           "New best: %u duplicates, %s cost\n",
           duplicates,
           TALER_amount2s (&my_cost->cost));
#endif
  free_costs (pb->best_cost);
  pb->best_cost = my_cost;
  pb->best_duplicates = duplicates;
  memcpy (pb->best_map,
          pb->curr_map,
          sizeof (struct PolicyMap) * num_policies);
}


/**
 * Try all policy maps for @a pos and evaluate the
 * resulting total cost, saving the best result in
 * @a pb.
 *
 * @param[in,out] pb policy builder context
 * @param pos policy we are currently looking at maps for
 * @param off index of @a pos for the policy map
 */
static void
find_best_map (struct PolicyBuilder *pb,
               struct Policy *pos,
               unsigned int off)
{
  if (NULL == pos)
  {
    evaluate_map (pb,
                  off);
    pb->evaluations++;
    return;
  }
  for (struct PolicyMap *pm = pos->pm_head;
       NULL != pm;
       pm = pm->next)
  {
    pb->curr_map[off] = *pm;
    find_best_map (pb,
                   pos->next,
                   off + 1);
    if (pb->evaluations >= MAX_EVALUATIONS)
      break;
  }
}


/**
 * Select cheapest policy combinations and add them to the JSON ``policies``
 * array in @a pb
 *
 * @param[in,out] pb policy builder with our state
 */
static void
select_policies (struct PolicyBuilder *pb)
{
  unsigned int cnt = 0;

  for (struct Policy *p = pb->p_head;
       NULL != p;
       p = p->next)
    cnt++;
  {
    struct PolicyMap best[cnt];
    struct PolicyMap curr[cnt];
    unsigned int i;

    pb->best_map = best;
    pb->curr_map = curr;
    pb->best_duplicates = UINT_MAX; /* worst */
    find_best_map (pb,
                   pb->p_head,
                   0);
    GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                "Assessed %u/%u policies\n",
                pb->evaluations,
                (unsigned int) MAX_EVALUATIONS);
    i = 0;
    for (struct Policy *p = pb->p_head;
         NULL != p;
         p = p->next)
    {
      struct PolicyMap *pm = &best[i++];
      json_t *method_arr;

#if DEBUG
      fprintf (stderr,
               "Best map (%u): ",
               pm->diversity);
      for (unsigned int k = 0; k<pb->req_methods; k++)
      {
        fprintf (stderr,
                 "%u->%s ",
                 p->challenges[k],
                 pm->providers[k].provider_name);
      }
      fprintf (stderr, "\n");
#endif
      /* Convert "best" selection into 'policies' array */
      method_arr = json_array ();
      GNUNET_assert (NULL != method_arr);
      for (unsigned int i = 0; i < pb->req_methods; i++)
      {
        json_t *policy_method = GNUNET_JSON_PACK (
          GNUNET_JSON_pack_uint64 ("authentication_method",
                                   p->challenges[i]),
          GNUNET_JSON_pack_string ("provider",
                                   pm->providers[i].provider_name));

        GNUNET_assert (0 ==
                       json_array_append_new (method_arr,
                                              policy_method));
      }
      {
        json_t *policy = GNUNET_JSON_PACK (
          GNUNET_JSON_pack_array_steal (
            "methods",
            method_arr));

        GNUNET_assert (0 ==
                       json_array_append_new (pb->policies,
                                              policy));
      }
    }
  }
}


/**
 * Clean up @a pb, in particular the policies DLL.
 *
 * @param[in] pb builder to clean up
 */
static void
clean_pb (struct PolicyBuilder *pb)
{
  struct Policy *p;

  while (NULL != (p = pb->p_head))
  {
    struct PolicyMap *pm;

    while (NULL != (pm = p->pm_head))
    {
      GNUNET_CONTAINER_DLL_remove (p->pm_head,
                                   p->pm_tail,
                                   pm);
      for (unsigned int i = 0; i<pb->req_methods; i++)
        free_costs (pm->providers[i].usage_fee);
      GNUNET_free (pm->providers);
      GNUNET_free (pm);
    }
    GNUNET_CONTAINER_DLL_remove (pb->p_head,
                                 pb->p_tail,
                                 p);
    GNUNET_free (p->challenges);
    GNUNET_free (p);
  }
  free_costs (pb->best_cost);
}


/**
 * DispatchHandler/Callback function which is called for a
 * "done_authentication" action.  Automaticially computes policies
 * based on available Anastasis providers and challenges provided by
 * the user.
 *
 * @param state state to operate on
 * @param arguments arguments to use for operation on state
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 * @return NULL
 */
static struct ANASTASIS_ReduxAction *
done_authentication (json_t *state,
                     const json_t *arguments,
                     ANASTASIS_ActionCallback cb,
                     void *cb_cls)
{
  struct PolicyBuilder pb = {
    .ec = TALER_EC_NONE
  };
  json_t *providers;
  json_t *policy_providers;

  pb.providers = json_object_get (state,
                                  "authentication_providers");
  if ( (NULL == pb.providers) ||
       (! json_is_object (pb.providers) ) )
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'authentication_providers' must be provided");
    return NULL;
  }
  pb.methods = json_object_get (state,
                                "authentication_methods");
  if ( (NULL == pb.methods) ||
       (! json_is_array (pb.methods)) )
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'authentication_methods' must be provided");
    return NULL;
  }
  pb.num_methods = json_array_size (pb.methods);
  switch (pb.num_methods)
  {
  case 0:
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'authentication_methods' must not be empty");
    return NULL;
  case 1:
  case 2:
    pb.req_methods = pb.num_methods;
    break;
  case 3:
  case 4:
    pb.req_methods = pb.num_methods - 1;
    break;
  case 5:
  case 6:
    pb.req_methods = pb.num_methods - 2;
    break;
  case 7:
    pb.req_methods = pb.num_methods - 3;
    break;
  default:
    /* cap at 4 for auto-generation, algorithm
       to compute mapping gets too expensive
       otherwise. */
    pb.req_methods = 4;
    break;
  }
  {
    unsigned int m_idx[pb.req_methods];

    /* select req_methods from num_methods. */
    pb.m_idx = m_idx;
    method_candidate (&pb,
                      0);
  }
  pb.policies = json_array ();
  select_policies (&pb);
  clean_pb (&pb);
  if (TALER_EC_NONE != pb.ec)
  {
    json_decref (pb.policies);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           pb.ec,
                           pb.hint);
    return NULL;
  }
  GNUNET_assert (0 ==
                 json_object_set_new (state,
                                      "policies",
                                      pb.policies));
  providers = json_object_get (arguments,
                               "providers");
  if (NULL == providers)
  {
    /* Setup a providers array from all working providers */
    json_t *available = json_object_get (state,
                                         "authentication_providers");
    const char *url;
    json_t *details;

    policy_providers = json_array ();
    GNUNET_assert (NULL != policy_providers);
    json_object_foreach (available, url, details)
    {
      json_t *provider;
      struct ANASTASIS_CRYPTO_ProviderSaltP salt;

      if (GNUNET_OK !=
          lookup_salt (state,
                       url,
                       &salt))
        continue; /* skip providers that are down */
      provider = GNUNET_JSON_PACK (
        GNUNET_JSON_pack_string ("provider_url",
                                 url));
      GNUNET_assert (NULL != provider);
      GNUNET_assert (0 ==
                     json_array_append_new (policy_providers,
                                            provider));
    }
  }
  else
  {
    /* Setup a providers array from all working providers */
    size_t off;
    json_t *url;

    policy_providers = json_array ();
    json_array_foreach (providers, off, url)
    {
      json_t *provider;
      struct ANASTASIS_CRYPTO_ProviderSaltP salt;
      const char *url_str;

      url_str = json_string_value (url);
      if ( (NULL == url_str) ||
           (GNUNET_OK !=
            lookup_salt (state,
                         url_str,
                         &salt)) )
      {
        GNUNET_break (0);
        ANASTASIS_redux_fail_ (cb,
                               cb_cls,
                               TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                               "unworkable provider requested");
        return NULL;
      }
      provider = GNUNET_JSON_PACK (
        GNUNET_JSON_pack_string ("provider_url",
                                 url_str));
      GNUNET_assert (0 ==
                     json_array_append_new (policy_providers,
                                            provider));
    }
  }
  if (0 == json_array_size (policy_providers))
  {
    json_decref (policy_providers);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "no workable providers in state");
    return NULL;
  }
  GNUNET_assert (0 ==
                 json_object_set_new (state,
                                      "policy_providers",
                                      policy_providers));
  set_state (state,
             ANASTASIS_BACKUP_STATE_POLICIES_REVIEWING);
  cb (cb_cls,
      TALER_EC_NONE,
      state);
  return NULL;
}


/* ******************** add_provider ******************* */


/**
 * DispatchHandler/Callback function which is called for a
 * "add_provider" action.  Adds another Anastasis provider
 * to the list of available providers for storing information.
 *
 * @param state state to operate on
 * @param arguments arguments with a provider URL to add
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 */
static struct ANASTASIS_ReduxAction *
add_provider (json_t *state,
              const json_t *arguments,
              ANASTASIS_ActionCallback cb,
              void *cb_cls)
{
  if (ANASTASIS_add_provider_ (state,
                               arguments,
                               cb,
                               cb_cls))
    return NULL;
  return ANASTASIS_REDUX_backup_begin_ (state,
                                        NULL,
                                        cb,
                                        cb_cls);
}


/* ******************** add_policy ******************* */


/**
 * DispatchHandler/Callback function which is called for a
 * "add_policy" action.
 *
 * @param state state to operate on
 * @param arguments arguments to use for operation on state
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 * @return NULL
 */
static struct ANASTASIS_ReduxAction *
add_policy (json_t *state,
            const json_t *arguments,
            ANASTASIS_ActionCallback cb,
            void *cb_cls)
{
  const json_t *arg_array;
  json_t *policies;
  const json_t *auth_providers;
  const json_t *auth_methods;
  json_t *methods;

  if (NULL == arguments)
  {
    GNUNET_break (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "arguments missing");
    return NULL;
  }
  arg_array = json_object_get (arguments,
                               "policy");
  if (! json_is_array (arg_array))
  {
    GNUNET_break (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "'policy' not an array");
    return NULL;
  }
  policies = json_object_get (state,
                              "policies");
  if (! json_is_array (policies))
  {
    GNUNET_break (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'policies' not an array");
    return NULL;
  }
  auth_providers = json_object_get (state,
                                    "authentication_providers");
  if (! json_is_object (auth_providers))
  {
    GNUNET_break (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'auth_providers' not an object");
    return NULL;
  }
  auth_methods = json_object_get (state,
                                  "authentication_methods");
  if (! json_is_array (auth_methods))
  {
    GNUNET_break (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'auth_methods' not an array");
    return NULL;
  }

  methods = json_array ();
  GNUNET_assert (NULL != methods);

  /* Add all methods from 'arg_array' to 'methods' */
  {
    size_t index;
    json_t *method;

    json_array_foreach (arg_array, index, method)
    {
      const char *provider_url;
      uint32_t method_idx;
      json_t *prov_methods;
      const char *method_type;
      struct GNUNET_JSON_Specification spec[] = {
        GNUNET_JSON_spec_string ("provider",
                                 &provider_url),
        GNUNET_JSON_spec_uint32 ("authentication_method",
                                 &method_idx),
        GNUNET_JSON_spec_end ()
      };

      if (GNUNET_OK !=
          GNUNET_JSON_parse (method,
                             spec,
                             NULL, NULL))
      {
        GNUNET_break (0);
        json_decref (methods);
        ANASTASIS_redux_fail_ (cb,
                               cb_cls,
                               TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                               "'method' details malformed");
        return NULL;
      }

      {
        const json_t *prov_cfg;
        uint32_t limit;
        struct GNUNET_JSON_Specification spec[] = {
          GNUNET_JSON_spec_uint32 ("storage_limit_in_megabytes",
                                   &limit),
          GNUNET_JSON_spec_json ("methods",
                                 &prov_methods),
          GNUNET_JSON_spec_end ()
        };

        prov_cfg = json_object_get (auth_providers,
                                    provider_url);
        if (NULL == prov_cfg)
        {
          GNUNET_break (0);
          json_decref (methods);
          ANASTASIS_redux_fail_ (cb,
                                 cb_cls,
                                 TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                                 "provider URL unknown");
          return NULL;
        }
        if (MHD_HTTP_OK !=
            json_integer_value (json_object_get (prov_cfg,
                                                 "http_status")))
          continue;
        if (GNUNET_OK !=
            GNUNET_JSON_parse (prov_cfg,
                               spec,
                               NULL, NULL))
        {
          /* skip provider, likely was down */
          json_decref (methods);
          continue;
        }
        if (! json_is_array (prov_methods))
        {
          GNUNET_break (0);
          json_decref (methods);
          json_decref (prov_methods);
          ANASTASIS_redux_fail_ (cb,
                                 cb_cls,
                                 TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                                 "provider lacks authentication methods");
          return NULL;
        }
      }

      {
        const json_t *auth_method;

        auth_method = json_array_get (auth_methods,
                                      method_idx);
        if (NULL == auth_method)
        {
          GNUNET_break (0);
          json_decref (methods);
          json_decref (prov_methods);
          ANASTASIS_redux_fail_ (cb,
                                 cb_cls,
                                 TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                                 "authentication method unknown");
          return NULL;
        }
        method_type = json_string_value (json_object_get (auth_method,
                                                          "type"));
        if (NULL == method_type)
        {
          GNUNET_break (0);
          json_decref (methods);
          json_decref (prov_methods);
          ANASTASIS_redux_fail_ (cb,
                                 cb_cls,
                                 TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                                 "authentication method must be a string");
          return NULL;
        }
      }

      {
        bool found = false;
        size_t index;
        json_t *pm;
        json_array_foreach (prov_methods, index, pm)
        {
          struct TALER_Amount method_cost;
          const char *type;
          struct GNUNET_JSON_Specification spec[] = {
            GNUNET_JSON_spec_string ("type",
                                     &type),
            TALER_JSON_spec_amount_any ("usage_fee",
                                        &method_cost),
            GNUNET_JSON_spec_end ()
          };

          if (GNUNET_OK !=
              GNUNET_JSON_parse (pm,
                                 spec,
                                 NULL, NULL))
          {
            GNUNET_break (0);
            json_decref (methods);
            json_decref (prov_methods);
            ANASTASIS_redux_fail_ (cb,
                                   cb_cls,
                                   TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                                   "provider authentication method specification invalid");
            return NULL;
          }
          if (0 != strcmp (type,
                           method_type))
            continue;
          found = true;
          break;
        }
        if (! found)
        {
          GNUNET_break (0);
          json_decref (methods);
          json_decref (prov_methods);
          ANASTASIS_redux_fail_ (cb,
                                 cb_cls,
                                 TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                                 "selected provider does not support authentication method");
          return NULL;
        }
      }
      GNUNET_assert (0 ==
                     json_array_append (methods,
                                        method));
      json_decref (prov_methods);
    } /* end of json_array_foreach (arg_array, index, method) */
  }

  /* add new policy to array of existing policies */
  {
    json_t *policy;
    json_t *idx;

    policy = GNUNET_JSON_PACK (
      GNUNET_JSON_pack_array_steal ("methods",
                                    methods));
    idx = json_object_get (arguments,
                           "policy_index");
    if ( (NULL == idx) ||
         (! json_is_integer (idx)) )
    {
      GNUNET_assert (0 ==
                     json_array_append_new (policies,
                                            policy));
    }
    else
    {
      GNUNET_assert (0 ==
                     json_array_insert_new (policies,
                                            json_integer_value (idx),
                                            policy));
    }
  }

  cb (cb_cls,
      TALER_EC_NONE,
      state);
  return NULL;
}


/* ******************** update_policy ******************* */


/**
 * DispatchHandler/Callback function which is called for a
 * "update_policy" action.
 *
 * @param state state to operate on
 * @param arguments arguments to use for operation on state
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 * @return NULL
 */
static struct ANASTASIS_ReduxAction *
update_policy (json_t *state,
               const json_t *arguments,
               ANASTASIS_ActionCallback cb,
               void *cb_cls)
{
  const json_t *idx;
  size_t index;
  json_t *policy_arr;

  if (NULL == arguments)
  {
    GNUNET_break (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "arguments missing");
    return NULL;
  }
  idx = json_object_get (arguments,
                         "policy_index");
  if (! json_is_integer (idx))
  {
    GNUNET_break (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "'policy_index' must be an integer");
    return NULL;
  }
  index = json_integer_value (idx);
  policy_arr = json_object_get (state,
                                "policies");
  if (! json_is_array (policy_arr))
  {
    GNUNET_break (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'policies' must be an array");
    return NULL;
  }
  if (0 != json_array_remove (policy_arr,
                              index))
  {
    GNUNET_break (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID_FOR_STATE,
                           "removal failed");
    return NULL;
  }
  return add_policy (state,
                     arguments,
                     cb,
                     cb_cls);
}


/* ******************** del_policy ******************* */


/**
 * DispatchHandler/Callback function which is called for a
 * "delete_policy" action.
 *
 * @param state state to operate on
 * @param arguments arguments to use for operation on state
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 * @return NULL
 */
static struct ANASTASIS_ReduxAction *
del_policy (json_t *state,
            const json_t *arguments,
            ANASTASIS_ActionCallback cb,
            void *cb_cls)
{
  const json_t *idx;
  size_t index;
  json_t *policy_arr;

  if (NULL == arguments)
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "arguments missing");
    return NULL;
  }
  idx = json_object_get (arguments,
                         "policy_index");
  if (! json_is_integer (idx))
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "'policy_index' must be an integer");
    return NULL;
  }
  index = json_integer_value (idx);
  policy_arr = json_object_get (state,
                                "policies");
  if (! json_is_array (policy_arr))
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'policies' must be an array");
    return NULL;
  }
  if (0 != json_array_remove (policy_arr,
                              index))
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID_FOR_STATE,
                           "removal failed");
    return NULL;
  }
  cb (cb_cls,
      TALER_EC_NONE,
      state);
  return NULL;
}


/* ******************** del_challenge ******************* */


/**
 * DispatchHandler/Callback function which is called for a
 * "delete_challenge" action.
 *
 * @param state state to operate on
 * @param arguments arguments to use for operation on state
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 * @return NULL
 */
static struct ANASTASIS_ReduxAction *
del_challenge (json_t *state,
               const json_t *arguments,
               ANASTASIS_ActionCallback cb,
               void *cb_cls)
{
  const json_t *pidx;
  const json_t *cidx;
  size_t index;
  json_t *policy_arr;
  json_t *policy;
  json_t *method_arr;

  if (NULL == arguments)
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "arguments missing");
    return NULL;
  }
  pidx = json_object_get (arguments,
                          "policy_index");
  cidx = json_object_get (arguments,
                          "challenge_index");
  if (! json_is_integer (pidx))
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "'policy_index' must be an integer");
    return NULL;
  }
  if (! json_is_integer (cidx))
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "'challenge_index' must be an integer");
    return NULL;
  }
  index = json_integer_value (pidx);
  policy_arr = json_object_get (state,
                                "policies");
  if (! json_is_array (policy_arr))
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'policies' must be an array");
    return NULL;
  }
  policy = json_array_get (policy_arr,
                           index);
  if (NULL == policy)
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "'policy_index' out of range");
    return NULL;
  }
  method_arr = json_object_get (policy,
                                "methods");
  if (NULL == method_arr)
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID_FOR_STATE,
                           "methods missing in policy");
    return NULL;
  }
  index = json_integer_value (cidx);
  if (0 != json_array_remove (method_arr,
                              index))
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID_FOR_STATE,
                           "removal failed");
    return NULL;
  }
  cb (cb_cls,
      TALER_EC_NONE,
      state);
  return NULL;
}


/* ********************** done_policy_review ***************** */


/**
 * Calculate how many years of service we need
 * from the desired @a expiration time,
 * rounding up.
 *
 * @param expiration desired expiration time
 * @return number of years of service to pay for
*/
static unsigned int
expiration_to_years (struct GNUNET_TIME_Absolute expiration)
{
  struct GNUNET_TIME_Relative rem;
  unsigned int years;

  rem = GNUNET_TIME_absolute_get_remaining (expiration);
  years = rem.rel_value_us / GNUNET_TIME_UNIT_YEARS.rel_value_us;
  if (0 != rem.rel_value_us % GNUNET_TIME_UNIT_YEARS.rel_value_us)
    years++;
  return years;
}


/**
 * Update @a state such that the earliest expiration for
 * any truth or policy is @a expiration. Recalculate
 * the ``upload_fees`` array with the associated costs.
 *
 * @param[in,out] state our state to update
 * @param expiration new expiration to enforce
 * @return #GNUNET_OK on success,
 *         #GNUNET_SYSERR if the state is invalid
 */
static enum GNUNET_GenericReturnValue
update_expiration_cost (json_t *state,
                        struct GNUNET_TIME_Absolute expiration)
{
  struct Costs *costs = NULL;
  unsigned int years;
  json_t *providers;
  bool is_free = true;

  providers = json_object_get (state,
                               "authentication_providers");
  if (! json_is_object (providers))
  {
    GNUNET_break (0);
    return GNUNET_SYSERR;
  }

  years = expiration_to_years (expiration);

  /* go over all providers and add up cost */
  {
    const char *url;
    json_t *provider;

    json_object_foreach (providers, url, provider)
    {
      struct TALER_Amount annual_fee;
      struct GNUNET_JSON_Specification pspec[] = {
        TALER_JSON_spec_amount_any ("annual_fee",
                                    &annual_fee),
        GNUNET_JSON_spec_end ()
      };
      struct TALER_Amount fee;

      if (MHD_HTTP_OK !=
          json_integer_value (json_object_get (provider,
                                               "http_status")))
        continue; /* skip providers that are down */
      if (GNUNET_OK !=
          GNUNET_JSON_parse (provider,
                             pspec,
                             NULL, NULL))
      {
        /* strange, skip as well */
        GNUNET_break_op (0);
        continue;
      }
      if (0 >
          TALER_amount_multiply (&fee,
                                 &annual_fee,
                                 years))
      {
        GNUNET_break (0);
        return GNUNET_SYSERR;
      }
      add_cost (&costs,
                &fee);
    }
  }

  /* go over all truths and add up cost */
  {
    unsigned int off = 0;
    unsigned int len = 0;
    struct AlreadySeen
    {
      uint32_t method;
      const char *provider_url;
    } *seen = NULL;
    json_t *policies;
    size_t pidx;
    json_t *policy;

    policies = json_object_get (state,
                                "policies");
    json_array_foreach (policies, pidx, policy)
    {
      json_t *methods;
      json_t *method;
      size_t midx;

      methods = json_object_get (policy,
                                 "methods");
      json_array_foreach (methods, midx, method)
      {
        const char *provider_url;
        uint32_t method_idx;

        struct GNUNET_JSON_Specification spec[] = {
          GNUNET_JSON_spec_string ("provider",
                                   &provider_url),
          GNUNET_JSON_spec_uint32 ("authentication_method",
                                   &method_idx),
          GNUNET_JSON_spec_end ()
        };

        if (GNUNET_OK !=
            GNUNET_JSON_parse (method,
                               spec,
                               NULL, NULL))
        {
          GNUNET_break (0);
          return GNUNET_SYSERR;
        }
        /* check if we have seen this one before */
        {
          bool found = false;

          for (unsigned int i = 0; i<off; i++)
            if ( (seen[i].method == method_idx) &&
                 (0 == strcmp (seen[i].provider_url,
                               provider_url)) )
              found = true;
          if (found)
            continue; /* skip */
        }
        if (off == len)
        {
          GNUNET_array_grow (seen,
                             len,
                             4 + len * 2);
        }
        seen[off].method = method_idx;
        seen[off].provider_url = provider_url;
        off++;
        {
          struct TALER_Amount upload_cost;
          struct GNUNET_JSON_Specification pspec[] = {
            TALER_JSON_spec_amount_any ("truth_upload_fee",
                                        &upload_cost),
            GNUNET_JSON_spec_end ()
          };
          struct TALER_Amount fee;
          const json_t *provider_cfg
            = json_object_get (providers,
                               provider_url);

          if (GNUNET_OK !=
              GNUNET_JSON_parse (provider_cfg,
                                 pspec,
                                 NULL, NULL))
          {
            GNUNET_break (0);
            return GNUNET_SYSERR;
          }
          if (0 >
              TALER_amount_multiply (&fee,
                                     &upload_cost,
                                     years))
          {
            GNUNET_break (0);
            return GNUNET_SYSERR;
          }
          add_cost (&costs,
                    &fee);
        }
      }
    }
    GNUNET_array_grow (seen,
                       len,
                       0);
  }

  /* convert 'costs' into state */
  {
    json_t *arr;

    arr = json_array ();
    GNUNET_assert (NULL != arr);
    while (NULL != costs)
    {
      struct Costs *nxt = costs->next;

      if ( (0 != costs->cost.value) ||
           (0 != costs->cost.fraction) )
      {
        json_t *ao;

        ao = GNUNET_JSON_PACK (
          TALER_JSON_pack_amount ("fee",
                                  &costs->cost));
        GNUNET_assert (0 ==
                       json_array_append_new (arr,
                                              ao));
        is_free = false;
      }
      GNUNET_free (costs);
      costs = nxt;
    }
    GNUNET_assert (0 ==
                   json_object_set_new (state,
                                        "upload_fees",
                                        arr));
  }

  if (is_free)
    expiration = GNUNET_TIME_relative_to_absolute (ANASTASIS_FREE_STORAGE);
  /* update 'expiration' in state */
  {
    json_t *eo;

    (void) GNUNET_TIME_round_abs (&expiration);
    eo = GNUNET_JSON_from_time_abs (expiration);
    GNUNET_assert (0 ==
                   json_object_set_new (state,
                                        "expiration",
                                        eo));
  }


  return GNUNET_OK;
}


/**
 * DispatchHandler/Callback function which is called for a
 * "done_policy_review" action.
 *
 * @param state state to operate on
 * @param arguments arguments to use for operation on state
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 * @return NULL
 */
static struct ANASTASIS_ReduxAction *
done_policy_review (json_t *state,
                    const json_t *arguments,
                    ANASTASIS_ActionCallback cb,
                    void *cb_cls)
{
  const json_t *policy_arr;

  policy_arr = json_object_get (state,
                                "policies");
  if (0 == json_array_size (policy_arr))
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID_FOR_STATE,
                           "no policies specified");
    return NULL;
  }
  {
    struct GNUNET_TIME_Absolute exp = {0};
    struct GNUNET_JSON_Specification spec[] = {
      GNUNET_JSON_spec_mark_optional (
        GNUNET_JSON_spec_absolute_time ("expiration",
                                        &exp)),
      GNUNET_JSON_spec_end ()
    };

    if (GNUNET_OK !=
        GNUNET_JSON_parse (state,
                           spec,
                           NULL, NULL))
    {
      ANASTASIS_redux_fail_ (cb,
                             cb_cls,
                             TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID_FOR_STATE,
                             "invalid expiration specified");
      return NULL;
    }
    if (0 == exp.abs_value_us)
      exp = GNUNET_TIME_relative_to_absolute (GNUNET_TIME_UNIT_YEARS);
    if (GNUNET_OK !=
        update_expiration_cost (state,
                                exp))
    {
      ANASTASIS_redux_fail_ (cb,
                             cb_cls,
                             TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID_FOR_STATE,
                             "could not calculate expiration cost");
      return NULL;
    }
  }
  set_state (state,
             ANASTASIS_BACKUP_STATE_SECRET_EDITING);
  cb (cb_cls,
      TALER_EC_NONE,
      state);
  return NULL;
}


/**
 * Information we keep for an upload() operation.
 */
struct UploadContext;


/**
 * Maps a TruthUpload to a policy and recovery method where this
 * truth is used.
 */
struct PolicyMethodReference
{
  /**
   * Offset into the "policies" array.
   */
  unsigned int policy_index;

  /**
   * Offset into the "methods" array (of the policy selected
   * by @e policy_index).
   */
  unsigned int method_index;

};


/**
 * Entry we keep per truth upload.
 */
struct TruthUpload
{

  /**
   * Kept in a DLL.
   */
  struct TruthUpload *next;

  /**
   * Kept in a DLL.
   */
  struct TruthUpload *prev;

  /**
   * Handle to the actual upload operation.
   */
  struct ANASTASIS_TruthUpload *tu;

  /**
   * Upload context this operation is part of.
   */
  struct UploadContext *uc;

  /**
   * Truth resulting from the upload, if any.
   */
  struct ANASTASIS_Truth *t;

  /**
   * A taler://pay/-URI with a request to pay the annual fee for
   * the service.  Set if payment is required.
   */
  char *payment_request;

  /**
   * Which policies and methods does this truth affect?
   */
  struct PolicyMethodReference *policies;

  /**
   * Where are we uploading to?
   */
  char *provider_url;

  /**
   * Which challenge object are we uploading?
   */
  uint32_t am_idx;

  /**
   * Length of the @e policies array.
   */
  unsigned int policies_length;

  /**
   * Status of the upload.
   */
  enum ANASTASIS_UploadStatus us;

  /**
   * Taler error code of the upload.
   */
  enum TALER_ErrorCode ec;

};


/**
 * Information we keep for an upload() operation.
 */
struct UploadContext
{
  /**
   * Recovery action returned to caller for aborting the operation.
   */
  struct ANASTASIS_ReduxAction ra;

  /**
   * Function to call upon completion.
   */
  ANASTASIS_ActionCallback cb;

  /**
   * Closure for @e cb.
   */
  void *cb_cls;

  /**
   * Our state.
   */
  json_t *state;

  /**
   * Master secret sharing operation, NULL if not yet running.
   */
  struct ANASTASIS_SecretShare *ss;

  /**
   * Head of DLL of truth uploads.
   */
  struct TruthUpload *tues_head;

  /**
   * Tail of DLL of truth uploads.
   */
  struct TruthUpload *tues_tail;

  /**
   * Timeout to use for the operation, from the arguments.
   */
  struct GNUNET_TIME_Relative timeout;

  /**
   * For how many years should we pay?
   */
  unsigned int years;

};


/**
 * Function called when the #upload transition is being aborted.
 *
 * @param cls a `struct UploadContext`
 */
static void
upload_cancel_cb (void *cls)
{
  struct UploadContext *uc = cls;
  struct TruthUpload *tue;

  while (NULL != (tue = uc->tues_head))
  {
    GNUNET_CONTAINER_DLL_remove (uc->tues_head,
                                 uc->tues_tail,
                                 tue);
    if (NULL != tue->tu)
    {
      ANASTASIS_truth_upload_cancel (tue->tu);
      tue->tu = NULL;
    }
    if (NULL != tue->t)
    {
      ANASTASIS_truth_free (tue->t);
      tue->t = NULL;
    }
    GNUNET_free (tue->provider_url);
    GNUNET_free (tue->payment_request);
    GNUNET_free (tue->policies);
    GNUNET_free (tue);
  }
  if (NULL != uc->ss)
  {
    ANASTASIS_secret_share_cancel (uc->ss);
    uc->ss = NULL;
  }
  json_decref (uc->state);
  GNUNET_free (uc);
}


/**
 * Take all of the ongoing truth uploads and serialize them into the @a uc
 * state.
 *
 * @param[in,out] uc context to take truth uploads from and to update state of
 */
static void
serialize_truth (struct UploadContext *uc)
{
  json_t *policies;

  policies = json_object_get (uc->state,
                              "policies");
  GNUNET_assert (json_is_array (policies));
  for (struct TruthUpload *tue = uc->tues_head;
       NULL != tue;
       tue = tue->next)
  {
    if (NULL == tue->t)
      continue;
    for (unsigned int i = 0; i<tue->policies_length; i++)
    {
      const struct PolicyMethodReference *pmr = &tue->policies[i];
      json_t *policy = json_array_get (policies,
                                       pmr->policy_index);
      json_t *methods = json_object_get (policy,
                                         "methods");
      json_t *auth_method = json_array_get (methods,
                                            pmr->method_index);
      json_t *truth = ANASTASIS_truth_to_json (tue->t);

      GNUNET_assert (0 ==
                     json_object_set_new (truth,
                                          "upload_status",
                                          json_integer (tue->us)));
      GNUNET_assert (NULL != policy);
      GNUNET_assert (NULL != methods);
      GNUNET_assert (NULL != auth_method);
      GNUNET_assert (NULL != truth);
      GNUNET_assert (0 ==
                     json_object_set_new (auth_method,
                                          "truth",
                                          truth));
    }
  }
}


/**
 * Function called with the results of a #ANASTASIS_secret_share().
 *
 * @param cls closure with a `struct UploadContext *`
 * @param sr share result
 */
static void
secret_share_result_cb (void *cls,
                        const struct ANASTASIS_ShareResult *sr)
{
  struct UploadContext *uc = cls;

  uc->ss = NULL;
  switch (sr->ss)
  {
  case ANASTASIS_SHARE_STATUS_SUCCESS:
    /* Just to be safe, delete the "core_secret" so that it is not
       accidentally preserved anywhere */
    (void) json_object_del (uc->state,
                            "core_secret");
    {
      json_t *sa = json_object ();

      GNUNET_assert (NULL != sa);
      for (unsigned int i = 0; i<sr->details.success.num_providers; i++)
      {
        const struct ANASTASIS_ProviderSuccessStatus *pssi
          = &sr->details.success.pss[i];
        json_t *d;

        d = GNUNET_JSON_PACK (
          GNUNET_JSON_pack_uint64 ("policy_version",
                                   pssi->policy_version),
          GNUNET_JSON_pack_time_abs ("policy_expiration",
                                     pssi->policy_expiration));
        GNUNET_assert (NULL != d);
        GNUNET_assert (0 ==
                       json_object_set_new (sa,
                                            pssi->provider_url,
                                            d));
      }
      GNUNET_assert (0 ==
                     json_object_set_new (uc->state,
                                          "success_details",
                                          sa));
    }
    set_state (uc->state,
               ANASTASIS_BACKUP_STATE_BACKUP_FINISHED);
    uc->cb (uc->cb_cls,
            TALER_EC_NONE,
            uc->state);
    break;
  case ANASTASIS_SHARE_STATUS_PAYMENT_REQUIRED:
    {
      json_t *ra;
      json_t *providers;

      providers = json_object_get (uc->state,
                                   "policy_providers");
      set_state (uc->state,
                 ANASTASIS_BACKUP_STATE_POLICIES_PAYING);
      serialize_truth (uc);
      ra = json_array ();
      GNUNET_assert (NULL != ra);
      for (unsigned int i = 0; i<
           sr->details.payment_required.payment_requests_length; i++)
      {
        const struct ANASTASIS_SharePaymentRequest *spr;
        json_t *pr;
        size_t off;
        json_t *provider;

        spr = &sr->details.payment_required.payment_requests[i];
        pr = GNUNET_JSON_PACK (
          GNUNET_JSON_pack_string ("payto",
                                   spr->payment_request_url),
          GNUNET_JSON_pack_string ("provider",
                                   spr->provider_url));
        GNUNET_assert (0 ==
                       json_array_append_new (ra,
                                              pr));
        json_array_foreach (providers, off, provider)
        {
          const char *purl = json_string_value (json_object_get (provider,
                                                                 "provider_url"));

          if (NULL == purl)
          {
            GNUNET_break (0);
            ANASTASIS_redux_fail_ (uc->cb,
                                   uc->cb_cls,
                                   TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                                   "policy_providers array contents are invalid");
            json_decref (ra);
            return;
          }
          if (0 == strcmp (purl,
                           spr->provider_url))
          {
            json_t *psj;

            GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                        "Remembering payment secret for provider `%s'\n",
                        spr->provider_url);
            psj = GNUNET_JSON_from_data_auto (&spr->payment_secret);
            GNUNET_assert (0 ==
                           json_object_set_new (provider,
                                                "payment_secret",
                                                psj));
          }
        }
      }
      GNUNET_assert (0 ==
                     json_object_set_new (uc->state,
                                          "policy_payment_requests",
                                          ra));
    }
    uc->cb (uc->cb_cls,
            TALER_EC_NONE,
            uc->state);
    break;
  case ANASTASIS_SHARE_STATUS_PROVIDER_FAILED:
    {
      json_t *details;

      details = GNUNET_JSON_PACK (
        GNUNET_JSON_pack_string ("backup_state",
                                 "ERROR"),
        GNUNET_JSON_pack_uint64 ("http_status",
                                 sr->details.provider_failure.http_status),
        GNUNET_JSON_pack_uint64 ("upload_status",
                                 sr->details.provider_failure.ec),
        GNUNET_JSON_pack_string ("provider_url",
                                 sr->details.provider_failure.provider_url));
      uc->cb (uc->cb_cls,
              TALER_EC_ANASTASIS_REDUCER_BACKUP_PROVIDER_FAILED,
              details);
      json_decref (details);
    }
    break;
  default:
    GNUNET_break (0);
    ANASTASIS_redux_fail_ (uc->cb,
                           uc->cb_cls,
                           TALER_EC_GENERIC_INTERNAL_INVARIANT_FAILURE,
                           "unexpected share result");
    break;
  }
  upload_cancel_cb (uc);
}


/**
 * All truth uploads are done, begin with uploading the policy.
 *
 * @param[in,out] uc context for the operation
 */
static void
share_secret (struct UploadContext *uc)
{
  json_t *user_id;
  json_t *core_secret;
  json_t *jpolicies;
  json_t *providers = NULL;
  size_t policies_len;
  const char *secret_name = NULL;
  unsigned int pds_len;
  struct GNUNET_TIME_Relative timeout = GNUNET_TIME_UNIT_ZERO;
  struct GNUNET_JSON_Specification spec[] = {
    GNUNET_JSON_spec_json ("identity_attributes",
                           &user_id),
    GNUNET_JSON_spec_json ("policies",
                           &jpolicies),
    GNUNET_JSON_spec_json ("policy_providers",
                           &providers),
    GNUNET_JSON_spec_json ("core_secret",
                           &core_secret),
    GNUNET_JSON_spec_mark_optional (
      GNUNET_JSON_spec_string ("secret_name",
                               &secret_name)),
    GNUNET_JSON_spec_end ()
  };

  if (GNUNET_OK !=
      GNUNET_JSON_parse (uc->state,
                         spec,
                         NULL, NULL))
  {
    ANASTASIS_redux_fail_ (uc->cb,
                           uc->cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "State parsing failed when preparing to share secret");
    upload_cancel_cb (uc);
    return;
  }

  {
    json_t *args;
    struct GNUNET_JSON_Specification pspec[] = {
      GNUNET_JSON_spec_mark_optional (
        GNUNET_JSON_spec_relative_time ("timeout",
                                        &timeout)),
      GNUNET_JSON_spec_end ()
    };

    args = json_object_get (uc->state,
                            "pay-arguments");
    if ( (NULL != args) &&
         (GNUNET_OK !=
          GNUNET_JSON_parse (args,
                             pspec,
                             NULL, NULL)) )
    {
      json_dumpf (args,
                  stderr,
                  JSON_INDENT (2));
      GNUNET_break (0);
      ANASTASIS_redux_fail_ (uc->cb,
                             uc->cb_cls,
                             TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                             NULL);
      upload_cancel_cb (uc);
      return;
    }
  }

  if ( (! json_is_object (user_id)) ||
       (! json_is_array (jpolicies)) ||
       (0 == json_array_size (jpolicies)) ||
       ( (NULL != providers) &&
         (! json_is_array (providers)) ) )
  {
    ANASTASIS_redux_fail_ (uc->cb,
                           uc->cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "State parsing failed checks when preparing to share secret");
    GNUNET_JSON_parse_free (spec);
    upload_cancel_cb (uc);
    return;
  }

  policies_len = json_array_size (jpolicies);
  pds_len = json_array_size (providers);

  if (0 == pds_len)
  {
    ANASTASIS_redux_fail_ (uc->cb,
                           uc->cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "no workable providers in state");
    GNUNET_JSON_parse_free (spec);
    upload_cancel_cb (uc);
    return;
  }


  {
    struct ANASTASIS_Policy *vpolicies[policies_len];
    const struct ANASTASIS_Policy *policies[policies_len];
    struct ANASTASIS_ProviderDetails pds[GNUNET_NZL (pds_len)];

    /* initialize policies/vpolicies arrays */
    memset (pds,
            0,
            sizeof (pds));
    for (size_t i = 0; i<policies_len; i++)
    {
      const json_t *policy = json_array_get (jpolicies,
                                             i);
      const json_t *jmethods = json_object_get (policy,
                                                "methods");
      unsigned int methods_len;

      if ( (! json_is_array (jmethods)) ||
           (0 == json_array_size (jmethods)) )
      {
        GNUNET_break (0);
        ANASTASIS_redux_fail_ (uc->cb,
                               uc->cb_cls,
                               TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                               "'methods' must be an array");
        GNUNET_JSON_parse_free (spec);
        upload_cancel_cb (uc);
        return;
      }
      methods_len = json_array_size (jmethods);
      {
        struct ANASTASIS_Policy *p;
        struct ANASTASIS_Truth *truths[methods_len];
        const struct ANASTASIS_Truth *ctruths[methods_len];

        for (unsigned int j = 0; j<methods_len; j++)
        {
          const json_t *jmethod = json_array_get (jmethods,
                                                  j);
          json_t *jtruth = NULL;
          uint32_t truth_index;
          const char *provider_url;
          struct GNUNET_JSON_Specification ispec[] = {
            GNUNET_JSON_spec_mark_optional (
              GNUNET_JSON_spec_json ("truth",
                                     &jtruth)),
            GNUNET_JSON_spec_string ("provider",
                                     &provider_url),
            GNUNET_JSON_spec_uint32 ("authentication_method",
                                     &truth_index),
            GNUNET_JSON_spec_end ()
          };

          GNUNET_break (NULL != jmethod);
          if (GNUNET_OK !=
              GNUNET_JSON_parse (jmethod,
                                 ispec,
                                 NULL, NULL))
          {
            GNUNET_break (0);
            for (unsigned int k = 0; k<j; k++)
              ANASTASIS_truth_free (truths[k]);
            ANASTASIS_redux_fail_ (uc->cb,
                                   uc->cb_cls,
                                   TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                                   "'truth' failed to decode");
            GNUNET_JSON_parse_free (spec);
            upload_cancel_cb (uc);
            return;
          }
          if (NULL != jtruth)
          {
            /* Get truth by deserializing from state */
            truths[j] = ANASTASIS_truth_from_json (jtruth);
            if (NULL == truths[j])
            {
              GNUNET_break (0);
              for (unsigned int k = 0; k<j; k++)
                ANASTASIS_truth_free (truths[k]);
              ANASTASIS_redux_fail_ (uc->cb,
                                     uc->cb_cls,
                                     TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                                     "'truth' failed to decode");
              GNUNET_JSON_parse_free (ispec);
              GNUNET_JSON_parse_free (spec);
              upload_cancel_cb (uc);
              return;
            }
          }
          else
          {
            bool found = false;
            /* Maybe we never serialized the truth; find it in our DLL */
            for (struct TruthUpload *tue = uc->tues_head;
                 NULL != tue;
                 tue = tue->next)
            {
              GNUNET_break (NULL != tue->t);
              if ( (tue->am_idx == truth_index) &&
                   (0 == strcmp (provider_url,
                                 tue->provider_url)) )
              {
                /* Duplicate truth object */
                json_t *jt = ANASTASIS_truth_to_json (tue->t);

                GNUNET_assert (NULL != jt);
                truths[j] = ANASTASIS_truth_from_json (jt);
                GNUNET_assert (NULL != truths[j]);
                json_decref (jt);
                found = true;
                break;
              }
            }
            if (! found)
            {
              GNUNET_break (0);
              for (unsigned int k = 0; k<j; k++)
                ANASTASIS_truth_free (truths[k]);
              ANASTASIS_redux_fail_ (uc->cb,
                                     uc->cb_cls,
                                     TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                                     "'truth' failed to decode");
              GNUNET_JSON_parse_free (ispec);
              GNUNET_JSON_parse_free (spec);
              upload_cancel_cb (uc);
              return;
            }
          }
          GNUNET_JSON_parse_free (ispec);
          ctruths[j] = truths[j];
        }
        p = ANASTASIS_policy_create (ctruths,
                                     methods_len);
        vpolicies[i] = p;
        policies[i] = p;
        for (unsigned int k = 0; k<methods_len; k++)
          ANASTASIS_truth_free (truths[k]);
      }
    }

    /* initialize 'pds' array */
    for (unsigned int i = 0; i<pds_len; i++)
    {
      json_t *pdj = json_array_get (providers,
                                    i);
      struct GNUNET_JSON_Specification ispec[] = {
        GNUNET_JSON_spec_mark_optional (
          GNUNET_JSON_spec_fixed_auto ("payment_secret",
                                       &pds[i].payment_secret)),
        GNUNET_JSON_spec_string ("provider_url",
                                 &pds[i].provider_url),
        GNUNET_JSON_spec_end ()
      };

      if ( (GNUNET_OK !=
            GNUNET_JSON_parse (pdj,
                               ispec,
                               NULL, NULL)) ||
           (GNUNET_OK !=
            lookup_salt (uc->state,
                         pds[i].provider_url,
                         &pds[i].provider_salt)) )
      {
        GNUNET_break (0);
        ANASTASIS_redux_fail_ (uc->cb,
                               uc->cb_cls,
                               TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                               "'providers' entry malformed");
        for (unsigned int i = 0; i<policies_len; i++)
          ANASTASIS_policy_destroy (vpolicies[i]);
        upload_cancel_cb (uc);
        GNUNET_JSON_parse_free (spec);
        return;
      }
    }

    {
      char *secret;
      size_t secret_size;

      secret = json_dumps (core_secret,
                           JSON_COMPACT | JSON_SORT_KEYS);
      GNUNET_assert (NULL != secret);
      secret_size = strlen (secret);
      uc->ss = ANASTASIS_secret_share (ANASTASIS_REDUX_ctx_,
                                       user_id,
                                       pds,
                                       pds_len,
                                       policies,
                                       policies_len,
                                       uc->years,
                                       timeout,
                                       &secret_share_result_cb,
                                       uc,
                                       secret_name,
                                       secret,
                                       secret_size);
      GNUNET_free (secret);
    }
    for (unsigned int i = 0; i<policies_len; i++)
      ANASTASIS_policy_destroy (vpolicies[i]);
  }
  GNUNET_JSON_parse_free (spec);
  if (NULL == uc->ss)
  {
    GNUNET_break (0);
    ANASTASIS_redux_fail_ (uc->cb,
                           uc->cb_cls,
                           TALER_EC_GENERIC_INTERNAL_INVARIANT_FAILURE,
                           "Failed to begin secret sharing");
    upload_cancel_cb (uc);
    return;
  }
}


/**
 * Some truth uploads require payment, serialize state and
 * request payment to be executed by the application.
 *
 * @param[in,out] uc context for the operation
 */
static void
request_truth_payment (struct UploadContext *uc)
{
  json_t *payments;

  payments = json_array ();
  GNUNET_assert (NULL != payments);
  serialize_truth (uc);
  for (struct TruthUpload *tue = uc->tues_head;
       NULL != tue;
       tue = tue->next)
  {
    if (NULL == tue->payment_request)
      continue;
    GNUNET_assert (
      0 ==
      json_array_append_new (payments,
                             json_string (
                               tue->payment_request)));
  }
  GNUNET_assert (0 ==
                 json_object_set_new (uc->state,
                                      "payments",
                                      payments));
  set_state (uc->state,
             ANASTASIS_BACKUP_STATE_TRUTHS_PAYING);
  uc->cb (uc->cb_cls,
          TALER_EC_NONE,
          uc->state);
  upload_cancel_cb (uc);
}


/**
 * We may be finished with all (active) asynchronous operations.
 * Check if any are pending and continue accordingly.
 *
 * @param[in,out] uc context for the operation
 */
static void
check_upload_finished (struct UploadContext *uc)
{
  bool pay = false;
  bool active = false;

  for (struct TruthUpload *tue = uc->tues_head;
       NULL != tue;
       tue = tue->next)
  {
    if (TALER_EC_NONE != tue->ec)
    {
      GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                  "Truth upload failed with error %d\n",
                  (int) tue->ec);
      uc->cb (uc->cb_cls,
              tue->ec,
              NULL);
      upload_cancel_cb (uc);
      return;
    }
    if (NULL != tue->tu)
      active = true;
    if (NULL != tue->payment_request)
      pay = true;
  }
  if (active)
    return;
  if (pay)
  {
    request_truth_payment (uc);
    return;
  }
  share_secret (uc);
}


/**
 * Upload result information.  The resulting truth object can be used
 * to create policies.  If payment is required, the @a taler_pay_url
 * is returned and the operation must be retried after payment.
 * Callee MUST free @a t using ANASTASIS_truth_free().
 *
 * @param cls closure with a `struct TruthUpload`
 * @param t truth object to create policies, NULL on failure
 * @param ud upload details
 */
static void
truth_upload_cb (void *cls,
                 struct ANASTASIS_Truth *t,
                 const struct ANASTASIS_UploadDetails *ud)
{
  struct TruthUpload *tue = cls;

  tue->tu = NULL;
  tue->t = t;
  tue->ec = ud->ec;
  tue->us = ud->us;
  if (ANASTASIS_US_PAYMENT_REQUIRED == ud->us)
  {
    tue->payment_request = GNUNET_strdup (
      ud->details.payment.payment_request);
  }
  check_upload_finished (tue->uc);
}


/**
 * Check if we still need to create a new truth object for the truth
 * identified by @a provider_url and @a am_idx. If so, create it from
 * @a truth for policy reference @a pmr. If such a truth object
 * already exists, append @a pmr to its list of reasons.
 *
 * @param[in,out] uc our upload context
 * @param pmr policy method combination that requires the truth
 * @param provider_url the URL of the Anastasis provider to upload
 *                     the truth to, used to check for existing entries
 * @param am_idx index of the authentication method, used to check for existing entries
 * @param[in] truth object representing already uploaded truth, reference captured!
 * @param[in,out] async_truth pointer to counter with the number of ongoing uploads,
 *                updated
 * @param auth_method object with the challenge details, to generate the truth
 * @return #GNUNET_SYSERR error requiring abort,
 *         #GNUNET_OK on success
 */
static int
add_truth_object (struct UploadContext *uc,
                  const struct PolicyMethodReference *pmr,
                  const char *provider_url,
                  uint32_t am_idx,
                  json_t *truth,
                  unsigned int *async_truth,
                  json_t *auth_method)
{
  /* check if we are already uploading this truth */
  struct TruthUpload *tue;
  bool must_upload = true;

  for (tue = uc->tues_head;
       NULL != tue;
       tue = tue->next)
  {
    if ( (0 == strcmp (tue->provider_url,
                       provider_url)) &&
         (am_idx == tue->am_idx) )
    {
      GNUNET_array_append (tue->policies,
                           tue->policies_length,
                           *pmr);
      break;
    }
  }

  if (NULL == tue)
  {
    /* Create new entry */
    tue = GNUNET_new (struct TruthUpload);

    GNUNET_CONTAINER_DLL_insert (uc->tues_head,
                                 uc->tues_tail,
                                 tue);
    tue->uc = uc;
    tue->policies = GNUNET_new (struct PolicyMethodReference);
    *tue->policies = *pmr;
    tue->provider_url = GNUNET_strdup (provider_url);
    tue->am_idx = am_idx;
    tue->policies_length = 1;
  }

  {
    uint32_t status = UINT32_MAX;
    struct GNUNET_JSON_Specification spec[] = {
      GNUNET_JSON_spec_mark_optional (
        GNUNET_JSON_spec_uint32 ("upload_status",
                                 &status)),
      GNUNET_JSON_spec_end ()
    };
    if (GNUNET_OK !=
        GNUNET_JSON_parse (truth,
                           spec,
                           NULL, NULL))
    {
      GNUNET_break (0);
      return GNUNET_SYSERR;
    }

    must_upload = (ANASTASIS_US_SUCCESS != status);
  }

  if (NULL == tue->t)
  {
    tue->t = ANASTASIS_truth_from_json (truth);
    if (NULL == tue->t)
    {
      GNUNET_break (0);
      return GNUNET_SYSERR;
    }
  }

  if ( (NULL != tue->tu) &&
       (! must_upload) )
  {
    ANASTASIS_truth_upload_cancel (tue->tu);
    (*async_truth)--;
    tue->tu = NULL;
    return GNUNET_OK;
  }

  if ( (NULL == tue->tu) &&
       (must_upload) )
  {
    struct ANASTASIS_CRYPTO_ProviderSaltP salt;
    struct ANASTASIS_CRYPTO_UserIdentifierP id;
    void *truth_data;
    size_t truth_data_size;
    struct GNUNET_JSON_Specification spec[] = {
      GNUNET_JSON_spec_varsize ("challenge",
                                &truth_data,
                                &truth_data_size),
      GNUNET_JSON_spec_end ()
    };

    if (GNUNET_OK !=
        lookup_salt (uc->state,
                     provider_url,
                     &salt))
    {
      GNUNET_break (0);
      return GNUNET_SYSERR;
    }
    if (GNUNET_OK !=
        GNUNET_JSON_parse (auth_method,
                           spec,
                           NULL, NULL))
    {
      json_dumpf (auth_method,
                  stderr,
                  JSON_INDENT (2));
      GNUNET_break (0);
      return GNUNET_SYSERR;
    }
    {
      json_t *user_id;

      user_id = json_object_get (uc->state,
                                 "identity_attributes");
      if (! json_is_object (user_id))
      {
        GNUNET_break (0);
        return GNUNET_SYSERR;
      }
      ANASTASIS_CRYPTO_user_identifier_derive (user_id,
                                               &salt,
                                               &id);
    }
    tue->tu = ANASTASIS_truth_upload3 (ANASTASIS_REDUX_ctx_,
                                       &id,
                                       tue->t,
                                       truth_data,
                                       truth_data_size,
                                       uc->years,
                                       uc->timeout,
                                       &truth_upload_cb,
                                       tue);
    GNUNET_JSON_parse_free (spec);
    tue->t = NULL;
    (*async_truth)++;
  }

  if ( (NULL != tue->tu) &&
       (NULL != tue->t) )
  {
    /* no point in having both */
    ANASTASIS_truth_free (tue->t);
    tue->t = NULL;
  }
  return GNUNET_OK;
}


/**
 * Check if we still need to upload the truth identified by
 * @a provider_url and @a am_idx. If so, upload it for
 * policy reference @a pmr. If the upload is already queued,
 * append @a pmr to its list of reasons.
 *
 * @param[in,out] uc our upload context
 * @param pmr policy method combination that requires the truth
 * @param provider_url the URL of the Anastasis provider to upload
 *                     the truth to, used to check for existing entries
 * @param am_idx index of the authentication method, used to check for existing entries
 * @param auth_method object with the challenge details, to generate the truth
 * @return #GNUNET_SYSERR on error requiring abort,
 *         #GNUNET_NO if no new truth upload was generated (@a pmr was appended)
 *         #GNUNET_OK if a new truth upload was initiated
 */
static int
check_truth_upload (struct UploadContext *uc,
                    const struct PolicyMethodReference *pmr,
                    const char *provider_url,
                    uint32_t am_idx,
                    json_t *auth_method)
{
  json_t *user_id;
  json_t *jtruth;
  struct TruthUpload *tue;

  user_id = json_object_get (uc->state,
                             "identity_attributes");
  if (! json_is_object (user_id))
  {
    GNUNET_break (0);
    return GNUNET_SYSERR;
  }

  /* check if we are already uploading this truth */
  for (tue = uc->tues_head;
       NULL != tue;
       tue = tue->next)
  {
    if ( (0 == strcmp (tue->provider_url,
                       provider_url)) &&
         (am_idx == tue->am_idx) )
    {
      GNUNET_array_append (tue->policies,
                           tue->policies_length,
                           *pmr);
      return GNUNET_NO;
    }
  }

  /* need new upload */
  tue = GNUNET_new (struct TruthUpload);
  {
    json_t *policies = json_object_get (uc->state,
                                        "policies");
    json_t *policy = json_array_get (policies,
                                     pmr->policy_index);
    json_t *methods = json_object_get (policy,
                                       "methods");
    json_t *method = json_array_get (methods,
                                     pmr->method_index);

    jtruth = json_object_get (method,
                              "truth");
  }

  {
    const char *type;
    const char *mime_type = NULL;
    const char *instructions = NULL;
    void *truth_data;
    size_t truth_data_size;
    struct GNUNET_JSON_Specification spec[] = {
      GNUNET_JSON_spec_string ("type",
                               &type),
      GNUNET_JSON_spec_mark_optional (
        GNUNET_JSON_spec_string ("mime_type",
                                 &mime_type)),
      GNUNET_JSON_spec_mark_optional (
        GNUNET_JSON_spec_string ("instructions",
                                 &instructions)),
      GNUNET_JSON_spec_varsize ("challenge",
                                &truth_data,
                                &truth_data_size),
      GNUNET_JSON_spec_end ()
    };
    struct ANASTASIS_CRYPTO_ProviderSaltP provider_salt;
    struct ANASTASIS_CRYPTO_UserIdentifierP id;

    if (GNUNET_OK !=
        GNUNET_JSON_parse (auth_method,
                           spec,
                           NULL, NULL))
    {
      json_dumpf (auth_method,
                  stderr,
                  JSON_INDENT (2));
      GNUNET_break (0);
      GNUNET_free (tue);
      return GNUNET_SYSERR;
    }
    GNUNET_CONTAINER_DLL_insert (uc->tues_head,
                                 uc->tues_tail,
                                 tue);
    tue->uc = uc;
    tue->policies = GNUNET_new (struct PolicyMethodReference);
    *tue->policies = *pmr;
    tue->provider_url = GNUNET_strdup (provider_url);
    tue->am_idx = am_idx;
    tue->policies_length = 1;
    if (GNUNET_OK !=
        lookup_salt (uc->state,
                     provider_url,
                     &provider_salt))
    {
      GNUNET_break (0);
      GNUNET_JSON_parse_free (spec);
      upload_cancel_cb (uc);
      return GNUNET_SYSERR;
    }
    ANASTASIS_CRYPTO_user_identifier_derive (user_id,
                                             &provider_salt,
                                             &id);
    {
      struct ANASTASIS_CRYPTO_TruthUUIDP uuid;
      struct ANASTASIS_CRYPTO_QuestionSaltP question_salt;
      struct ANASTASIS_CRYPTO_TruthKeyP truth_key;
      struct ANASTASIS_CRYPTO_KeyShareP key_share;
      struct ANASTASIS_CRYPTO_NonceP nonce;

      struct GNUNET_JSON_Specification jspec[] = {
        GNUNET_JSON_spec_fixed_auto ("salt",
                                     &question_salt),
        GNUNET_JSON_spec_fixed_auto ("truth_key",
                                     &truth_key),
        GNUNET_JSON_spec_fixed_auto ("nonce",
                                     &nonce),
        GNUNET_JSON_spec_fixed_auto ("uuid",
                                     &uuid),
        GNUNET_JSON_spec_fixed_auto ("key_share",
                                     &key_share),
        GNUNET_JSON_spec_end ()
      };

      if (GNUNET_OK !=
          GNUNET_JSON_parse (jtruth,
                             jspec,
                             NULL, NULL))
      {
        tue->tu = ANASTASIS_truth_upload (ANASTASIS_REDUX_ctx_,
                                          &id,
                                          provider_url,
                                          type,
                                          instructions,
                                          mime_type,
                                          &provider_salt,
                                          truth_data,
                                          truth_data_size,
                                          uc->years,
                                          uc->timeout,
                                          &truth_upload_cb,
                                          tue);
      }
      else
      {
        tue->tu = ANASTASIS_truth_upload2 (ANASTASIS_REDUX_ctx_,
                                           &id,
                                           provider_url,
                                           type,
                                           instructions,
                                           mime_type,
                                           &provider_salt,
                                           truth_data,
                                           truth_data_size,
                                           uc->years,
                                           uc->timeout,
                                           &nonce,
                                           &uuid,
                                           &question_salt,
                                           &truth_key,
                                           &key_share,
                                           &truth_upload_cb,
                                           tue);
      }
    }
    if (NULL == tue->tu)
    {
      GNUNET_break (0);
      GNUNET_JSON_parse_free (spec);
      upload_cancel_cb (uc);
      return GNUNET_SYSERR;
    }
    GNUNET_JSON_parse_free (spec);
    return GNUNET_OK;
  }
}


/**
 * Function to upload truths and recovery document policies.
 * Ultimately transitions to failed state (allowing user to go back
 * and change providers/policies), or payment, or finished.
 *
 * @param state state to operate on
 * @param cb callback (#ANASTASIS_ActionCallback) to call after upload
 * @param cb_cls callback closure
 */
static struct ANASTASIS_ReduxAction *
upload (json_t *state,
        ANASTASIS_ActionCallback cb,
        void *cb_cls)
{
  struct UploadContext *uc;
  json_t *auth_methods;
  json_t *policies;
  struct GNUNET_TIME_Absolute expiration;
  struct GNUNET_JSON_Specification spec[] = {
    GNUNET_JSON_spec_absolute_time ("expiration",
                                    &expiration),
    GNUNET_JSON_spec_end ()
  };

  if (GNUNET_OK !=
      GNUNET_JSON_parse (state,
                         spec,
                         NULL, NULL))
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'expiration' missing");
    return NULL;
  }
  auth_methods = json_object_get (state,
                                  "authentication_methods");
  if ( (! json_is_array (auth_methods)) ||
       (0 == json_array_size (auth_methods)) )
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'authentication_methods' must be non-empty array");
    return NULL;
  }
  policies = json_object_get (state,
                              "policies");
  if ( (! json_is_array (policies)) ||
       (0 == json_array_size (policies)) )
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'policies' must be non-empty array");
    return NULL;
  }

  uc = GNUNET_new (struct UploadContext);
  uc->ra.cleanup = &upload_cancel_cb;
  uc->ra.cleanup_cls = uc;
  uc->cb = cb;
  uc->cb_cls = cb_cls;
  uc->state = json_incref (state);
  uc->years = expiration_to_years (expiration);

  {
    json_t *args;
    struct GNUNET_JSON_Specification pspec[] = {
      GNUNET_JSON_spec_mark_optional (
        GNUNET_JSON_spec_relative_time ("timeout",
                                        &uc->timeout)),
      GNUNET_JSON_spec_end ()
    };

    args = json_object_get (uc->state,
                            "pay-arguments");
    if ( (NULL != args) &&
         (GNUNET_OK !=
          GNUNET_JSON_parse (args,
                             pspec,
                             NULL, NULL)) )
    {
      json_dumpf (args,
                  stderr,
                  JSON_INDENT (2));
      GNUNET_break (0);
      ANASTASIS_redux_fail_ (cb,
                             cb_cls,
                             TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                             "'timeout' must be valid delay");

      return NULL;
    }
  }

  {
    json_t *policy;
    size_t pindex;
    unsigned int async_truth = 0;

    json_array_foreach (policies, pindex, policy)
    {
      json_t *methods = json_object_get (policy,
                                         "methods");
      json_t *auth_method;
      size_t mindex;

      if ( (! json_is_array (methods)) ||
           (0 == json_array_size (policies)) )
      {
        ANASTASIS_redux_fail_ (cb,
                               cb_cls,
                               TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                               "'policies' must be non-empty array");
        upload_cancel_cb (uc);
        return NULL;
      }
      json_array_foreach (methods, mindex, auth_method)
      {
        uint32_t am_idx;
        const char *provider_url;
        json_t *truth = NULL;
        struct GNUNET_JSON_Specification spec[] = {
          GNUNET_JSON_spec_string ("provider",
                                   &provider_url),
          GNUNET_JSON_spec_uint32 ("authentication_method",
                                   &am_idx),
          GNUNET_JSON_spec_mark_optional (
            GNUNET_JSON_spec_json ("truth",
                                   &truth)),
          GNUNET_JSON_spec_end ()
        };

        if (GNUNET_OK !=
            GNUNET_JSON_parse (auth_method,
                               spec,
                               NULL, NULL))
        {
          ANASTASIS_redux_fail_ (cb,
                                 cb_cls,
                                 TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                                 "'method' data malformed");
          upload_cancel_cb (uc);
          return NULL;
        }
        {
          struct PolicyMethodReference pmr = {
            .policy_index = pindex,
            .method_index = mindex
          };
          json_t *amj;

          amj = json_array_get (auth_methods,
                                am_idx);
          if (NULL == amj)
          {
            ANASTASIS_redux_fail_ (cb,
                                   cb_cls,
                                   TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                                   "'authentication_method' refers to invalid authorization index malformed");
            upload_cancel_cb (uc);
            GNUNET_JSON_parse_free (spec);
            return NULL;
          }
          if (NULL == truth)
          {
            int ret;

            ret = check_truth_upload (uc,
                                      &pmr,
                                      provider_url,
                                      am_idx,
                                      amj);
            if (GNUNET_SYSERR == ret)
            {
              GNUNET_JSON_parse_free (spec);
              ANASTASIS_redux_fail_ (cb,
                                     cb_cls,
                                     TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                                     NULL);
              return NULL;
            }
            if (GNUNET_OK == ret)
              async_truth++;
          }
          else
          {
            int ret;

            ret = add_truth_object (uc,
                                    &pmr,
                                    provider_url,
                                    am_idx,
                                    truth,
                                    &async_truth,
                                    amj);
            if (GNUNET_SYSERR == ret)
            {
              GNUNET_JSON_parse_free (spec);
              ANASTASIS_redux_fail_ (cb,
                                     cb_cls,
                                     TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                                     NULL);
              return NULL;
            }
          }
        }
        GNUNET_JSON_parse_free (spec);
      } /* end for all methods of policy */
    } /* end for all policies */
    if (async_truth > 0)
      return &uc->ra;
  }
  share_secret (uc);
  if (NULL == uc->ss)
    return NULL;
  return &uc->ra;
}


/**
 * Test if the core secret @a secret_size is small enough to be stored
 * at all providers, which have a minimum upload limit of @a min_limit_in_mb.
 *
 * For now, we do not precisely calculate the size of the recovery document,
 * and simply assume that the instructions (i.e. security questions) are all
 * relatively small (aka sane), and that the number of authentication methods
 * and recovery policies is similarly small so that all of this meta data
 * fits in 512 kb (which is VERY big).
 *
 * Even with the minimum permitted upload limit of 1 MB (which is likely,
 * given that there is hardly a reason for providers to offer more), this
 * leaves 512 kb for the @a secret_size, which should be plenty (given
 * that this is supposed to be for a master key, and not the actual data).
 *
 * @param state our state, could be used in the future to calculate the
 *        size of the recovery document without the core secret
 * @param secret_size size of the core secret
 * @param min_limit_in_mb minimum upload size of all providers
 */
static bool
core_secret_fits (const json_t *state,
                  size_t secret_size,
                  uint32_t min_limit_in_mb)
{
  return (min_limit_in_mb * 1024LL * 1024LL >
          512LLU * 1024LLU + secret_size);
}


/**
 * Check if the upload size limit is satisfied.
 *
 * @param state our state
 * @param jsecret the uploaded secret
 * @return #GNUNET_OK if @a secret_size works for all providers,
 *     #GNUNET_NO if the @a secret_size is too big,
 *     #GNUNET_SYSERR if a provider has a limit of 0
 */
static enum GNUNET_GenericReturnValue
check_upload_size_limit (json_t *state,
                         const json_t *jsecret)
{
  uint32_t min_limit = UINT32_MAX;
  json_t *aps = json_object_get (state,
                                 "authentication_providers");
  const char *url;
  json_t *ap;
  size_t secret_size;

  {
    char *secret;

    secret = json_dumps (jsecret,
                         JSON_COMPACT | JSON_SORT_KEYS);
    GNUNET_assert (NULL != secret);
    secret_size = strlen (secret);
    GNUNET_free (secret);
  }

  /* We calculate the minimum upload limit of all possible providers;
     this is under the (simplified) assumption that we store the
     recovery document at all providers; this may be changed later,
     see #6760. */
  json_object_foreach (aps, url, ap)
  {
    uint32_t limit;
    struct GNUNET_JSON_Specification spec[] = {
      GNUNET_JSON_spec_uint32 ("storage_limit_in_megabytes",
                               &limit),
      GNUNET_JSON_spec_end ()
    };

    if (MHD_HTTP_OK !=
        json_integer_value (json_object_get (ap,
                                             "http_status")))
      continue;   /* skip providers that are down */
    if (GNUNET_OK !=
        GNUNET_JSON_parse (ap,
                           spec,
                           NULL, NULL))
    {
      /* skip malformed provider, likely /config failed */
      GNUNET_break_op (0);
      continue;
    }
    if (0 == limit)
      return GNUNET_SYSERR;
    min_limit = GNUNET_MIN (min_limit,
                            limit);
  }
  if (! core_secret_fits (state,
                          secret_size,
                          min_limit))
    return GNUNET_NO;
  return GNUNET_OK;
}


/**
 * DispatchHandler/Callback function which is called for a
 * "enter_secret" action.
 *
 * @param state state to operate on
 * @param arguments arguments to use for operation on state
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 * @return NULL
 */
static struct ANASTASIS_ReduxAction *
enter_secret (json_t *state,
              const json_t *arguments,
              ANASTASIS_ActionCallback cb,
              void *cb_cls)
{
  json_t *jsecret;
  struct GNUNET_TIME_Absolute expiration = {0};
  struct GNUNET_JSON_Specification spec[] = {
    GNUNET_JSON_spec_json ("secret",
                           &jsecret),
    GNUNET_JSON_spec_mark_optional (
      GNUNET_JSON_spec_absolute_time ("expiration",
                                      &expiration)),
    GNUNET_JSON_spec_end ()
  };

  if (NULL == arguments)
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "arguments missing");
    return NULL;
  }
  if (GNUNET_OK !=
      GNUNET_JSON_parse (arguments,
                         spec,
                         NULL, NULL))
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "'secret' argument required");
    return NULL;
  }

  /* check upload size limit */
  {
    enum GNUNET_GenericReturnValue ret;

    ret = check_upload_size_limit (state,
                                   jsecret);
    switch (ret)
    {
    case GNUNET_SYSERR:
      ANASTASIS_redux_fail_ (cb,
                             cb_cls,
                             TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                             "provider has an upload limit of 0");
      return NULL;
    case GNUNET_NO:
      ANASTASIS_redux_fail_ (cb,
                             cb_cls,
                             TALER_EC_ANASTASIS_REDUCER_SECRET_TOO_BIG,
                             NULL);
      return NULL;
    default:
      break;
    }
  }
  if (0 != expiration.abs_value_us)
  {
    if (GNUNET_OK !=
        update_expiration_cost (state,
                                expiration))
    {
      ANASTASIS_redux_fail_ (cb,
                             cb_cls,
                             TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID_FOR_STATE,
                             "could not calculate expiration cost");
      return NULL;
    }
  }
  GNUNET_assert (0 ==
                 json_object_set (state,
                                  "core_secret",
                                  jsecret));
  cb (cb_cls,
      TALER_EC_NONE,
      state);
  GNUNET_JSON_parse_free (spec);
  return NULL;
}


/**
 * DispatchHandler/Callback function which is called for a
 * "clear_secret" action.
 *
 * @param state state to operate on
 * @param arguments arguments to use for operation on state
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 * @return NULL
 */
static struct ANASTASIS_ReduxAction *
clear_secret (json_t *state,
              const json_t *arguments,
              ANASTASIS_ActionCallback cb,
              void *cb_cls)
{
  if (0 !=
      json_object_del (state,
                       "core_secret"))
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "'core_secret' not set");
    return NULL;
  }
  cb (cb_cls,
      TALER_EC_NONE,
      state);
  return NULL;
}


/**
 * DispatchHandler/Callback function which is called for an
 * "enter_secret_name" action.
 *
 * @param state state to operate on
 * @param arguments arguments to use for operation on state
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 * @return NULL
 */
static struct ANASTASIS_ReduxAction *
enter_secret_name (json_t *state,
                   const json_t *arguments,
                   ANASTASIS_ActionCallback cb,
                   void *cb_cls)
{
  const char *secret_name = NULL;
  struct GNUNET_JSON_Specification spec[] = {
    GNUNET_JSON_spec_string ("name",
                             &secret_name),
    GNUNET_JSON_spec_end ()
  };

  if (NULL == arguments)
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "arguments missing");
    return NULL;
  }
  if (GNUNET_OK !=
      GNUNET_JSON_parse (arguments,
                         spec,
                         NULL, NULL))
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "'name' argument required");
    return NULL;
  }

  GNUNET_assert (0 ==
                 json_object_set_new (state,
                                      "secret_name",
                                      json_string (secret_name)));
  cb (cb_cls,
      TALER_EC_NONE,
      state);
  GNUNET_JSON_parse_free (spec);
  return NULL;
}


/**
 * DispatchHandler/Callback function which is called for the
 * "update_expiration" action in the "secret editing" state.
 * Updates how long we are to store the truth and policies
 * and computes the new cost.
 *
 * @param state state to operate on
 * @param arguments arguments to use for operation on state
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 * @return NULL (synchronous operation)
 */
static struct ANASTASIS_ReduxAction *
update_expiration (json_t *state,
                   const json_t *arguments,
                   ANASTASIS_ActionCallback cb,
                   void *cb_cls)
{
  struct GNUNET_TIME_Absolute expiration;
  struct GNUNET_JSON_Specification spec[] = {
    GNUNET_JSON_spec_absolute_time ("expiration",
                                    &expiration),
    GNUNET_JSON_spec_end ()
  };

  if (NULL == arguments)
  {
    GNUNET_break (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "arguments missing");
    return NULL;
  }
  if (GNUNET_OK !=
      GNUNET_JSON_parse (arguments,
                         spec,
                         NULL, NULL))
  {
    GNUNET_break (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "'expiration' argument required");
    return NULL;
  }
  if (GNUNET_OK !=
      update_expiration_cost (state,
                              expiration))
  {
    GNUNET_break (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID_FOR_STATE,
                           "could not calculate expiration cost");
    return NULL;
  }
  cb (cb_cls,
      TALER_EC_NONE,
      state);
  return NULL;
}


/**
 * DispatchHandler/Callback function which is called for the
 * "next" action in the "secret editing" state.
 * Returns an #ANASTASIS_ReduxAction as operation is async.
 *
 * @param state state to operate on
 * @param arguments arguments to use for operation on state
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 */
static struct ANASTASIS_ReduxAction *
finish_secret (json_t *state,
               const json_t *arguments,
               ANASTASIS_ActionCallback cb,
               void *cb_cls)
{
  json_t *core_secret;
  struct GNUNET_JSON_Specification spec[] = {
    GNUNET_JSON_spec_json ("core_secret",
                           &core_secret),
    GNUNET_JSON_spec_end ()
  };

  if (GNUNET_OK !=
      GNUNET_JSON_parse (state,
                         spec,
                         NULL, NULL))
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "State parsing failed: 'core_secret' is missing");
    return NULL;
  }

  /* check upload size limit */
  {
    enum GNUNET_GenericReturnValue ret;

    ret = check_upload_size_limit (state,
                                   core_secret);
    switch (ret)
    {
    case GNUNET_SYSERR:
      ANASTASIS_redux_fail_ (cb,
                             cb_cls,
                             TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                             "provider has an upload limit of 0");
      GNUNET_JSON_parse_free (spec);
      return NULL;
    case GNUNET_NO:
      ANASTASIS_redux_fail_ (cb,
                             cb_cls,
                             TALER_EC_ANASTASIS_REDUCER_SECRET_TOO_BIG,
                             NULL);
      GNUNET_JSON_parse_free (spec);
      return NULL;
    default:
      break;
    }
  }

  GNUNET_JSON_parse_free (spec);
  return upload (state,
                 cb,
                 cb_cls);
}


/**
 * DispatchHandler/Callback function which is called for a
 * "pay" action.
 * Returns an #ANASTASIS_ReduxAction as operation is async.
 *
 * @param state state to operate on
 * @param arguments arguments to use for operation on state
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 */
static struct ANASTASIS_ReduxAction *
pay_truths_backup (json_t *state,
                   const json_t *arguments,
                   ANASTASIS_ActionCallback cb,
                   void *cb_cls)
{
  /* Clear 'payments' if it exists */
  (void) json_object_del (state,
                          "payments");
  if (NULL != arguments)
    GNUNET_assert (0 ==
                   json_object_set (state,
                                    "pay-arguments",
                                    (json_t *) arguments));
  return upload (state,
                 cb,
                 cb_cls);
}


/**
 * DispatchHandler/Callback function which is called for a
 * "pay" action.
 * Returns an #ANASTASIS_ReduxAction as operation is async.
 *
 * @param state state to operate on
 * @param arguments arguments to use for operation on state
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 */
static struct ANASTASIS_ReduxAction *
pay_policies_backup (json_t *state,
                     const json_t *arguments,
                     ANASTASIS_ActionCallback cb,
                     void *cb_cls)
{
  /* Clear 'policy_payment_requests' if it exists */
  (void) json_object_del (state,
                          "policy_payment_requests");
  if (NULL != arguments)
    GNUNET_assert (0 ==
                   json_object_set (state,
                                    "pay-arguments",
                                    (json_t *) arguments));
  return upload (state,
                 cb,
                 cb_cls);
}


/**
 * DispatchHandler/Callback function which is called for a
 * "back" action if state is "FINISHED".
 *
 * @param state state to operate on
 * @param arguments arguments to use for operation on state
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 * @return NULL
 */
static struct ANASTASIS_ReduxAction *
back_finished (json_t *state,
               const json_t *arguments,
               ANASTASIS_ActionCallback cb,
               void *cb_cls)
{
  set_state (state,
             ANASTASIS_BACKUP_STATE_SECRET_EDITING);
  cb (cb_cls,
      TALER_EC_NONE,
      state);
  return NULL;
}


/**
 * Signature of callback function that implements a state transition.
 *
 *  @param state current state
 *  @param arguments arguments for the state transition
 *  @param cb function to call when done
 *  @param cb_cls closure for @a cb
 */
typedef struct ANASTASIS_ReduxAction *
(*DispatchHandler)(json_t *state,
                   const json_t *arguments,
                   ANASTASIS_ActionCallback cb,
                   void *cb_cls);


struct ANASTASIS_ReduxAction *
ANASTASIS_backup_action_ (json_t *state,
                          const char *action,
                          const json_t *arguments,
                          ANASTASIS_ActionCallback cb,
                          void *cb_cls)
{
  struct Dispatcher
  {
    enum ANASTASIS_BackupState backup_state;
    const char *backup_action;
    DispatchHandler fun;
  } dispatchers[] = {
    {
      ANASTASIS_BACKUP_STATE_AUTHENTICATIONS_EDITING,
      "add_authentication",
      &add_authentication
    },
    {
      ANASTASIS_BACKUP_STATE_AUTHENTICATIONS_EDITING,
      "delete_authentication",
      &del_authentication
    },
    {
      ANASTASIS_BACKUP_STATE_AUTHENTICATIONS_EDITING,
      "next",
      &done_authentication
    },
    {
      ANASTASIS_BACKUP_STATE_AUTHENTICATIONS_EDITING,
      "add_provider",
      &add_provider
    },
    {
      ANASTASIS_BACKUP_STATE_AUTHENTICATIONS_EDITING,
      "back",
      &ANASTASIS_back_generic_decrement_
    },
    {
      ANASTASIS_BACKUP_STATE_POLICIES_REVIEWING,
      "add_policy",
      &add_policy
    },
    {
      ANASTASIS_BACKUP_STATE_POLICIES_REVIEWING,
      "update_policy",
      &update_policy
    },
    {
      ANASTASIS_BACKUP_STATE_POLICIES_REVIEWING,
      "delete_policy",
      &del_policy
    },
    {
      ANASTASIS_BACKUP_STATE_POLICIES_REVIEWING,
      "delete_challenge",
      &del_challenge
    },
    {
      ANASTASIS_BACKUP_STATE_POLICIES_REVIEWING,
      "next",
      &done_policy_review
    },
    {
      ANASTASIS_BACKUP_STATE_POLICIES_REVIEWING,
      "back",
      &ANASTASIS_back_generic_decrement_
    },
    {
      ANASTASIS_BACKUP_STATE_SECRET_EDITING,
      "enter_secret",
      &enter_secret
    },
    {
      ANASTASIS_BACKUP_STATE_SECRET_EDITING,
      "clear_secret",
      &clear_secret
    },
    {
      ANASTASIS_BACKUP_STATE_SECRET_EDITING,
      "enter_secret_name",
      &enter_secret_name
    },
    {
      ANASTASIS_BACKUP_STATE_SECRET_EDITING,
      "back",
      &ANASTASIS_back_generic_decrement_
    },
    {
      ANASTASIS_BACKUP_STATE_SECRET_EDITING,
      "update_expiration",
      &update_expiration
    },
    {
      ANASTASIS_BACKUP_STATE_SECRET_EDITING,
      "next",
      &finish_secret
    },
    {
      ANASTASIS_BACKUP_STATE_TRUTHS_PAYING,
      "pay",
      &pay_truths_backup
    },
    {
      ANASTASIS_BACKUP_STATE_POLICIES_PAYING,
      "pay",
      &pay_policies_backup
    },
    {
      ANASTASIS_BACKUP_STATE_BACKUP_FINISHED,
      "back",
      &back_finished
    },
    { ANASTASIS_BACKUP_STATE_ERROR, NULL, NULL }
  };
  const char *s = json_string_value (json_object_get (state,
                                                      "backup_state"));
  enum ANASTASIS_BackupState bs;

  GNUNET_assert (NULL != s); /* holds as per invariant of caller */
  bs = ANASTASIS_backup_state_from_string_ (s);
  if (ANASTASIS_BACKUP_STATE_ERROR == bs)
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "unknown 'backup_state'");
    return NULL;
  }
  for (unsigned int i = 0; NULL != dispatchers[i].fun; i++)
  {
    if ( (bs == dispatchers[i].backup_state) &&
         (0 == strcmp (action,
                       dispatchers[i].backup_action)) )
    {
      return dispatchers[i].fun (state,
                                 arguments,
                                 cb,
                                 cb_cls);
    }
  }
  ANASTASIS_redux_fail_ (cb,
                         cb_cls,
                         TALER_EC_ANASTASIS_REDUCER_ACTION_INVALID,
                         action);
  return NULL;
}


/**
 * State for a #ANASTASIS_REDUX_backup_begin_() operation.
 */
struct BackupStartState;


/**
 * Entry in the list of all known applicable Anastasis providers.
 * Used to wait for it to complete downloading /config.
 */
struct BackupStartStateProviderEntry
{
  /**
   * Kept in a DLL.
   */
  struct BackupStartStateProviderEntry *next;

  /**
   * Kept in a DLL.
   */
  struct BackupStartStateProviderEntry *prev;

  /**
   * Main operation this entry is part of.
   */
  struct BackupStartState *bss;

  /**
   * Resulting provider information, NULL if not (yet) available.
   */
  json_t *istate;

  /**
   * Ongoing reducer action to obtain /config, NULL if completed.
   */
  struct ANASTASIS_ReduxAction *ra;

  /**
   * Final result of the operation (once completed).
   */
  enum TALER_ErrorCode ec;
};


struct BackupStartState
{
  /**
   * Head of list of provider /config operations we are doing.
   */
  struct BackupStartStateProviderEntry *pe_head;

  /**
   * Tail of list of provider /config operations we are doing.
   */
  struct BackupStartStateProviderEntry *pe_tail;

  /**
   * State we are updating.
   */
  json_t *state;

  /**
   * Function to call when we are done.
   */
  ANASTASIS_ActionCallback cb;

  /**
   * Closure for @e cb.
   */
  void *cb_cls;

  /**
   * Redux action we returned to our controller.
   */
  struct ANASTASIS_ReduxAction ra;

  /**
   * Number of provider /config operations in @e ba_head that
   * are still awaiting completion.
   */
  unsigned int pending;
};


/**
 * The backup start operation is being aborted, terminate.
 *
 * @param cls a `struct BackupStartState *`
 */
static void
abort_backup_begin_cb (void *cls)
{
  struct BackupStartState *bss = cls;
  struct BackupStartStateProviderEntry *pe;

  while (NULL != (pe = bss->pe_head))
  {
    GNUNET_CONTAINER_DLL_remove (bss->pe_head,
                                 bss->pe_tail,
                                 pe);
    if (NULL != pe->ra)
      pe->ra->cleanup (pe->ra->cleanup_cls);
    json_decref (pe->istate);
    GNUNET_free (pe);
  }
  json_decref (bss->state);
  GNUNET_free (bss);
}


/**
 * We finished downloading /config from all providers, merge
 * into the main state, trigger the continuation and free our
 * state.
 *
 * @param[in] bss main state to merge into
 */
static void
providers_complete (struct BackupStartState *bss)
{
  struct BackupStartStateProviderEntry *pe;
  json_t *tlist;

  tlist = json_object_get (bss->state,
                           "authentication_providers");
  if (NULL == tlist)
  {
    tlist = json_object ();
    GNUNET_assert (NULL != tlist);
    GNUNET_assert (0 ==
                   json_object_set_new (bss->state,
                                        "authentication_providers",
                                        tlist));
  }
  while (NULL != (pe = bss->pe_head))
  {
    json_t *provider_list;

    GNUNET_CONTAINER_DLL_remove (bss->pe_head,
                                 bss->pe_tail,
                                 pe);
    provider_list = json_object_get (pe->istate,
                                     "authentication_providers");
    /* merge provider_list into tlist (overriding existing entries) */
    if (NULL != provider_list)
    {
      const char *url;
      json_t *value;

      json_object_foreach (provider_list, url, value) {
        GNUNET_assert (0 ==
                       json_object_set (tlist,
                                        url,
                                        value));
      }
    }
    json_decref (pe->istate);
    GNUNET_free (pe);
  }
  bss->cb (bss->cb_cls,
           TALER_EC_NONE,
           bss->state);
  json_decref (bss->state);
  GNUNET_free (bss);
}


/**
 * Function called when the complete information about a provider
 * was added to @a new_state.
 *
 * @param cls a `struct BackupStartStateProviderEntry`
 * @param error error code
 * @param new_state resulting new state
 */
static void
provider_added_cb (void *cls,
                   enum TALER_ErrorCode error,
                   json_t *new_state)
{
  struct BackupStartStateProviderEntry *pe = cls;

  pe->ra = NULL;
  pe->istate = json_incref (new_state);
  pe->ec = error;
  pe->bss->pending--;
  if (0 == pe->bss->pending)
    providers_complete (pe->bss);
}


struct ANASTASIS_ReduxAction *
ANASTASIS_REDUX_backup_begin_ (json_t *state,
                               const json_t *arguments,
                               ANASTASIS_ActionCallback cb,
                               void *cb_cls)
{
  json_t *provider_list;
  struct BackupStartState *bss;

  provider_list = json_object_get (state,
                                   "authentication_providers");
  if (NULL == provider_list)
  {
    GNUNET_break (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'authentication_providers' missing");
    return NULL;
  }
  bss = GNUNET_new (struct BackupStartState);
  bss->state = json_incref (state);
  bss->cb = cb;
  bss->cb_cls = cb_cls;
  bss->ra.cleanup_cls = bss;
  bss->ra.cleanup = &abort_backup_begin_cb;
  bss->pending = 1; /* decremented after initialization loop */

  {
    json_t *prov;
    const char *url;
    json_object_foreach (provider_list, url, prov) {
      struct BackupStartStateProviderEntry *pe;
      json_t *istate;

      pe = GNUNET_new (struct BackupStartStateProviderEntry);
      pe->bss = bss;
      istate = json_object ();
      GNUNET_assert (NULL != istate);
      GNUNET_CONTAINER_DLL_insert (bss->pe_head,
                                   bss->pe_tail,
                                   pe);
      pe->ra = ANASTASIS_REDUX_add_provider_to_state_ (url,
                                                       istate,
                                                       &provider_added_cb,
                                                       pe);
      json_decref (istate);
      if (NULL != pe->ra)
        bss->pending++;
    }
  }
  bss->pending--;
  if (0 == bss->pending)
  {
    providers_complete (bss);
    return NULL;
  }
  return &bss->ra;
}
