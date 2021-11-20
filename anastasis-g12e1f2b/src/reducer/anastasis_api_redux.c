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
 * @file reducer/anastasis_api_redux.c
 * @brief anastasis reducer api
 * @author Christian Grothoff
 * @author Dominik Meister
 * @author Dennis Neufeld
 */
#include <platform.h>
#include <jansson.h>
#include "anastasis_redux.h"
#include "anastasis_error_codes.h"
#include <taler/taler_json_lib.h>
#include "anastasis_api_redux.h"
#include <dlfcn.h>


/**
 * How long do we wait at most for a /config reply from an Anastasis provider.
 * 60s is very generous, given the tiny bandwidth required, even for the most
 * remote locations.
 */
#define CONFIG_GENERIC_TIMEOUT GNUNET_TIME_UNIT_MINUTES


#define GENERATE_STRING(STRING) #STRING,
static const char *generic_strings[] = {
  ANASTASIS_GENERIC_STATES (GENERATE_STRING)
};
#undef GENERATE_STRING


/**
 * #ANASTASIS_REDUX_add_provider_to_state_ waiting for the
 * configuration request to complete or fail.
 */
struct ConfigReduxWaiting
{
  /**
   * Kept in a DLL.
   */
  struct ConfigReduxWaiting *prev;

  /**
   * Kept in a DLL.
   */
  struct ConfigReduxWaiting *next;

  /**
   * Associated redux action.
   */
  struct ANASTASIS_ReduxAction ra;

  /**
   * Config request we are waiting for.
   */
  struct ConfigRequest *cr;

  /**
   * State we are processing.
   */
  json_t *state;

  /**
   * Function to call with updated @e state.
   */
  ANASTASIS_ActionCallback cb;

  /**
   * Closure for @e cb.
   */
  void *cb_cls;

};


/**
 * Anastasis authorization method configuration
 */
struct AuthorizationMethodConfig
{
  /**
   * Type of the method, i.e. "question".
   */
  char *type;

  /**
   * Fee charged for accessing key share using this method.
   */
  struct TALER_Amount usage_fee;
};


/**
 * State for a "get config" operation.
 */
struct ConfigRequest
{

  /**
   * Kept in a DLL, given that we may have multiple backends.
   */
  struct ConfigRequest *next;

  /**
   * Kept in a DLL, given that we may have multiple backends.
   */
  struct ConfigRequest *prev;

  /**
   * Head of DLL of REDUX operations waiting for an answer.
   */
  struct ConfigReduxWaiting *w_head;

  /**
   * Tail of DLL of REDUX operations waiting for an answer.
   */
  struct ConfigReduxWaiting *w_tail;

  /**
   * Obtained status code.
   */
  unsigned int http_status;

  /**
   * The /config GET operation handle.
   */
  struct ANASTASIS_ConfigOperation *co;

  /**
   * URL of the anastasis backend.
   */
  char *url;

  /**
   * Business name of the anastasis backend.
   */
  char *business_name;

  /**
   * currency used by the anastasis backend.
   */
  char *currency;

  /**
   * Array of authorization methods supported by the server.
   */
  struct AuthorizationMethodConfig *methods;

  /**
   * Length of the @e methods array.
   */
  unsigned int methods_length;

  /**
   * Maximum size of an upload in megabytes.
   */
  uint32_t storage_limit_in_megabytes;

  /**
   * Annual fee for an account / policy upload.
   */
  struct TALER_Amount annual_fee;

  /**
   * Fee for a truth upload.
   */
  struct TALER_Amount truth_upload_fee;

  /**
   * Maximum legal liability for data loss covered by the
   * provider.
   */
  struct TALER_Amount liability_limit;

  /**
   * Server salt.
   */
  struct ANASTASIS_CRYPTO_ProviderSaltP salt;

  /**
   * Task to timeout /config requests.
   */
  struct GNUNET_SCHEDULER_Task *tt;

  /**
   * Status of the /config request.
   */
  enum TALER_ErrorCode ec;
};


/**
 * Reducer API's CURL context handle.
 */
struct GNUNET_CURL_Context *ANASTASIS_REDUX_ctx_;

/**
 * JSON containing country specific identity attributes to ask the user for.
 */
static json_t *redux_id_attr;

/**
 * Head of DLL of Anastasis backend configuration requests.
 */
static struct ConfigRequest *cr_head;

/**
 * Tail of DLL of Anastasis backend configuration requests.
 */
static struct ConfigRequest *cr_tail;

/**
 * JSON containing country specific information.
 */
static json_t *redux_countries;

/**
 * List of Anastasis providers.
 */
static json_t *provider_list;

/**
 * External reducer binary or NULL
 * to use internal reducer.
 */
static char *external_reducer_binary;


const char *
ANASTASIS_REDUX_probe_external_reducer (void)
{
  if (NULL != external_reducer_binary)
    return external_reducer_binary;
  external_reducer_binary = getenv ("ANASTASIS_EXTERNAL_REDUCER");
  if (NULL != external_reducer_binary)
    unsetenv ("ANASTASIS_EXTERNAL_REDUCER");

  return external_reducer_binary;

}


/**
 * Extract the mode of a state from json
 *
 * @param state the state to operate on
 * @return "backup_state" or "recovery_state"
 */
static const char *
get_state_mode (const json_t *state)
{
  if (json_object_get (state, "backup_state"))
    return "backup_state";
  if (json_object_get (state, "recovery_state"))
    return "recovery_state";
  GNUNET_assert (0);
  return NULL;
}


enum ANASTASIS_GenericState
ANASTASIS_generic_state_from_string_ (const char *state_string)
{
  for (enum ANASTASIS_GenericState i = 0;
       i < sizeof (generic_strings) / sizeof(*generic_strings);
       i++)
    if (0 == strcmp (state_string,
                     generic_strings[i]))
      return i;
  return ANASTASIS_GENERIC_STATE_INVALID;
}


const char *
ANASTASIS_generic_state_to_string_ (enum ANASTASIS_GenericState gs)
{
  if ( (gs < 0) ||
       (gs >= sizeof (generic_strings) / sizeof(*generic_strings)) )
  {
    GNUNET_break_op (0);
    return NULL;
  }
  return generic_strings[gs];
}


void
ANASTASIS_redux_fail_ (ANASTASIS_ActionCallback cb,
                       void *cb_cls,
                       enum TALER_ErrorCode ec,
                       const char *detail)
{
  json_t *estate;

  estate = GNUNET_JSON_PACK (
    GNUNET_JSON_pack_allow_null (
      GNUNET_JSON_pack_string ("detail",
                               detail)),
    GNUNET_JSON_pack_uint64 ("code",
                             ec),
    GNUNET_JSON_pack_string ("hint",
                             TALER_ErrorCode_get_hint (ec)));
  cb (cb_cls,
      ec,
      estate);
  json_decref (estate);
}


/**
 * Transition the @a state to @a gs.
 *
 * @param[in,out] state to transition
 * @param gs state to transition to
 */
static void
redux_transition (json_t *state,
                  enum ANASTASIS_GenericState gs)
{
  const char *s_mode = get_state_mode (state);

  GNUNET_assert (0 ==
                 json_object_set_new (
                   state,
                   s_mode,
                   json_string (
                     ANASTASIS_generic_state_to_string_ (gs))));

}


void
ANASTASIS_redux_init (struct GNUNET_CURL_Context *ctx)
{
  ANASTASIS_REDUX_ctx_ = ctx;
}


/**
 * Function to free a `struct ConfigRequest`, an async operation.
 *
 * @param cr state for a "get config" operation
 */
static void
free_config_request (struct ConfigRequest *cr)
{
  GNUNET_assert (NULL == cr->w_head);
  if (NULL != cr->co)
    ANASTASIS_config_cancel (cr->co);
  if (NULL != cr->tt)
    GNUNET_SCHEDULER_cancel (cr->tt);
  GNUNET_free (cr->currency);
  GNUNET_free (cr->url);
  GNUNET_free (cr->business_name);
  for (unsigned int i = 0; i<cr->methods_length; i++)
    GNUNET_free (cr->methods[i].type);
  GNUNET_free (cr->methods);
  GNUNET_free (cr);
}


void
ANASTASIS_redux_done ()
{
  struct ConfigRequest *cr;

  while (NULL != (cr = cr_head))
  {
    GNUNET_CONTAINER_DLL_remove (cr_head,
                                 cr_tail,
                                 cr);
    free_config_request (cr);
  }
  ANASTASIS_REDUX_ctx_ = NULL;
  if (NULL != redux_countries)
  {
    json_decref (redux_countries);
    redux_countries = NULL;
  }
  if (NULL != redux_id_attr)
  {
    json_decref (redux_id_attr);
    redux_id_attr = NULL;
  }
  if (NULL != provider_list)
  {
    json_decref (provider_list);
    provider_list = NULL;
  }
}


const json_t *
ANASTASIS_redux_countries_init_ (void)
{
  char *dn;
  json_error_t error;

  if (NULL != redux_countries)
    return redux_countries;

  {
    char *path;

    path = GNUNET_OS_installation_get_path (GNUNET_OS_IPK_DATADIR);
    if (NULL == path)
    {
      GNUNET_break (0);
      return NULL;
    }
    GNUNET_asprintf (&dn,
                     "%s/redux.countries.json",
                     path);
    GNUNET_free (path);
  }
  redux_countries = json_load_file (dn,
                                    JSON_COMPACT,
                                    &error);
  if (NULL == redux_countries)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Failed to parse `%s': %s at %d:%d (%d)\n",
                dn,
                error.text,
                error.line,
                error.column,
                error.position);
    GNUNET_free (dn);
    return NULL;
  }
  GNUNET_free (dn);
  return redux_countries;
}


/**
 * Abort waiting for /config reply.
 *
 * @param cls a `struct ConfigReduxWaiting` handle.
 */
static void
abort_provider_config_cb (void *cls)
{
  struct ConfigReduxWaiting *w = cls;
  struct ConfigRequest *cr = w->cr;

  GNUNET_CONTAINER_DLL_remove (cr->w_head,
                               cr->w_tail,
                               w);
  json_decref (w->state);
  GNUNET_free (w);
}


/**
 * Notify anyone waiting on @a cr that the request is done
 * (successful or failed).
 *
 * @param[in,out] cr request that completed
 */
static void
notify_waiting (struct ConfigRequest *cr)
{
  struct ConfigReduxWaiting *w;

  while (NULL != (w = cr->w_head))
  {
    json_t *provider_list;
    json_t *prov;

    if (NULL == (provider_list = json_object_get (w->state,
                                                  "authentication_providers")))
    {
      GNUNET_assert (0 ==
                     json_object_set_new (w->state,
                                          "authentication_providers",
                                          provider_list = json_object ()));
    }
    provider_list = json_object_get (w->state,
                                     "authentication_providers");
    GNUNET_assert (NULL != provider_list);

    if (TALER_EC_NONE != cr->ec)
    {
      prov = GNUNET_JSON_PACK (
        GNUNET_JSON_pack_uint64 ("error_code",
                                 cr->ec),
        GNUNET_JSON_pack_uint64 ("http_status",
                                 cr->http_status));
    }
    else
    {
      json_t *methods_list;

      methods_list = json_array ();
      GNUNET_assert (NULL != methods_list);
      for (unsigned int i = 0; i<cr->methods_length; i++)
      {
        struct AuthorizationMethodConfig *method = &cr->methods[i];
        json_t *mj = GNUNET_JSON_PACK (
          GNUNET_JSON_pack_string ("type",
                                   method->type),
          TALER_JSON_pack_amount ("usage_fee",
                                  &method->usage_fee));

        GNUNET_assert (0 ==
                       json_array_append_new (methods_list,
                                              mj));
      }
      prov = GNUNET_JSON_PACK (
        GNUNET_JSON_pack_array_steal ("methods",
                                      methods_list),
        TALER_JSON_pack_amount ("annual_fee",
                                &cr->annual_fee),
        TALER_JSON_pack_amount ("truth_upload_fee",
                                &cr->truth_upload_fee),
        TALER_JSON_pack_amount ("liability_limit",
                                &cr->liability_limit),
        GNUNET_JSON_pack_string ("currency",
                                 cr->currency),
        GNUNET_JSON_pack_string ("business_name",
                                 cr->business_name),
        GNUNET_JSON_pack_uint64 ("storage_limit_in_megabytes",
                                 cr->storage_limit_in_megabytes),
        GNUNET_JSON_pack_data_auto ("salt",
                                    &cr->salt),
        GNUNET_JSON_pack_uint64 ("http_status",
                                 cr->http_status));
    }
    GNUNET_assert (0 ==
                   json_object_set_new (provider_list,
                                        cr->url,
                                        prov));
    w->cb (w->cb_cls,
           cr->ec,
           w->state);
    abort_provider_config_cb (w);
  }

}


/**
 * Function called with the results of a #ANASTASIS_get_config().
 *
 * @param cls closure
 * @param http_status HTTP status of the request
 * @param acfg anastasis configuration
 */
static void
config_cb (void *cls,
           unsigned int http_status,
           const struct ANASTASIS_Config *acfg)
{
  struct ConfigRequest *cr = cls;

  cr->co = NULL;
  GNUNET_SCHEDULER_cancel (cr->tt);
  cr->tt = NULL;
  cr->http_status = http_status;
  if (MHD_HTTP_OK != http_status)
    cr->ec = TALER_EC_ANASTASIS_REDUCER_PROVIDER_CONFIG_FAILED;
  if ( (MHD_HTTP_OK == http_status) &&
       (NULL == acfg) )
  {
    cr->http_status = MHD_HTTP_NOT_FOUND;
    cr->ec = TALER_EC_ANASTASIS_REDUCER_PROVIDER_CONFIG_FAILED;
  }
  else if (NULL != acfg)
  {
    if (0 == acfg->storage_limit_in_megabytes)
    {
      cr->http_status = 0;
      cr->ec = TALER_EC_ANASTASIS_REDUCER_PROVIDER_INVALID_CONFIG;
    }
    else
    {
      GNUNET_free (cr->currency);
      cr->currency = GNUNET_strdup (acfg->currency);
      GNUNET_free (cr->business_name);
      cr->business_name = GNUNET_strdup (acfg->business_name);
      for (unsigned int i = 0; i<cr->methods_length; i++)
        GNUNET_free (cr->methods[i].type);
      GNUNET_free (cr->methods);
      cr->methods = GNUNET_new_array (acfg->methods_length,
                                      struct AuthorizationMethodConfig);
      for (unsigned int i = 0; i<acfg->methods_length; i++)
      {
        cr->methods[i].type = GNUNET_strdup (acfg->methods[i].type);
        cr->methods[i].usage_fee = acfg->methods[i].usage_fee;
      }
      cr->methods_length = acfg->methods_length;
      cr->storage_limit_in_megabytes = acfg->storage_limit_in_megabytes;
      cr->annual_fee = acfg->annual_fee;
      cr->truth_upload_fee = acfg->truth_upload_fee;
      cr->liability_limit = acfg->liability_limit;
      cr->salt = acfg->salt;
    }
  }
  notify_waiting (cr);
}


/**
 * Aborts a "get config" after timeout.
 *
 * @param cls closure for a "get config" request
 */
static void
config_request_timeout (void *cls)
{
  struct ConfigRequest *cr = cls;

  cr->tt = NULL;
  ANASTASIS_config_cancel (cr->co);
  cr->co = NULL;
  cr->http_status = 0;
  cr->ec = TALER_EC_GENERIC_TIMEOUT;
  notify_waiting (cr);
}


/**
 * Schedule job to obtain Anastasis provider configuration at @a url.
 *
 * @param url base URL of Anastasis provider
 * @return check config handle
 */
static struct ConfigRequest *
check_config (const char *url)
{
  struct ConfigRequest *cr;

  for (cr = cr_head; NULL != cr; cr = cr->next)
  {
    if (0 != strcmp (url,
                     cr->url))
      continue;
    if (NULL != cr->co)
      return cr; /* already on it */
    break;
  }
  if (NULL == cr)
  {
    cr = GNUNET_new (struct ConfigRequest);
    cr->url = GNUNET_strdup (url);
    GNUNET_CONTAINER_DLL_insert (cr_head,
                                 cr_tail,
                                 cr);
  }
  cr->co = ANASTASIS_get_config (ANASTASIS_REDUX_ctx_,
                                 cr->url,
                                 &config_cb,
                                 cr);
  if (NULL == cr->co)
  {
    GNUNET_break (0);
    return NULL;
  }
  else
  {
    cr->tt = GNUNET_SCHEDULER_add_delayed (CONFIG_GENERIC_TIMEOUT,
                                           &config_request_timeout,
                                           cr);
  }
  return cr;
}


/**
 * Begin asynchronous check for provider configurations.
 *
 * @param currencies the currencies to initiate the provider checks for
 * @param[in,out] state to set provider list for
 * @return #TALER_EC_NONE on success
 */
static enum TALER_ErrorCode
begin_provider_config_check (const json_t *currencies,
                             json_t *state)
{
  if (NULL == provider_list)
  {
    json_error_t error;
    char *dn;
    char *path;

    path = GNUNET_OS_installation_get_path (GNUNET_OS_IPK_DATADIR);
    if (NULL == path)
    {
      GNUNET_break (0);
      return TALER_EC_GENERIC_INTERNAL_INVARIANT_FAILURE;
    }
    GNUNET_asprintf (&dn,
                     "%s/provider-list.json",
                     path);
    GNUNET_free (path);
    provider_list = json_load_file (dn,
                                    JSON_COMPACT,
                                    &error);
    if (NULL == provider_list)
    {
      GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                  "Failed to parse `%s': %s at %d:%d (%d)\n",
                  dn,
                  error.text,
                  error.line,
                  error.column,
                  error.position);
      GNUNET_free (dn);
      return TALER_EC_ANASTASIS_REDUCER_RESOURCE_MALFORMED;
    }
    GNUNET_free (dn);
  }

  {
    size_t index;
    json_t *provider;
    const json_t *provider_arr = json_object_get (provider_list,
                                                  "anastasis_provider");
    json_t *pl;

    pl = json_object ();
    json_array_foreach (provider_arr, index, provider)
    {
      const char *url;
      const char *cur;
      struct GNUNET_JSON_Specification spec[] = {
        GNUNET_JSON_spec_string ("url",
                                 &url),
        GNUNET_JSON_spec_string ("currency",
                                 &cur),
        GNUNET_JSON_spec_end ()
      };

      if (GNUNET_OK !=
          GNUNET_JSON_parse (provider,
                             spec,
                             NULL, NULL))
      {
        GNUNET_break (0);
        json_decref (pl);
        return TALER_EC_ANASTASIS_REDUCER_RESOURCE_MALFORMED;
      }

      {
        bool found = false;
        json_t *cu;
        size_t off;

        json_array_foreach (currencies, off, cu)
        {
          const char *currency;

          currency = json_string_value (cu);
          if (NULL == currency)
          {
            json_decref (pl);
            return TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID;
          }
          found = (0 == strcasecmp (currency,
                                    cur));
        }
        if (! found)
          continue;
      }
      GNUNET_assert (0 ==
                     json_object_set_new (pl,
                                          url,
                                          json_object ()));
      check_config (url);
    }
    GNUNET_assert (0 ==
                   json_object_set_new (state,
                                        "authentication_providers",
                                        pl));
  }
  return TALER_EC_NONE;
}


/**
 * Function to validate an input by regular expression ("validation-regex").
 *
 * @param input text to validate
 * @param regexp regular expression to validate
 * @return true if validation passed, else false
 */
static bool
validate_regex (const char *input,
                const char *regexp)
{
  regex_t regex;

  if (0 != regcomp (&regex,
                    regexp,
                    REG_EXTENDED))
  {
    GNUNET_break (0);
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Failed to compile regular expression `%s'.",
                regexp);
    return true;
  }
  /* check if input has correct form */
  if (0 != regexec (&regex,
                    input,
                    0,
                    NULL,
                    0))
  {
    GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                "Input `%s' does not match regex `%s'\n",
                input,
                regexp);
    regfree (&regex);
    return false;
  }
  regfree (&regex);
  return true;
}


/**
 * Function to load json containing country specific identity
 * attributes.  Uses a single-slot cache to avoid loading
 * exactly the same attributes twice.
 *
 * @param country_code country code (e.g. "de")
 * @return NULL on error
 */
static const json_t *
redux_id_attr_init (const char *country_code)
{
  static char redux_id_cc[3];
  char *dn;
  json_error_t error;

  if (0 == strcmp (country_code,
                   redux_id_cc))
    return redux_id_attr;

  if (NULL != redux_id_attr)
  {
    json_decref (redux_id_attr);
    redux_id_attr = NULL;
  }
  {
    char *path;

    path = GNUNET_OS_installation_get_path (GNUNET_OS_IPK_DATADIR);
    if (NULL == path)
    {
      GNUNET_break (0);
      return NULL;
    }
    GNUNET_asprintf (&dn,
                     "%s/redux.%s.json",
                     path,
                     country_code);
    GNUNET_free (path);
  }
  redux_id_attr = json_load_file (dn,
                                  JSON_COMPACT,
                                  &error);
  if (NULL == redux_id_attr)
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "Failed to parse `%s': %s at %d:%d (%d)\n",
                dn,
                error.text,
                error.line,
                error.column,
                error.position);
    GNUNET_free (dn);
    return NULL;
  }
  GNUNET_free (dn);
  strncpy (redux_id_cc,
           country_code,
           sizeof (redux_id_cc));
  redux_id_cc[2] = '\0';
  return redux_id_attr;
}


/**
 * DispatchHandler/Callback function which is called for a
 * "select_continent" action.
 *
 * @param state state to operate on
 * @param arguments arguments to use for operation on state
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 * @return NULL
 */
static struct ANASTASIS_ReduxAction *
select_continent (json_t *state,
                  const json_t *arguments,
                  ANASTASIS_ActionCallback cb,
                  void *cb_cls)
{
  const json_t *redux_countries = ANASTASIS_redux_countries_init_ ();
  const json_t *root = json_object_get (redux_countries,
                                        "countries");
  const json_t *continent;
  json_t *countries;

  if (NULL == root)
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_RESOURCE_MALFORMED,
                           "'countries' missing");
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
  continent = json_object_get (arguments,
                               "continent");
  if (NULL == continent)
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "'continent' missing");
    return NULL;
  }
  countries = json_array ();
  GNUNET_assert (NULL != countries);
  {
    size_t index;
    const json_t *country;
    bool found = false;

    json_array_foreach (root, index, country)
    {
      json_t *temp_continent = json_object_get (country,
                                                "continent");
      if (1 == json_equal (continent,
                           temp_continent))
      {
        GNUNET_assert (0 ==
                       json_array_append (countries,
                                          (json_t *) country));
        found = true;
      }
    }
    if (! found)
    {
      ANASTASIS_redux_fail_ (cb,
                             cb_cls,
                             TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                             "'continent' unknown");
      return NULL;
    }
  }
  redux_transition (state,
                    ANASTASIS_GENERIC_STATE_COUNTRY_SELECTING);
  GNUNET_assert (0 ==
                 json_object_set (state,
                                  "selected_continent",
                                  (json_t *) continent));
  GNUNET_assert (0 ==
                 json_object_set_new (state,
                                      "countries",
                                      countries));
  cb (cb_cls,
      TALER_EC_NONE,
      state);
  return NULL;
}


/**
 * DispatchHandler/Callback function which is called for a
 * "select_country" action.
 *
 * @param state state to operate on
 * @param arguments arguments to use for operation on state
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 * @return #ANASTASIS_ReduxAction
 */
static struct ANASTASIS_ReduxAction *
select_country (json_t *state,
                const json_t *arguments,
                ANASTASIS_ActionCallback cb,
                void *cb_cls)
{
  const json_t *required_attrs;
  const json_t *country_code;
  const json_t *currencies;
  const json_t *redux_id_attr;

  if (NULL == arguments)
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "arguments missing");
    return NULL;
  }
  country_code = json_object_get (arguments,
                                  "country_code");
  if (NULL == country_code)
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'country_code' missing");
    return NULL;
  }

  {
    json_t *countries = json_object_get (state,
                                         "countries");
    size_t index;
    json_t *country;
    bool found = false;

    json_array_foreach (countries, index, country)
    {
      json_t *cc = json_object_get (country,
                                    "code");
      if (1 == json_equal (country_code,
                           cc))
      {
        found = true;
        break;
      }
    }
    if (! found)
    {
      ANASTASIS_redux_fail_ (cb,
                             cb_cls,
                             TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                             "specified country not on selected continent");
      return NULL;
    }
  }

  currencies = json_object_get (arguments,
                                "currencies");
  if ( (NULL == currencies) ||
       (! json_is_array (currencies))  )
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'currencies' missing");
    return NULL;
  }
  /* We now have an idea of the currency, begin fetching
     provider /configs (we likely need them later) */
  {
    enum TALER_ErrorCode ec;

    ec = begin_provider_config_check (currencies,
                                      state);
    if (TALER_EC_NONE != ec)
    {
      GNUNET_break (0);
      ANASTASIS_redux_fail_ (cb,
                             cb_cls,
                             ec,
                             NULL);
      return NULL;
    }
  }
  redux_id_attr = redux_id_attr_init (json_string_value (country_code));
  if (NULL == redux_id_attr)
  {
    GNUNET_break (0);
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_RESOURCE_MISSING,
                           json_string_value (country_code));
    return NULL;
  }
  required_attrs = json_object_get (redux_id_attr,
                                    "required_attributes");
  if (NULL == required_attrs)
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_RESOURCE_MALFORMED,
                           "'required_attributes' missing");
    return NULL;
  }
  redux_transition (state,
                    ANASTASIS_GENERIC_STATE_USER_ATTRIBUTES_COLLECTING);
  GNUNET_assert (0 ==
                 json_object_set (state,
                                  "selected_country",
                                  (json_t *) country_code));
  GNUNET_assert (0 ==
                 json_object_set (state,
                                  "currencies",
                                  (json_t *) currencies));
  GNUNET_assert (0 ==
                 json_object_set (state,
                                  "required_attributes",
                                  (json_t *) required_attrs));
  cb (cb_cls,
      TALER_EC_NONE,
      state);
  return NULL;
}


/**
 * DispatchHandler/Callback function which is called for a
 * "unselect_continent" action.
 *
 * @param state state to operate on
 * @param arguments arguments to use for operation on state
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 * @return NULL
 */
static struct ANASTASIS_ReduxAction *
unselect_continent (json_t *state,
                    const json_t *arguments,
                    ANASTASIS_ActionCallback cb,
                    void *cb_cls)
{
  redux_transition (state,
                    ANASTASIS_GENERIC_STATE_CONTINENT_SELECTING);
  cb (cb_cls,
      TALER_EC_NONE,
      state);
  return NULL;
}


struct ANASTASIS_ReduxAction *
ANASTASIS_REDUX_add_provider_to_state_ (const char *url,
                                        json_t *state,
                                        ANASTASIS_ActionCallback cb,
                                        void *cb_cls)
{
  struct ConfigRequest *cr;
  struct ConfigReduxWaiting *w;

  cr = check_config (url);
  w = GNUNET_new (struct ConfigReduxWaiting);
  w->cr = cr;
  w->state = json_incref (state);
  w->cb = cb;
  w->cb_cls = cb_cls;
  w->ra.cleanup = &abort_provider_config_cb;
  w->ra.cleanup_cls = w;
  GNUNET_CONTAINER_DLL_insert (cr->w_head,
                               cr->w_tail,
                               w);
  if (NULL == cr->co)
  {
    notify_waiting (cr);
    return NULL;
  }
  return &w->ra;
}


/**
 * DispatchHandler/Callback function which is called for a
 * "enter_user_attributes" action.
 * Returns an #ANASTASIS_ReduxAction if operation is async.
 *
 * @param state state to operate on
 * @param arguments arguments to use for operation on state
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 * @return NULL
 */
static struct ANASTASIS_ReduxAction *
enter_user_attributes (json_t *state,
                       const json_t *arguments,
                       ANASTASIS_ActionCallback cb,
                       void *cb_cls)
{
  const json_t *attributes;
  const json_t *required_attributes;

  if (NULL == arguments)
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "arguments missing");
    return NULL;
  }
  attributes = json_object_get (arguments,
                                "identity_attributes");
  if (NULL == attributes)
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "'identity_attributes' missing");
    return NULL;
  }
  GNUNET_assert (0 ==
                 json_object_set (state,
                                  "identity_attributes",
                                  (json_t *) attributes));

  /* Verify required attributes are present and well-formed */
  required_attributes = json_object_get (state,
                                         "required_attributes");
  if ( (NULL == required_attributes) ||
       (! json_is_array (required_attributes)) )
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                           "'required_attributes' must be an array");
    return NULL;
  }
  {
    size_t index;
    json_t *required_attribute;

    json_array_foreach (required_attributes, index, required_attribute)
    {
      const char *name;
      const char *attribute_value;
      const char *regexp = NULL;
      const char *reglog = NULL;
      int optional = false;
      struct GNUNET_JSON_Specification spec[] = {
        GNUNET_JSON_spec_string ("name",
                                 &name),
        GNUNET_JSON_spec_mark_optional (
          GNUNET_JSON_spec_string ("validation-regex",
                                   &regexp)),
        GNUNET_JSON_spec_mark_optional (
          GNUNET_JSON_spec_string ("validation-logic",
                                   &reglog)),
        GNUNET_JSON_spec_mark_optional (
          GNUNET_JSON_spec_boolean ("optional",
                                    &optional)),
        GNUNET_JSON_spec_end ()
      };

      if (GNUNET_OK !=
          GNUNET_JSON_parse (required_attribute,
                             spec,
                             NULL, NULL))
      {
        GNUNET_break (0);
        ANASTASIS_redux_fail_ (cb,
                               cb_cls,
                               TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
                               "'required_attributes' lacks required fields");
        return NULL;
      }
      attribute_value = json_string_value (json_object_get (attributes,
                                                            name));
      if (NULL == attribute_value)
      {
        if (optional)
          continue;
        GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                    "Request is missing required attribute `%s'\n",
                    name);
        ANASTASIS_redux_fail_ (cb,
                               cb_cls,
                               TALER_EC_GENERIC_PARAMETER_MISSING,
                               name);
        return NULL;
      }
      if ( (NULL != regexp) &&
           (! validate_regex (attribute_value,
                              regexp)) )
      {
        ANASTASIS_redux_fail_ (cb,
                               cb_cls,
                               TALER_EC_ANASTASIS_REDUCER_INPUT_REGEX_FAILED,
                               name);
        return NULL;
      }

      if (NULL != reglog)
      {
        bool (*regfun)(const char *);

        regfun = dlsym (RTLD_DEFAULT,
                        reglog);
        if (NULL == regfun)
        {
          GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                      "Custom validation function `%s' is not available: %s\n",
                      reglog,
                      dlerror ());
        }
        else if (! regfun (attribute_value))
        {
          ANASTASIS_redux_fail_ (cb,
                                 cb_cls,
                                 TALER_EC_ANASTASIS_REDUCER_INPUT_VALIDATION_FAILED,
                                 name);
          return NULL;
        }
      }
    } /* end for all attributes loop */
  } /* end for all attributes scope */

  /* Transition based on mode */
  {
    const char *s_mode = get_state_mode (state);

    if (0 == strcmp (s_mode,
                     "backup_state"))
    {
      GNUNET_assert (0 ==
                     json_object_set_new (
                       state,
                       "backup_state",
                       json_string (
                         ANASTASIS_backup_state_to_string_ (
                           ANASTASIS_BACKUP_STATE_AUTHENTICATIONS_EDITING))));
      return ANASTASIS_REDUX_backup_begin_ (state,
                                            arguments,
                                            cb,
                                            cb_cls);
    }
    else
    {
      GNUNET_assert (0 ==
                     json_object_set_new (
                       state,
                       "recovery_state",
                       json_string (
                         ANASTASIS_recovery_state_to_string_ (
                           ANASTASIS_RECOVERY_STATE_CHALLENGE_SELECTING))));
      return ANASTASIS_REDUX_recovery_challenge_begin_ (state,
                                                        arguments,
                                                        cb,
                                                        cb_cls);
    }
  }
}


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
  cb (cb_cls,
      TALER_EC_NONE,
      state);
  return NULL;
}


bool
ANASTASIS_add_provider_ (json_t *state,
                         const json_t *arguments,
                         ANASTASIS_ActionCallback cb,
                         void *cb_cls)
{
  json_t *tlist;

  if (NULL == arguments)
  {
    ANASTASIS_redux_fail_ (cb,
                           cb_cls,
                           TALER_EC_ANASTASIS_REDUCER_INPUT_INVALID,
                           "arguments missing");
    return true; /* cb was invoked */
  }
  tlist = json_object_get (state,
                           "authentication_providers");
  if (NULL == tlist)
  {
    tlist = json_object ();
    GNUNET_assert (NULL != tlist);
    GNUNET_assert (0 ==
                   json_object_set_new (state,
                                        "authentication_providers",
                                        tlist));
  }
  {
    json_t *params;
    const char *url;

    json_object_foreach (((json_t *) arguments), url, params)
    {
      GNUNET_assert (0 ==
                     json_object_set (tlist,
                                      url,
                                      params));
    }
  }
  return false; /* cb not invoked */
}


struct ANASTASIS_ReduxAction *
ANASTASIS_back_generic_decrement_ (json_t *state,
                                   const json_t *arguments,
                                   ANASTASIS_ActionCallback cb,
                                   void *cb_cls)
{
  const char *s_mode = get_state_mode (state);
  const char *state_string = json_string_value (json_object_get (state,
                                                                 s_mode));

  (void) arguments;
  GNUNET_assert (NULL != state_string);
  if (0 == strcmp ("backup_state",
                   s_mode))
  {
    enum ANASTASIS_BackupState state_index;

    state_index = ANASTASIS_backup_state_from_string_ (state_string);
    GNUNET_assert (state_index > 0);
    state_index = state_index - 1;

    GNUNET_assert (0 ==
                   json_object_set_new (
                     state,
                     s_mode,
                     json_string (
                       ANASTASIS_backup_state_to_string_ (state_index))));
  }
  else
  {
    enum ANASTASIS_RecoveryState state_index;

    state_index = ANASTASIS_recovery_state_from_string_ (state_string);
    GNUNET_assert (state_index > 0);
    state_index = state_index - 1;
    GNUNET_assert (0 ==
                   json_object_set_new (
                     state,
                     s_mode,
                     json_string (
                       ANASTASIS_recovery_state_to_string_ (state_index))));
  }
  cb (cb_cls,
      TALER_EC_NONE,
      state);
  return NULL;
}


/**
 * Callback function which is called by the reducer in dependence of
 * given state and action.
 *
 * @param state the previous state to operate on
 * @param arguments the arguments needed by operation to operate on state
 * @param cb Callback function which returns the new state
 * @param cb_cls closure for @a cb
 * @return handle to cancel async actions, NULL if @a cb was already called
 */
typedef struct ANASTASIS_ReduxAction *
(*DispatchHandler)(json_t *state,
                   const json_t *arguments,
                   ANASTASIS_ActionCallback cb,
                   void *cb_cls);


/**
 * Closure for read operations on the external reducer.
 */
struct ExternalReducerCls
{
  struct GNUNET_Buffer read_buffer;
  struct GNUNET_SCHEDULER_Task *read_task;
  struct GNUNET_DISK_PipeHandle *reducer_stdin;
  struct GNUNET_DISK_PipeHandle *reducer_stdout;
  struct GNUNET_OS_Process *reducer_process;
  ANASTASIS_ActionCallback action_cb;
  void *action_cb_cls;
};

/**
 * Clean up and destroy the external reducer state.
 *
 * @param cls closure, a 'struct ExternalReducerCls *'
 */
static void
cleanup_external_reducer (void *cls)
{
  struct ExternalReducerCls *red_cls = cls;

  if (NULL != red_cls->read_task)
  {
    GNUNET_SCHEDULER_cancel (red_cls->read_task);
    red_cls->read_task = NULL;
  }

  GNUNET_buffer_clear (&red_cls->read_buffer);
  if (NULL != red_cls->reducer_stdin)
  {
    GNUNET_DISK_pipe_close (red_cls->reducer_stdin);
    red_cls->reducer_stdin = NULL;
  }
  if (NULL != red_cls->reducer_stdout)
  {
    GNUNET_DISK_pipe_close (red_cls->reducer_stdout);
    red_cls->reducer_stdout = NULL;
  }

  if (NULL != red_cls->reducer_process)
  {
    enum GNUNET_OS_ProcessStatusType type;
    unsigned long code;
    enum GNUNET_GenericReturnValue pwret;

    pwret = GNUNET_OS_process_wait_status (red_cls->reducer_process,
                                           &type,
                                           &code);

    GNUNET_assert (GNUNET_SYSERR != pwret);
    if (GNUNET_NO == pwret)
    {
      GNUNET_OS_process_kill (red_cls->reducer_process,
                              SIGTERM);
      GNUNET_assert (GNUNET_SYSERR != GNUNET_OS_process_wait (
                       red_cls->reducer_process));
    }

    GNUNET_OS_process_destroy (red_cls->reducer_process);
    red_cls->reducer_process = NULL;
  }

  GNUNET_free (red_cls);
}


/**
 * Task called when
 *
 * @param cls closure, a 'struct ExternalReducerCls *'
 */
static void
external_reducer_read_cb (void *cls)
{
  struct ExternalReducerCls *red_cls = cls;
  ssize_t sret;
  char buf[256];

  red_cls->read_task = NULL;

  sret = GNUNET_DISK_file_read (GNUNET_DISK_pipe_handle (
                                  red_cls->reducer_stdout,
                                  GNUNET_DISK_PIPE_END_READ),
                                buf,
                                256);
  if (sret < 0)
  {
    GNUNET_break (0);
    red_cls->action_cb (red_cls->action_cb_cls,
                        TALER_EC_ANASTASIS_REDUCER_INTERNAL_ERROR,
                        NULL);
    cleanup_external_reducer (red_cls);
    return;
  }
  else if (0 == sret)
  {
    char *str = GNUNET_buffer_reap_str (&red_cls->read_buffer);
    json_t *json;

    GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                "Got external reducer response: '%s'\n",
                str);

    json = json_loads (str, 0, NULL);

    if (NULL == json)
    {
      GNUNET_break (0);
      red_cls->action_cb (red_cls->action_cb_cls,
                          TALER_EC_ANASTASIS_REDUCER_INTERNAL_ERROR,
                          NULL);
      cleanup_external_reducer (red_cls);
      return;
    }

    {
      enum TALER_ErrorCode ec;
      ec = json_integer_value (json_object_get (json, "code"));

      red_cls->action_cb (red_cls->action_cb_cls,
                          ec,
                          json);
    }
    cleanup_external_reducer (red_cls);
    return;
  }
  else
  {
    GNUNET_buffer_write (&red_cls->read_buffer,
                         buf,
                         sret);

    red_cls->read_task = GNUNET_SCHEDULER_add_read_file (
      GNUNET_TIME_UNIT_FOREVER_REL,
      GNUNET_DISK_pipe_handle (
        red_cls->reducer_stdout,
        GNUNET_DISK_PIPE_END_READ),
      external_reducer_read_cb,
      red_cls);
  }
}


/**
 * Handle an action using an external reducer, i.e.
 * by shelling out to another process.
 */
static struct ANASTASIS_ReduxAction *
redux_action_external (const char *ext_reducer,
                       const json_t *state,
                       const char *action,
                       const json_t *arguments,
                       ANASTASIS_ActionCallback cb,
                       void *cb_cls)
{
  char *arg_str;
  char *state_str = json_dumps (state, JSON_COMPACT);
  ssize_t sret;
  struct ExternalReducerCls *red_cls = GNUNET_new (struct ExternalReducerCls);

  if (NULL == arguments)
    arg_str = GNUNET_strdup ("{}");
  else
    arg_str = json_dumps (arguments, JSON_COMPACT);

  red_cls->action_cb = cb;
  red_cls->action_cb_cls = cb_cls;

  GNUNET_assert (NULL != (red_cls->reducer_stdin = GNUNET_DISK_pipe (
                            GNUNET_DISK_PF_NONE)));
  GNUNET_assert (NULL != (red_cls->reducer_stdout = GNUNET_DISK_pipe (
                            GNUNET_DISK_PF_NONE)));

  /* By the time we're here, this variable should be unset, because
     otherwise using anastasis-reducer as the external reducer
     will lead to infinite recursion. */
  GNUNET_assert (NULL == getenv ("ANASTASIS_EXTERNAL_REDUCER"));

  GNUNET_log (GNUNET_ERROR_TYPE_INFO,
              "Starting external reducer with action '%s' and argument '%s'\n",
              action,
              arg_str);

  red_cls->reducer_process = GNUNET_OS_start_process (GNUNET_OS_INHERIT_STD_ERR,
                                                      red_cls->reducer_stdin,
                                                      red_cls->reducer_stdout,
                                                      NULL,
                                                      ext_reducer,
                                                      ext_reducer,
                                                      "-a",
                                                      arg_str,
                                                      action,
                                                      NULL);

  GNUNET_free (arg_str);

  if (NULL == red_cls->reducer_process)
  {
    GNUNET_break (0);
    GNUNET_free (state_str);
    cleanup_external_reducer (red_cls);
    return NULL;
  }

  /* Close pipe ends we don't use. */
  GNUNET_assert (GNUNET_OK ==
                 GNUNET_DISK_pipe_close_end (red_cls->reducer_stdin,
                                             GNUNET_DISK_PIPE_END_READ));
  GNUNET_assert (GNUNET_OK ==
                 GNUNET_DISK_pipe_close_end (red_cls->reducer_stdout,
                                             GNUNET_DISK_PIPE_END_WRITE));

  sret = GNUNET_DISK_file_write_blocking (GNUNET_DISK_pipe_handle (
                                            red_cls->reducer_stdin,
                                            GNUNET_DISK_PIPE_END_WRITE),
                                          state_str,
                                          strlen (state_str));
  GNUNET_free (state_str);
  if (sret <= 0)
  {
    GNUNET_break (0);
    cleanup_external_reducer (red_cls);
    return NULL;
  }

  GNUNET_assert (GNUNET_OK ==
                 GNUNET_DISK_pipe_close_end (red_cls->reducer_stdin,
                                             GNUNET_DISK_PIPE_END_WRITE));

  red_cls->read_task = GNUNET_SCHEDULER_add_read_file (
    GNUNET_TIME_UNIT_FOREVER_REL,
    GNUNET_DISK_pipe_handle (
      red_cls->reducer_stdout,
      GNUNET_DISK_PIPE_END_READ),
    external_reducer_read_cb,
    red_cls);

  {
    struct ANASTASIS_ReduxAction *ra = GNUNET_new (struct
                                                   ANASTASIS_ReduxAction);
    ra->cleanup_cls = red_cls;
    ra->cleanup = cleanup_external_reducer;
    return ra;
  }
}


struct ANASTASIS_ReduxAction *
ANASTASIS_redux_action (const json_t *state,
                        const char *action,
                        const json_t *arguments,
                        ANASTASIS_ActionCallback cb,
                        void *cb_cls)
{
  struct Dispatcher
  {
    enum ANASTASIS_GenericState redux_state;
    const char *redux_action;
    DispatchHandler fun;
  } dispatchers[] = {
    {
      ANASTASIS_GENERIC_STATE_CONTINENT_SELECTING,
      "select_continent",
      &select_continent
    },
    /* Deprecated alias for "back" from that state, should be removed eventually. */
    {
      ANASTASIS_GENERIC_STATE_COUNTRY_SELECTING,
      "unselect_continent",
      &unselect_continent
    },
    {
      ANASTASIS_GENERIC_STATE_COUNTRY_SELECTING,
      "back",
      &unselect_continent
    },
    {
      ANASTASIS_GENERIC_STATE_COUNTRY_SELECTING,
      "select_country",
      &select_country
    },
    {
      ANASTASIS_GENERIC_STATE_COUNTRY_SELECTING,
      "select_continent",
      &select_continent
    },
    {
      ANASTASIS_GENERIC_STATE_USER_ATTRIBUTES_COLLECTING,
      "enter_user_attributes",
      &enter_user_attributes
    },
    {
      ANASTASIS_GENERIC_STATE_USER_ATTRIBUTES_COLLECTING,
      "add_provider",
      &add_provider
    },
    {
      ANASTASIS_GENERIC_STATE_USER_ATTRIBUTES_COLLECTING,
      "back",
      &ANASTASIS_back_generic_decrement_
    },
    { ANASTASIS_GENERIC_STATE_INVALID, NULL, NULL }
  };
  bool recovery_mode = false;
  const char *s = json_string_value (json_object_get (state,
                                                      "backup_state"));
  enum ANASTASIS_GenericState gs;

  /* If requested, handle action with external reducer, used for testing. */
  {
    const char *ext_reducer = ANASTASIS_REDUX_probe_external_reducer ();
    if (NULL != ext_reducer)
      return redux_action_external (ext_reducer,
                                    state,
                                    action,
                                    arguments,
                                    cb,
                                    cb_cls);
  }

  if (NULL == s)
  {
    s = json_string_value (json_object_get (state,
                                            "recovery_state"));
    if (NULL == s)
    {
      GNUNET_break_op (0);
      cb (cb_cls,
          TALER_EC_ANASTASIS_REDUCER_STATE_INVALID,
          NULL);
      return NULL;
    }
    recovery_mode = true;
  }
  gs = ANASTASIS_generic_state_from_string_ (s);
  {
    json_t *new_state;
    struct ANASTASIS_ReduxAction *ret;

    new_state = json_deep_copy (state);
    GNUNET_assert (NULL != new_state);
    if (gs != ANASTASIS_GENERIC_STATE_INVALID)
    {
      for (unsigned int i = 0; NULL != dispatchers[i].fun; i++)
      {
        if ( (gs == dispatchers[i].redux_state) &&
             (0 == strcmp (action,
                           dispatchers[i].redux_action)) )
        {
          ret = dispatchers[i].fun (new_state,
                                    arguments,
                                    cb,
                                    cb_cls);
          json_decref (new_state);
          return ret;
        }
      }
    }
    if (recovery_mode)
    {
      ret = ANASTASIS_recovery_action_ (new_state,
                                        action,
                                        arguments,
                                        cb,
                                        cb_cls);
    }
    else
    {
      ret = ANASTASIS_backup_action_ (new_state,
                                      action,
                                      arguments,
                                      cb,
                                      cb_cls);
    }
    json_decref (new_state);
    return ret;
  }
}


void
ANASTASIS_redux_action_cancel (struct ANASTASIS_ReduxAction *ra)
{
  ra->cleanup (ra->cleanup_cls);
}


json_t *
ANASTASIS_REDUX_load_continents_ ()
{
  const json_t *countries;
  json_t *continents;
  const json_t *redux_countries = ANASTASIS_redux_countries_init_ ();

  if (NULL == redux_countries)
  {
    GNUNET_break (0);
    return NULL;
  }
  countries = json_object_get (redux_countries,
                               "countries");
  if (NULL == countries)
  {
    GNUNET_break (0);
    return NULL;
  }
  continents = json_array ();
  GNUNET_assert (NULL != continents);

  {
    json_t *country;
    size_t index;

    json_array_foreach (countries, index, country)
    {
      json_t *ex = NULL;
      const json_t *continent;

      continent = json_object_get (country,
                                   "continent");
      if ( (NULL == continent) ||
           (! json_is_string (continent)) )
      {
        GNUNET_break (0);
        continue;
      }
      {
        size_t inner_index;
        json_t *inner_continent;

        json_array_foreach (continents, inner_index, inner_continent)
        {
          const json_t *name;

          name = json_object_get (inner_continent,
                                  "name");
          if (1 == json_equal (continent,
                               name))
          {
            ex = inner_continent;
            break;
          }
        }
      }
      if (NULL == ex)
      {
        ex = GNUNET_JSON_PACK (
          GNUNET_JSON_pack_string ("name",
                                   json_string_value (continent)));
        GNUNET_assert (0 ==
                       json_array_append_new (continents,
                                              ex));
      }

      {
        json_t *i18n_continent;
        json_t *name_ex;

        i18n_continent = json_object_get (country,
                                          "continent_i18n");
        name_ex = json_object_get (ex,
                                   "name_i18n");
        if (NULL != i18n_continent)
        {
          const char *lang;
          json_t *trans;

          json_object_foreach (i18n_continent, lang, trans)
          {
            if (NULL == name_ex)
            {
              name_ex = json_object ();
              GNUNET_assert (NULL != name_ex);
              GNUNET_assert (0 ==
                             json_object_set_new (ex,
                                                  "name_i18n",
                                                  name_ex));
            }
            if (NULL == json_object_get (name_ex,
                                         lang))
            {
              GNUNET_assert (0 ==
                             json_object_set (name_ex,
                                              lang,
                                              trans));
            }
          }
        }
      }
    }
  }
  return GNUNET_JSON_PACK (
    GNUNET_JSON_pack_array_steal ("continents",
                                  continents));
}
