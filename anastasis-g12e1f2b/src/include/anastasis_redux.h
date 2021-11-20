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
 * @file include/anastasis_redux.h
 * @brief anastasis reducer api
 * @author Christian Grothoff
 * @author Dominik Meister
 * @author Dennis Neufeld
 */
#ifndef ANASTASIS_REDUX_H
#define ANASTASIS_REDUX_H

#include <jansson.h>
#include "anastasis.h"
#include <taler/taler_mhd_lib.h>
#include <regex.h>


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
 * Returns an initial ANASTASIS backup state.
 *
 * @return NULL on failure
 */
json_t *
ANASTASIS_backup_start (const struct GNUNET_CONFIGURATION_Handle *cfg);


/**
 * Returns an initial ANASTASIS recovery state.
 *
 * @return NULL on failure
 */
json_t *
ANASTASIS_recovery_start (const struct GNUNET_CONFIGURATION_Handle *cfg);


/**
 * Signature of the callback passed to #ANASTASIS_redux_action()
 *
 * @param cls closure
 * @param error error code, #TALER_EC_NONE if @a new_bs is the new successful state
 * @param new_state the new state of the operation (client should json_incref() to keep an alias)
 */
typedef void
(*ANASTASIS_ActionCallback)(void *cls,
                            enum TALER_ErrorCode error,
                            json_t *new_state);


/**
 * Handle to an ongoing action. Only valid until the #ANASTASIS_ActionCallback is invoked.
 */
struct ANASTASIS_ReduxAction;


/**
 * Operates on a state. The new state is returned by a callback
 * function.  This function can do network access to talk to Anastasis
 * service providers.
 *
 * @param state input state
 * @param action what action to perform
 * @param arguments data for the @a action
 * @param cb function to call with the result
 * @param cb_cls closure for @a cb
 * @return failure state or new state
 */
struct ANASTASIS_ReduxAction *
ANASTASIS_redux_action (const json_t *state,
                        const char *action,
                        const json_t *arguments,
                        ANASTASIS_ActionCallback cb,
                        void *cb_cls);


/**
 * Cancel ongoing redux action.
 *
 * @param ra action to cancel
 */
void
ANASTASIS_redux_action_cancel (struct ANASTASIS_ReduxAction *ra);


#endif  /* _ANASTASIS_REDUX_H */
