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
 * @file testing/test_anastasis_api.c
 * @brief testcase to test anastasis' HTTP API interface
 * @author Christian Grothoff
 * @author Dennis Neufeld
 * @author Dominik Meister
 */
#include "platform.h"
#include "anastasis_testing_lib.h"
#include <taler/taler_merchant_testing_lib.h>


/**
 * Configuration file we use.  One (big) configuration is used
 * for the various components for this test.
 */
#define CONFIG_FILE "test_anastasis_api.conf"

/**
 * Exchange base URL.  Could also be taken from config.
 */
#define EXCHANGE_URL "http://localhost:8081/"

/**
 * Account number of the exchange at the bank.
 */
#define EXCHANGE_ACCOUNT_NAME "2"

/**
 * Account number of some user.
 */
#define USER_ACCOUNT_NAME "62"

/**
 * Account number used by the merchant
 */
#define MERCHANT_ACCOUNT_NAME "3"

/**
 * Configuration of the bank.
 */
static struct TALER_TESTING_BankConfiguration bc;

/**
 * Configuration of the exchange.
 */
static struct TALER_TESTING_ExchangeConfiguration ec;

/**
 * Payto URI of the customer (payer).
 */
static char *payer_payto;

/**
 * Payto URI of the exchange (escrow account).
 */
static char *exchange_payto;

/**
 * Payto URI of the merchant (receiver).
 */
static char *merchant_payto;

/**
 * Merchant base URL.
 */
static char *merchant_url;

/**
 * Anastasis base URL.
 */
static char *anastasis_url;

/**
 * Merchant process.
 */
static struct GNUNET_OS_Process *merchantd;

/**
 * Anastasis process.
 */
static struct GNUNET_OS_Process *anastasisd;

/**
 * Name of the file for exchanging the secret.
 */
static char *file_secret;

/**
 * Execute the taler-exchange-wirewatch command with our configuration
 * file.
 *
 * @param label label to use for the command.
 */
static struct TALER_TESTING_Command
cmd_exec_wirewatch (char *label)
{
  return TALER_TESTING_cmd_exec_wirewatch (label,
                                           CONFIG_FILE);
}


/**
 * Run wire transfer of funds from some user's account to the
 * exchange.
 *
 * @param label label to use for the command.
 * @param amount amount to transfer, i.e. "EUR:1"
 * @param url exchange_url
 */
static struct TALER_TESTING_Command
cmd_transfer_to_exchange (const char *label,
                          const char *amount)
{
  return TALER_TESTING_cmd_admin_add_incoming (label,
                                               amount,
                                               &bc.exchange_auth,
                                               payer_payto);
}


/**
 * Main function that will tell the interpreter what commands to run.
 *
 * @param cls closure
 */
static void
run (void *cls,
     struct TALER_TESTING_Interpreter *is)
{
  struct TALER_TESTING_Command withdraw[] = {
    cmd_transfer_to_exchange ("create-reserve-1",
                              "EUR:10.02"),
    cmd_exec_wirewatch ("wirewatch-1"),
    TALER_TESTING_cmd_withdraw_amount ("withdraw-coin-1",
                                       "create-reserve-1",
                                       "EUR:5",
                                       MHD_HTTP_OK),
    TALER_TESTING_cmd_withdraw_amount ("withdraw-coin-2",
                                       "create-reserve-1",
                                       "EUR:5",
                                       MHD_HTTP_OK),
    TALER_TESTING_cmd_status ("withdraw-status-1",
                              "create-reserve-1",
                              "EUR:0",
                              MHD_HTTP_OK),
    TALER_TESTING_cmd_end ()
  };

  struct TALER_TESTING_Command policy[] = {
    ANASTASIS_TESTING_cmd_policy_store ("policy-store-1",
                                        anastasis_url,
                                        NULL /* prev upload */,
                                        MHD_HTTP_PAYMENT_REQUIRED,
                                        ANASTASIS_TESTING_PSO_NONE,
                                        "Test-1",
                                        strlen ("Test-1")),
    /* what would we have to pay? */
    TALER_TESTING_cmd_merchant_claim_order ("fetch-proposal",
                                            merchant_url,
                                            MHD_HTTP_OK,
                                            "policy-store-1",
                                            NULL),
    /* make the payment */
    TALER_TESTING_cmd_merchant_pay_order ("pay-account",
                                          merchant_url,
                                          MHD_HTTP_OK,
                                          "fetch-proposal",
                                          "withdraw-coin-1",
                                          "EUR:5",
                                          "EUR:4.99", /* must match ANNUAL_FEE in config! */
                                          NULL),
    ANASTASIS_TESTING_cmd_policy_store ("policy-store-2",
                                        anastasis_url,
                                        "policy-store-1",
                                        MHD_HTTP_NO_CONTENT,
                                        ANASTASIS_TESTING_PSO_NONE,
                                        "Test-1",
                                        strlen ("Test-1")),
    ANASTASIS_TESTING_cmd_policy_lookup ("policy-lookup-1",
                                         anastasis_url,
                                         MHD_HTTP_OK,
                                         "policy-store-2"),
    TALER_TESTING_cmd_end ()
  };

  struct TALER_TESTING_Command truth[] = {
    ANASTASIS_TESTING_cmd_truth_question (
      "truth-store-1",
      anastasis_url,
      NULL,
      "The-Answer",
      ANASTASIS_TESTING_TSO_NONE,
      MHD_HTTP_NO_CONTENT),
    ANASTASIS_TESTING_cmd_keyshare_lookup (
      "keyshare-lookup-1",
      anastasis_url,
      "The-Answer",
      NULL, /* payment ref */
      "truth-store-1",
      0,
      ANASTASIS_KSD_SUCCESS),
    ANASTASIS_TESTING_cmd_truth_store (
      "truth-store-2",
      anastasis_url,
      NULL,
      "file",
      "text/plain",
      strlen (file_secret),
      file_secret,
      ANASTASIS_TESTING_TSO_NONE,
      MHD_HTTP_NO_CONTENT),
    ANASTASIS_TESTING_cmd_keyshare_lookup (
      "challenge-fail-1",
      anastasis_url,
      "Wrong-Answer",
      NULL,
      "truth-store-1",
      0,
      ANASTASIS_KSD_INVALID_ANSWER),
    ANASTASIS_TESTING_cmd_keyshare_lookup (
      "file-challenge-run-1",
      anastasis_url,
      NULL, /* no answer */
      NULL, /* payment ref */
      "truth-store-2", /* upload ref */
      0,
      ANASTASIS_KSD_PAYMENT_REQUIRED),
    /* what would we have to pay? */
    TALER_TESTING_cmd_merchant_claim_order ("fetch-proposal-2",
                                            merchant_url,
                                            MHD_HTTP_OK,
                                            "file-challenge-run-1",
                                            NULL),
    /* make the payment */
    TALER_TESTING_cmd_merchant_pay_order ("pay-account-2",
                                          merchant_url,
                                          MHD_HTTP_OK,
                                          "fetch-proposal-2",
                                          "withdraw-coin-2",
                                          "EUR:1.01",
                                          "EUR:1",
                                          NULL),

    ANASTASIS_TESTING_cmd_keyshare_lookup (
      "file-challenge-run-2",
      anastasis_url,
      NULL, /* no answer */
      "file-challenge-run-1", /* payment ref */
      "truth-store-2",
      0,
      ANASTASIS_KSD_INVALID_ANSWER),
    ANASTASIS_TESTING_cmd_keyshare_lookup (
      "file-challenge-run-3",
      anastasis_url,
      "file-challenge-run-2", /* answer */
      "file-challenge-run-1", /* payment ref */
      "truth-store-2",
      1,
      ANASTASIS_KSD_SUCCESS),
    TALER_TESTING_cmd_end ()
  };

  struct TALER_TESTING_Command commands[] = {
    /* general setup */
    TALER_TESTING_cmd_auditor_add ("add-auditor-OK",
                                   MHD_HTTP_NO_CONTENT,
                                   false),
    TALER_TESTING_cmd_wire_add ("add-wire-account",
                                "payto://x-taler-bank/localhost/2",
                                MHD_HTTP_NO_CONTENT,
                                false),
    TALER_TESTING_cmd_exec_offline_sign_keys ("offline-sign-future-keys",
                                              CONFIG_FILE),
    TALER_TESTING_cmd_exec_offline_sign_fees ("offline-sign-fees",
                                              CONFIG_FILE,
                                              "EUR:0.01",
                                              "EUR:0.01"),
    TALER_TESTING_cmd_check_keys_pull_all_keys ("refetch /keys",
                                                1),
    TALER_TESTING_cmd_merchant_post_instances ("instance-create-default",
                                               merchant_url,
                                               "default",
                                               merchant_payto,
                                               "EUR",
                                               MHD_HTTP_NO_CONTENT),
    ANASTASIS_TESTING_cmd_config ("salt-request-1",
                                  anastasis_url,
                                  MHD_HTTP_OK),
    TALER_TESTING_cmd_batch ("withdraw",
                             withdraw),
    TALER_TESTING_cmd_batch ("policy",
                             policy),
    TALER_TESTING_cmd_batch ("truth",
                             truth),
    TALER_TESTING_cmd_end ()
  };

  TALER_TESTING_run_with_fakebank (is,
                                   commands,
                                   bc.exchange_auth.wire_gateway_url);
}


int
main (int argc,
      char *const *argv)
{
  int ret;

  /* These environment variables get in the way... */
  unsetenv ("XDG_DATA_HOME");
  unsetenv ("XDG_CONFIG_HOME");
  GNUNET_log_setup ("test-anastasis-api",
                    "DEBUG",
                    NULL);
  if (GNUNET_OK !=
      TALER_TESTING_prepare_fakebank (CONFIG_FILE,
                                      "exchange-account-exchange",
                                      &bc))
    return 77;
  {
    char dir[] = "/tmp/test-anastasis-file-XXXXXX";

    if (NULL == mkdtemp (dir))
    {
      GNUNET_log_strerror_file (GNUNET_ERROR_TYPE_ERROR,
                                "mkdtemp",
                                dir);
      return 77;
    }
    GNUNET_asprintf (&file_secret,
                     "%s/.secret",
                     dir);
  }
  payer_payto = ("payto://x-taler-bank/localhost/" USER_ACCOUNT_NAME);
  exchange_payto = ("payto://x-taler-bank/localhost/" EXCHANGE_ACCOUNT_NAME);
  merchant_payto = ("payto://x-taler-bank/localhost/" MERCHANT_ACCOUNT_NAME);
  if (NULL ==
      (merchant_url = TALER_TESTING_prepare_merchant (CONFIG_FILE)))
    return 77;
  TALER_TESTING_cleanup_files (CONFIG_FILE);

  if (NULL ==
      (anastasis_url = ANASTASIS_TESTING_prepare_anastasis (CONFIG_FILE)))
    return 77;
  TALER_TESTING_cleanup_files (CONFIG_FILE);

  switch (TALER_TESTING_prepare_exchange (CONFIG_FILE,
                                          GNUNET_YES,
                                          &ec))
  {
  case GNUNET_SYSERR:
    GNUNET_break (0);
    return 1;
  case GNUNET_NO:
    return 77;
  case GNUNET_OK:
    if (NULL == (merchantd =
                   TALER_TESTING_run_merchant (CONFIG_FILE,
                                               merchant_url)))
    {
      GNUNET_break (0);
      return 1;
    }
    if (NULL == (anastasisd =
                   ANASTASIS_TESTING_run_anastasis (CONFIG_FILE,
                                                    anastasis_url)))
    {
      GNUNET_break (0);
      GNUNET_OS_process_kill (merchantd,
                              SIGTERM);
      GNUNET_OS_process_wait (merchantd);
      GNUNET_OS_process_destroy (merchantd);
      return 1;
    }
    ret = TALER_TESTING_setup_with_exchange (&run,
                                             NULL,
                                             CONFIG_FILE);
    GNUNET_OS_process_kill (merchantd,
                            SIGTERM);
    GNUNET_OS_process_kill (anastasisd,
                            SIGTERM);
    GNUNET_OS_process_wait (merchantd);
    GNUNET_OS_process_wait (anastasisd);
    GNUNET_OS_process_destroy (merchantd);
    GNUNET_OS_process_destroy (anastasisd);
    GNUNET_free (merchant_url);
    GNUNET_free (anastasis_url);

    if (GNUNET_OK != ret)
    {
      GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                  "Test failed in interpreter\n");
      return 1;
    }
    break;
  default:
    GNUNET_break (0);
    return 1;
  }
  return 0;
}


/* end of test_anastasis_api.c */
