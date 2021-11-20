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
 * @file testing/test_anastasis.c
 * @brief testcase to test anastasis
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
 * Name of the file for exchanging the secret.
 */
static char *file_secret;

/**
 * Merchant process.
 */
static struct GNUNET_OS_Process *merchantd;

/**
 * Anastasis process.
 */
static struct GNUNET_OS_Process *anastasisd;

/**
 * Identity to use for testing.
 */
static json_t *id_data;


/**
 * Execute the taler-exchange-wirewatch command with
 * our configuration file.
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
 * Main function that will tell the interpreter what commands to
 * run.
 *
 * @param cls closure
 */
static void
run (void *cls,
     struct TALER_TESTING_Interpreter *is)
{
  struct TALER_TESTING_Command pay[] = {
    /**
     * Move money to the exchange's bank account.
     */
    cmd_transfer_to_exchange ("create-reserve-1",
                              "EUR:10.02"),
    /**
     * Make a reserve exist, according to the previous
     * transfer.
     */
    cmd_exec_wirewatch ("wirewatch-1"),
    TALER_TESTING_cmd_withdraw_amount ("withdraw-coin-1",
                                       "create-reserve-1",
                                       "EUR:5",
                                       MHD_HTTP_OK),
    TALER_TESTING_cmd_withdraw_amount ("withdraw-coin-2",
                                       "create-reserve-1",
                                       "EUR:5",
                                       MHD_HTTP_OK),
    /**
     * Check the reserve is depleted.
     */
    TALER_TESTING_cmd_status ("withdraw-status-1",
                              "create-reserve-1",
                              "EUR:0",
                              MHD_HTTP_OK),
    TALER_TESTING_cmd_end ()
  };

  struct TALER_TESTING_Command anastasis[] = {
    ANASTASIS_TESTING_cmd_config ("salt-request-1",
                                  anastasis_url,
                                  MHD_HTTP_OK),
    ANASTASIS_TESTING_cmd_truth_upload_question ("truth-create-1",
                                                 anastasis_url,
                                                 id_data,
                                                 "answer the question",
                                                 "text/plain",
                                                 "SomeTruth1",
                                                 MHD_HTTP_NO_CONTENT,
                                                 ANASTASIS_TESTING_TSO_NONE,
                                                 "salt-request-1"),
    ANASTASIS_TESTING_cmd_truth_upload_question ("truth-create-2",
                                                 anastasis_url,
                                                 id_data,
                                                 "answer the question",
                                                 "text/plain",
                                                 "SomeTruth2",
                                                 MHD_HTTP_NO_CONTENT,
                                                 ANASTASIS_TESTING_TSO_NONE,
                                                 "salt-request-1"),
    ANASTASIS_TESTING_cmd_truth_upload ("truth-create-3",
                                        anastasis_url,
                                        id_data,
                                        "file",
                                        "read the file",
                                        "text/plain",
                                        file_secret,
                                        strlen (file_secret),
                                        MHD_HTTP_NO_CONTENT,
                                        ANASTASIS_TESTING_TSO_NONE,
                                        "salt-request-1"),
    ANASTASIS_TESTING_cmd_policy_create ("policy-create-1",
                                         "truth-create-1",
                                         "truth-create-2",
                                         NULL),
    ANASTASIS_TESTING_cmd_policy_create ("policy-create-2",
                                         "truth-create-1",
                                         "truth-create-3",
                                         NULL),
    ANASTASIS_TESTING_cmd_policy_create ("policy-create-3",
                                         "truth-create-2",
                                         "truth-create-3",
                                         NULL),
    ANASTASIS_TESTING_cmd_secret_share ("secret-share-1",
                                        anastasis_url,
                                        "salt-request-1",
                                        NULL,
                                        id_data,
                                        "core secret",
                                        strlen ("core secret"),
                                        ANASTASIS_SHARE_STATUS_PAYMENT_REQUIRED,
                                        ANASTASIS_TESTING_SSO_NONE,
                                        "policy-create-1",
                                        "policy-create-2",
                                        "policy-create-3",
                                        NULL),
    /* what would we have to pay? */
    TALER_TESTING_cmd_merchant_claim_order ("fetch-proposal",
                                            merchant_url,
                                            MHD_HTTP_OK,
                                            "secret-share-1",
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
    ANASTASIS_TESTING_cmd_secret_share ("secret-share-2",
                                        anastasis_url,
                                        "salt-request-1",
                                        "secret-share-1",
                                        id_data,
                                        "core secret",
                                        strlen ("core secret"),
                                        ANASTASIS_SHARE_STATUS_SUCCESS,
                                        ANASTASIS_TESTING_SSO_NONE,
                                        "policy-create-1",
                                        "policy-create-2",
                                        "policy-create-3",
                                        NULL),
    ANASTASIS_TESTING_cmd_recover_secret ("recover-secret-1",
                                          anastasis_url,
                                          id_data,
                                          0, /* version */
                                          ANASTASIS_TESTING_RSO_NONE,
                                          "salt-request-1",
                                          "secret-share-2"),
    ANASTASIS_TESTING_cmd_challenge_answer ("challenge-answer-1",
                                            NULL, /* payment ref */
                                            "recover-secret-1", /* challenge ref */
                                            0, /* challenge index */
                                            "SomeTruth1",
                                            0,  /* mode */
                                            ANASTASIS_CHALLENGE_STATUS_SOLVED),
#if 0
    ANASTASIS_TESTING_cmd_challenge_answer ("challenge-answer-2",
                                            NULL, /* payment ref */
                                            "recover-secret-1",
                                            1, /* challenge index */
                                            "SomeTruth2",
                                            0, /* mode */
                                            ANASTASIS_CHALLENGE_STATUS_SOLVED),
#endif
    ANASTASIS_TESTING_cmd_challenge_start ("challenge-start-3-pay",
                                           NULL,  /* payment ref */
                                           "recover-secret-1",
                                           2,  /* challenge index */
                                           ANASTASIS_CHALLENGE_STATUS_PAYMENT_REQUIRED),
    TALER_TESTING_cmd_merchant_claim_order ("fetch-challenge-pay-proposal",
                                            merchant_url,
                                            MHD_HTTP_OK,
                                            "challenge-start-3-pay",
                                            NULL),
    TALER_TESTING_cmd_merchant_pay_order ("pay-file-challenge",
                                          merchant_url,
                                          MHD_HTTP_OK,
                                          "fetch-challenge-pay-proposal",
                                          "withdraw-coin-2",
                                          "EUR:1",
                                          "EUR:1", /* must match COST in config! */
                                          NULL),
    ANASTASIS_TESTING_cmd_challenge_start ("challenge-start-3-paid",
                                           "challenge-start-3-pay",  /* payment ref */
                                           "recover-secret-1",
                                           2,  /* challenge index */
                                           ANASTASIS_CHALLENGE_STATUS_INSTRUCTIONS),
    ANASTASIS_TESTING_cmd_challenge_answer ("challenge-answer-3",
                                            "challenge-start-3-pay", /* payment ref */
                                            "recover-secret-1",
                                            2, /* challenge index */
                                            "challenge-start-3-paid", /* answer */
                                            1, /* mode */
                                            ANASTASIS_CHALLENGE_STATUS_SOLVED),
    ANASTASIS_TESTING_cmd_recover_secret_finish ("recover-finish-1",
                                                 "recover-secret-1",
                                                 GNUNET_TIME_UNIT_SECONDS),
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
    TALER_TESTING_cmd_batch ("pay",
                             pay),
    TALER_TESTING_cmd_batch ("anastasis",
                             anastasis),
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
  unsigned int ret;
  /* These environment variables get in the way... */
  unsetenv ("XDG_DATA_HOME");
  unsetenv ("XDG_CONFIG_HOME");

  GNUNET_log_setup ("test-anastasis",
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
  id_data = ANASTASIS_TESTING_make_id_data_example (
    "MaxMuster123456789");
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
      return 1;
    break;
  default:
    GNUNET_break (0);
    return 1;
  }
  return 0;
}


/* end of test_anastasis.c */
