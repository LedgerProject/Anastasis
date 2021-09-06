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
 * @file include/anastasis_util_lib.h
 * @brief anastasis client api
 * @author Christian Grothoff
 * @author Dominik Meister
 * @author Dennis Neufeld
 */
#ifndef ANASTASIS_UTIL_LIB_H
#define ANASTASIS_UTIL_LIB_H

#include "anastasis_error_codes.h"
#define GNU_TALER_ERROR_CODES_H 1
#include <gnunet/gnunet_util_lib.h>
#include <taler/taler_util.h>


/**
 * Return default project data used by Anastasis.
 */
const struct GNUNET_OS_ProjectData *
ANASTASIS_project_data_default (void);


/**
 * Initialize libanastasisutil.
 */
void
ANASTASIS_OS_init (void);


/**
 * Handle for the child management
 */
struct ANASTASIS_ChildWaitHandle;

/**
 * Defines a ANASTASIS_ChildCompletedCallback which is sent back
 * upon death or completion of a child process. Used to trigger
 * authentication commands.
 *
 * @param cls handle for the callback
 * @param type type of the process
 * @param exit_code status code of the process
 *
*/
typedef void
(*ANASTASIS_ChildCompletedCallback)(void *cls,
                                    enum GNUNET_OS_ProcessStatusType type,
                                    long unsigned int exit_code);


/**
 * Starts the handling of the child processes.
 * Function checks the status of the child process and sends back a
 * ANASTASIS_ChildCompletedCallback upon completion/death of the child.
 *
 * @param proc child process which is monitored
 * @param cb reference to the callback which is called after completion
 * @param cb_cls closure for the callback
 * @return ANASTASIS_ChildWaitHandle is returned
 */
struct ANASTASIS_ChildWaitHandle *
ANASTASIS_wait_child (struct GNUNET_OS_Process *proc,
                      ANASTASIS_ChildCompletedCallback cb,
                      void *cb_cls);

/**
 * Stop waiting on this child.
 */
void
ANASTASIS_wait_child_cancel (struct ANASTASIS_ChildWaitHandle *cwh);


#endif
