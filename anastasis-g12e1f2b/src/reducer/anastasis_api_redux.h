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
 * @file reducer/anastasis_api_redux.h
 * @brief anastasis reducer api, internal data structures
 * @author Christian Grothoff
 * @author Dominik Meister
 * @author Dennis Neufeld
 */
#ifndef ANASTASIS_API_REDUX_H
#define ANASTASIS_API_REDUX_H


#define ANASTASIS_GENERIC_STATES(REDUX_STATE) \
  REDUX_STATE (INVALID) \
  REDUX_STATE (CONTINENT_SELECTING)   \
  REDUX_STATE (COUNTRY_SELECTING)  \
  REDUX_STATE (USER_ATTRIBUTES_COLLECTING)

#define GENERATE_GENERIC_ENUM(ENUM) ANASTASIS_GENERIC_STATE_ ## ENUM,

enum ANASTASIS_GenericState
{
  ANASTASIS_GENERIC_STATES (GENERATE_GENERIC_ENUM)
};

#undef GENERATE_GENERIC_ENUM

#define ANASTASIS_BACKUP_STATES(REDUX_STATE) \
  ANASTASIS_GENERIC_STATES (REDUX_STATE) \
  REDUX_STATE (AUTHENTICATIONS_EDITING)  \
  REDUX_STATE (POLICIES_REVIEWING)   \
  REDUX_STATE (SECRET_EDITING) \
  REDUX_STATE (TRUTHS_PAYING) \
  REDUX_STATE (POLICIES_PAYING) \
  REDUX_STATE (BACKUP_FINISHED)

#define GENERATE_BACKUP_ENUM(ENUM) ANASTASIS_BACKUP_STATE_ ## ENUM,

enum ANASTASIS_BackupState
{
  ANASTASIS_BACKUP_STATES (GENERATE_BACKUP_ENUM)
};

#undef GENERATE_BACKUP_ENUM

#define ANASTASIS_RECOVERY_STATES(REDUX_STATE) \
  ANASTASIS_GENERIC_STATES (REDUX_STATE) \
  REDUX_STATE (SECRET_SELECTING)  \
  REDUX_STATE (CHALLENGE_SELECTING)  \
  REDUX_STATE (CHALLENGE_PAYING)   \
  REDUX_STATE (CHALLENGE_SOLVING)  \
  REDUX_STATE (RECOVERY_FINISHED)

#define GENERATE_RECOVERY_ENUM(ENUM) ANASTASIS_RECOVERY_STATE_ ## ENUM,

enum ANASTASIS_RecoveryState
{
  ANASTASIS_RECOVERY_STATES (GENERATE_RECOVERY_ENUM)
};

#undef GENERATE_RECOVERY_ENUM


/**
 * CURL context to be used by all operations.
 */
extern struct GNUNET_CURL_Context *ANASTASIS_REDUX_ctx_;


/**
 * Initialize reducer subsystem.
 *
 * @param ctx context to use for CURL requests.
 */
void
ANASTASIS_redux_init (struct GNUNET_CURL_Context *ctx);


/**
 * Terminate reducer subsystem.
 */
void
ANASTASIS_redux_done (void);


/**
 * Produce an initial state with an initialized list of
 * continents.
 *
 * @return list of continents
 */
json_t *
ANASTASIS_REDUX_load_continents_ (void);


/**
 * Returns the enum value to a string value of a state.
 *
 * @param state_string string to convert
 * @return ANASTASIS_GENERIC_STATE_ERROR on error
 */
enum ANASTASIS_GenericState
ANASTASIS_generic_state_from_string_ (const char *state_string);


/**
 * Returns the string value of a state.
 *
 * @param gs state value to convert
 * @return NULL on error
 */
const char *
ANASTASIS_generic_state_to_string_ (enum ANASTASIS_GenericState gs);


/**
 * Returns the enum value to a string value of a state.
 *
 * @param state_string string to convert
 * @return ANASTASIS_BACKUP_STATE_ERROR on error
 */
enum ANASTASIS_BackupState
ANASTASIS_backup_state_from_string_ (const char *state_string);


/**
 * Returns the string value of a state.
 *
 * @param bs state to convert to a string
 * @return NULL on error
 */
const char *
ANASTASIS_backup_state_to_string_ (enum ANASTASIS_BackupState bs);


/**
 * Returns the enum value to a string value of a state.
 *
 * @param state_string value to convert
 * @return ANASTASIS_RECOVERY_STATE_ERROR on error
 */
enum ANASTASIS_RecoveryState
ANASTASIS_recovery_state_from_string_ (const char *state_string);


/**
 * Returns the string value of a state.
 *
 * @param rs value to convert
 * @return NULL on error
 */
const char *
ANASTASIS_recovery_state_to_string_ (enum ANASTASIS_RecoveryState rs);


/**
 * Function to return a json error response.
 *
 * @param cb callback to give error to
 * @param cb_cls callback closure
 * @param ec error code
 * @param detail error detail
 */
void
ANASTASIS_redux_fail_ (ANASTASIS_ActionCallback cb,
                       void *cb_cls,
                       enum TALER_ErrorCode ec,
                       const char *detail);


/**
 * DispatchHandler/Callback function which is called for a
 * "add_provider" action.  Adds another Anastasis provider
 * to the list of available providers for storing information.
 *
 * @param state state to operate on
 * @param arguments arguments with a provider URL to add
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 * @return true if @a cb was invoked
 */
bool
ANASTASIS_add_provider_ (json_t *state,
                         const json_t *arguments,
                         ANASTASIS_ActionCallback cb,
                         void *cb_cls);


/**
 * Adds the server configuration of the Anastasis provider
 * at @a url to the json @a state.  Checks if we have
 * the provider information already available. If so,
 * imports it into @a state. If not, queries the provider,
 * generating a success or failure outcome asynchronously.
 *
 * @param url the provider's base URL to add
 * @param[in,out] state the json state to operate on
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 * @return handle to cancel asynchronous operation, NULL if
 *         we completed synchronously
 */
struct ANASTASIS_ReduxAction *
ANASTASIS_REDUX_add_provider_to_state_ (const char *url,
                                        json_t *state,
                                        ANASTASIS_ActionCallback cb,
                                        void *cb_cls);


/**
 * A generic DispatchHandler/Callback function which is called for a
 * "back" action.
 *
 * @param[in,out] state state to operate on
 * @param arguments arguments to use for operation on state
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure for @a cb
 * @return NULL (no asynchronous action)
 */
struct ANASTASIS_ReduxAction *
ANASTASIS_back_generic_decrement_ (json_t *state,
                                   const json_t *arguments,
                                   ANASTASIS_ActionCallback cb,
                                   void *cb_cls);


/**
 * Function to load json containing all countries.
 * Returns the countries.
 *
 * @return list of countries
 */
const json_t *
ANASTASIS_redux_countries_init_ (void);


/**
 * Operates on a recovery state. The new state is returned
 * by a callback function.
 * This function can do network access to talk to anastasis service providers.
 *
 * @param[in,out] state input/output state (to be modified)
 * @param action what action to perform
 * @param arguments data for the @a action
 * @param cb function to call with the result
 * @param cb_cls closure for @a cb
 */
struct ANASTASIS_ReduxAction *
ANASTASIS_recovery_action_ (json_t *state,
                            const char *action,
                            const json_t *arguments,
                            ANASTASIS_ActionCallback cb,
                            void *cb_cls);


/**
 * DispatchHandler/Callback function which is called for a
 * "enter_user_attributes" action after verifying that the
 * arguments provided were OK and the state transition was
 * initiated.  Begins the actual recovery logic.
 *
 * Returns an #ANASTASIS_ReduxAction.
 *
 * @param state state to operate on
 * @param arguments data for the operation
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure for @a cb
 * @return NULL
 */
struct ANASTASIS_ReduxAction *
ANASTASIS_REDUX_recovery_challenge_begin_ (json_t *state,
                                           const json_t *arguments,
                                           ANASTASIS_ActionCallback cb,
                                           void *cb_cls);


/**
 * DispatchHandler/Callback function which is called for a
 * "enter_user_attributes" action after verifying that the
 * arguments provided were OK and the state transition was
 * initiated.  Begins the actual backup logic.
 *
 * Returns a `struct ANASTASIS_ReduxAction`.
 *
 * @param state state to operate on
 * @param arguments data for the operation
 * @param cb callback to call during/after operation
 * @param cb_cls callback closure
 */
struct ANASTASIS_ReduxAction *
ANASTASIS_REDUX_backup_begin_ (json_t *state,
                               const json_t *arguments,
                               ANASTASIS_ActionCallback cb,
                               void *cb_cls);


/**
 * Operates on a backup state and returns the new state via a
 * callback function.
 * This function can do network access to talk to anastasis service providers.
 *
 * @param[in,out] state input/output state (to be modified)
 * @param action what action to perform
 * @param arguments data for the @a action
 * @param cb function to call with the result
 * @param cb_cls closure for @a cb
 */
struct ANASTASIS_ReduxAction *
ANASTASIS_backup_action_ (json_t *state,
                          const char *action,
                          const json_t *arguments,
                          ANASTASIS_ActionCallback cb,
                          void *cb_cls);


/**
 * Check if an external reducer binary is requested.
 * Cache the result and unset the corresponding environment
 * variable.
 *
 * @returns name of the external reducer or NULL to user internal reducer
 */
const char *
ANASTASIS_REDUX_probe_external_reducer (void);

/**
 * Generic container for an action with asynchronous activities.
 */
struct ANASTASIS_ReduxAction
{
  /**
   * Function to call to clean up.
   */
  void (*cleanup)(void *cls);

  /**
   * Action-specific state, closure for @e cleanup.
   */
  void *cleanup_cls;
};


#endif
