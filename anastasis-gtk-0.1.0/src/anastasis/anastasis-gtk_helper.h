/*
     This file is part of anastasis-gtk.
     Copyright (C) 2020 Anastasis SARL

     Anastasis is free software; you can redistribute it and/or modify
     it under the terms of the GNU General Public License as published
     by the Free Software Foundation; either version 3, or (at your
     option) any later version.

     Anastasis is distributed in the hope that it will be useful, but
     WITHOUT ANY WARRANTY; without even the implied warranty of
     MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
     General Public License for more details.

     You should have received a copy of the GNU General Public License
     along with Anastasis; see the file COPYING.  If not, write to the
     Free Software Foundation, Inc., 51 Franklin Street, Fifth Floor,
     Boston, MA 02110-1301, USA.
*/

/**
 * @file src/include/anastasis-gtk_helper.h
 * @brief Definition of helpers.
 * @author Christian Grothoff
 * @author Dennis Neufeld
 */
#ifndef ANASTASIS_GTK_HELPER_H
#define ANASTASIS_GTK_HELPER_H
#include <gnunet-gtk/gnunet_gtk.h>
#include <gtk/gtk.h>
#include <anastasis/anastasis_service.h>
#include <anastasis/anastasis_redux.h>
#include "anastasis-gtk.h"


/**
 * true if we are currently showing an error message.
 */
extern bool AG_have_error;


/**
 * Columns of the continent_liststore.
 */
enum AG_ContinentsModelColumns
{
  /**
   * A gchararray.
   */
  AG_CMC_CONTINENT_NAME = 0,

  /**
   * A gchararray.
   */
  AG_CMC_CONTINENT_NAME_I18N = 1
};


/**
 * Columns of the currency_liststore.
 */
enum AG_CurrencyModelColumns
{
  /**
   * A gchararray.
   */
  AG_CMC_CURRENCY_NAME = 0
};


/**
 * Columns of the challenge_status_liststore.
 */
enum AG_ChallengeStatusModelColumns
{
  /**
   * A guint.
   */
  AG_CSM_CHALLENGE_OFFSET = 0,

  /**
   * A gchararray.
   */
  AG_CSM_CHALLENGE_UUID = 1,

  /**
   * A gboolean
   */
  AG_CSM_SOLVED = 2,

  /**
   * A gchararray.
   */
  AG_CSM_STATUS = 3,

  /**
   * A GdkPixBuf.
   */
  AG_CSM_PAYMENT_QR_CODE = 4,

  /**
   * A gchararray.
   */
  AG_CSM_ERROR_MESSAGE = 5,

  /**
    * A gchararray.
    */
  AG_CSM_PAYTO_URI = 6,

  /**
   * A gboolean.
   */
  AG_CSM_PAYING = 7,

  /**
   * A gboolean.
   */
  AG_CSM_HAS_ERROR = 8,

  /**
   * A gchararray.
   */
  AG_CSM_COST = 9,

  /**
   * A gchararray.
   */
  AG_CSM_REDIRECT_URL = 10,

  /**
   * A gboolean.
   */
  AG_CSM_HAVE_REDIRECT = 11,

  /**
   * A gboolean
   */
  AG_CSM_NOT_SOLVED = 12,

  /**
   * A gchararray
   */
  AG_CSM_TYPE = 13,

  /**
   * A gchararray
   */
  AG_CSM_INSTRUCTIONS = 14,

  /**
   * A gchararray
   */
  AG_CSM_PROVIDER_URL = 15

};


/**
 * Columns of the provider_liststore.
 */
enum AG_ProviderModelColumns
{
  /**
   * A gchararray.
   */
  AG_PMC_PROVIDER_URL = 0,

  /**
   * A gchararray.
   */
  AG_PMC_PROVIDER_STATUS = 1,

  /**
   * A gchararray.
   */
  AG_PMC_PROVIDER_STATUS_COLOR = 2
};


/**
 * Columns of the backup_provider_liststore.
 */
enum AG_BackupProviderColumns
{
  /**
   * A gchararray.
   */
  AG_BPC_PROVIDER_URL = 0,

  /**
   * A guint64
   */
  AG_BPC_BACKUP_VERSION = 1,

  /**
   * A gchararray. // FIXME: #6823
   */
  AG_BPC_EXPIRATION_TIME_STR = 2,

  /**
   * A gboolean.
   */
  AG_BPC_SUCCESS_FLAG = 3

};

/**
 * Columns of the country_liststore.
 */
enum AG_CountryCodeModelColumns
{
  /**
   * A gchararray.
   */
  AG_CCMC_COUNTRY_NAME = 0,

  /**
   * A gchararray.
   */
  AG_CCMC_COUNTRY_CODE = 1

};

/**
 * Columns of the authentication_methods_liststore.
 */
enum AG_AuthenticationMethodsModelColumns
{
  /**
   * A gchararray.
   */
  AG_AMMC_TYPE = 0,

  /**
   * A gchararray.
   */
  AG_AMMC_VISUALIZATION = 1,

  /**
   * A guint.
   */
  AG_AMMC_INDEX = 2
};


/**
 * Columns of the unpaid_qrcodes_liststore.
 */
enum AG_UnpaidQrcodesModelColumns
{
  /**
   * A GdkPixbuf.
   */
  AG_UQRMC_QR_IMAGE = 0,

  /**
   * A gchararray.
   */
  AG_UQRMC_URL = 1,

  /**
   * A gchararray.
   */
  AG_UQRMC_PROVIDER = 2
};


/**
 * Columns of the policy_review_treestore.
 */
enum AG_PolicyReviewModelColumns
{
  /**
   * A gchararray.
   */
  AG_PRMC_POLICY_NAME = 0,

  /**
   * A gchararray.
   */
  AG_PRMC_METHOD_TYPE = 1,

  /**
   * A gchararray.
   */
  AG_PRMC_COST = 2,

  /**
   * A gchararray.
   */
  AG_PRMC_PROVIDER_URL = 3,

  /**
   * A gchararray.
   */
  AG_PRMC_EXPIRATION_TIME_STR = 4,

  /**
   * A guint.
   */
  AG_PRMC_POLICY_INDEX = 5,

  /**
   * A gboolean. True on lines representing challenges.
   */
  AG_PRMC_IS_CHALLENGE = 6,

  /**
   * A guint.
   */
  AG_PRMC_METHOD_INDEX = 7,

  /**
   * A gboolean. True on lines representing solved challenges.
   */
  AG_PRMC_WAS_SOLVED

};


/**
 * Columns in the progress model liststores.
 */
enum AG_ProgressModelColumns
{
  /**
   * A gchararray.
   */
  AG_PRGMC_DESCRIPTION = 0,

  /**
   * A gchararray.
   */
  AG_PRGMC_REGEX = 1,

  /**
   * A gchararray.
   */
  AG_PRGMC_TOOLTIP = 2
};


/**
 * Hide widget of the given @a name of the main window
 *
 * @param name widget to hide
 */
void
AG_hide (const char *name);


/**
 * Show widget of the given @a name of the main window
 *
 * @param name widget to show
 */
void
AG_show (const char *name);


/**
 * Make widget of the given @a name of the main window insensitive.
 *
 * @param name widget to make insensitive
 */
void
AG_insensitive (const char *name);


/**
 * Make widget of the given @a name of the main window sensitive.
 *
 * @param name widget to make sensitive
 */
void
AG_sensitive (const char *name);


/**
 * Make widget of the given @a name the focus.
 *
 * @param name widget to focus
 */
void
AG_focus (const char *name);


/**
 * Thaw the user interface.
 */
void
AG_thaw (void);


/**
 * Freeze the user interface while the action completes.
 */
void
AG_freeze (void);


/**
 * Hide all of the children of the container widget @a name in the main window.
 *
 * @param name name of the object
 */
void
AG_hide_children (const char *name);


/**
 * Make all of the children of the container widget @a name in the main window
 * insensitive.
 *
 * @param name name of the object
 */
void
AG_insensitive_children (const char *name);


/**
 * Show all of the children of the container widget @a name in the main window.
 *
 * @param name name of the object
 */
void
AG_show_children (const char *name);


/**
 * Get an object from the main window.
 *
 * @param name name of the object
 * @return NULL on error
 */
GObject *
GCG_get_main_window_object (const char *name);


/**
 * Checks the actual state. True, if state is correct, else false.
 *
 * @param state the state to check
 * @param expected_state the expected state as string
 * @return bool
 */
bool
AG_check_state (json_t *state,
                const char *expected_state);


/**
 * Hides all frames;
 */
void
AG_hide_all_frames (void);


/**
 * Show error message.
 *
 * @param format format string
 * @param ... arguments for format string
 */
void
AG_error (const char *format,
          ...)
__attribute__ ((format (printf, 1, 2)));


/**
 * Stop showing error message.
 */
void
AG_error_clear (void);


#endif
