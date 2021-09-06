/*
  This file is part of Anastasis
  Copyright (C) 2019 Anastasis SARL

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
 * @file include/anastasis_authorization_plugin.h
 * @brief authorization access for Anastasis
 * @author Christian Grothoff
 */
#ifndef ANASTASIS_AUTHORIZATION_PLUGIN_H
#define ANASTASIS_AUTHORIZATION_PLUGIN_H

#include "anastasis_service.h"
#include <taler/taler_util.h>


/**
 * Plugin-specific state for an authorization operation.
 */
struct ANASTASIS_AUTHORIZATION_State;


/**
 * Enumeration values indicating the various possible
 * outcomes of the plugin's `process` function.
 */
enum ANASTASIS_AUTHORIZATION_Result
{
  /**
   * We successfully sent the authorization challenge
   * and queued a reply to MHD.
   */
  ANASTASIS_AUTHORIZATION_RES_SUCCESS = 0,

  /**
   * We failed to transmit the authorization challenge,
   * but successfully queued a failure response to MHD.
   */
  ANASTASIS_AUTHORIZATION_RES_FAILED = 1,

  /**
   * The plugin suspended the MHD connection as it needs some more
   * time to do its (asynchronous) work before we can proceed. The
   * plugin will resume the MHD connection when its work is done, and
   * then the `process` function should be called again.
   */
  ANASTASIS_AUTHORIZATION_RES_SUSPENDED = 2,

  /**
   * The plugin tried to queue a reply on the MHD connection and
   * failed to do so.  We should return #MHD_NO to MHD to cause the
   * HTTP connection to be closed without any reply.
   *
   * However, we were successful at transmitting the challenge,
   * so the challenge should be marked as sent.
   */
  ANASTASIS_AUTHORIZATION_RES_SUCCESS_REPLY_FAILED = 4,

  /**
   * The plugin tried to queue a reply on the MHD connection and
   * failed to do so.  We should return #MHD_NO to MHD to cause the
   * HTTP connection to be closed without any reply.
   *
   * Additionally, we failed to transmit the challenge.
   */
  ANASTASIS_AUTHORIZATION_RES_FAILED_REPLY_FAILED = 5,

  /**
   * The authentication process completed successfully
   * and we should signal success to the client by
   * returning the truth.
   */
  ANASTASIS_AUTHORIZATION_RES_FINISHED = 6
};


/**
 * Argument passed to the "init" function of each
 * plugin.
 */
struct ANASTASIS_AuthorizationContext
{
  /**
   * Database handle.
   */
  struct ANASTASIS_DatabasePlugin *db;

  /**
   * Configuration to use.
   */
  const struct GNUNET_CONFIGURATION_Handle *cfg;
};


/**
 * Handle to interact with a authorization backend.
 */
struct ANASTASIS_AuthorizationPlugin
{

  /**
   * Closure for all callbacks.
   */
  void *cls;

  /**
   * Cost to GET the /truth using this method.  Set by the plugin's
   * loader, not by the plugin itself.
   */
  struct TALER_Amount cost;

  /**
   * True if the payment is managed internally by the
   * authorization plugin.
   */
  bool payment_plugin_managed;

  /**
   * How often are retries allowed for challenges created
   * by this plugin?
   */
  uint32_t retry_counter;

  /**
   * How long should a generated challenge be valid for this type of method.
   */
  struct GNUNET_TIME_Relative code_validity_period;

  /**
   * How long before we should rotate a challenge for this type of method.
   */
  struct GNUNET_TIME_Relative code_rotation_period;

  /**
   * How long before we should retransmit a code.
   */
  struct GNUNET_TIME_Relative code_retransmission_frequency;

  /**
   * Validate @a data is a well-formed input into the challenge method,
   * i.e. @a data is a well-formed phone number for sending an SMS, or
   * a well-formed e-mail address for sending an e-mail. Not expected to
   * check that the phone number or e-mail account actually exists.
   *
   * To be possibly used before issuing a 402 payment required to the client.
   *
   * @param cls closure
   * @param connection HTTP client request (for queuing response)
   * @param truth_mime mime type of @e data
   * @param data input to validate (i.e. is it a valid phone number, etc.)
   * @param data_length number of bytes in @a data
   * @return #GNUNET_OK if @a data is valid,
   *         #GNUNET_NO if @a data is invalid and a reply was successfully queued on @a connection
   *         #GNUNET_SYSERR if @a data invalid but we failed to queue a reply on @a connection
   */
  enum GNUNET_GenericReturnValue
  (*validate)(void *cls,
              struct MHD_Connection *connection,
              const char *truth_mime,
              const char *data,
              size_t data_length);


  /**
   * Begin issuing authentication challenge to user based on @a data.
   * I.e. start to send SMS or e-mail or launch video identification,
   * or at least setup our authorization state (actual processing
   * may also be startedin the @e process function).
   *
   * @param cls closure
   * @param trigger function to call when we made progress
   * @param trigger_cls closure for @a trigger
   * @param truth_public_key Identifier of the challenge, to be (if possible) included in the
   *             interaction with the user
   * @param code secret code that the user has to provide back to satisfy the challenge in
   *             the main anastasis protocol
   * @param auth_command authentication command which is executed
   * @param data input to validate (i.e. is it a valid phone number, etc.)
   * @return state to track progress on the authorization operation, NULL on failure
   */
  struct ANASTASIS_AUTHORIZATION_State *
  (*start)(void *cls,
           GNUNET_SCHEDULER_TaskCallback trigger,
           void *trigger_cls,
           const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_public_key,
           uint64_t code,
           const void *data,
           size_t data_length);


  /**
   * Continue issuing authentication challenge to user based on @a data.
   * I.e. check if the transmission of the challenge via SMS or e-mail
   * has completed and/or manipulate @a connection to redirect the client
   * to a video identification site.
   *
   * @param as authorization state
   * @param timeout how long do we have to produce a reply
   * @param connection HTTP client request (for queuing response, such as redirection to video portal)
   * @return state of the request
   */
  enum ANASTASIS_AUTHORIZATION_Result
  (*process)(struct ANASTASIS_AUTHORIZATION_State *as,
             struct GNUNET_TIME_Absolute timeout,
             struct MHD_Connection *connection);


  /**
   * Free internal state associated with @a as.
   *
   * @param as state to clean up
   */
  void
  (*cleanup)(struct ANASTASIS_AUTHORIZATION_State *as);

};
#endif
