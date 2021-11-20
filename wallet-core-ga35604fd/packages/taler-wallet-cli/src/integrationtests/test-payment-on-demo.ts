/*
 This file is part of GNU Taler
 (C) 2020 Taler Systems S.A.

 GNU Taler is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 GNU Taler is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 GNU Taler; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

/**
 * Imports.
 */
import {
  GlobalTestState,
  BankApi,
  WalletCli,
  BankAccessApi
} from "../harness/harness.js";
import {
  makeTestPayment,
} from "../harness/helpers.js";
import { WalletApiOperation } from "@gnu-taler/taler-wallet-core";

/**
 * Run test for basic, bank-integrated withdrawal and payment.
 */
export async function runPaymentDemoTest(t: GlobalTestState) {

  // Withdraw digital cash into the wallet.
  let bankInterface = {
    baseUrl: "https://bank.demo.taler.net/",
    port: 0 // unused.
  };
  let user = await BankApi.createRandomBankUser(bankInterface);
  let wop = await BankAccessApi.createWithdrawalOperation(bankInterface, user, "KUDOS:20");

   let wallet = new WalletCli(t);
  await wallet.client.call(WalletApiOperation.GetWithdrawalDetailsForUri, {
    talerWithdrawUri: wop.taler_withdraw_uri,
  });

  await wallet.runPending();

  // Confirm it

  await BankApi.confirmWithdrawalOperation(bankInterface, user, wop);

  // Withdraw

  await wallet.client.call(WalletApiOperation.AcceptBankIntegratedWithdrawal, {
    exchangeBaseUrl: "https://exchange.demo.taler.net/",
    talerWithdrawUri: wop.taler_withdraw_uri,
  });
  await wallet.runUntilDone();

  let balanceBefore = await wallet.client.call(WalletApiOperation.GetBalances, {});
  t.assertTrue(balanceBefore["balances"].length == 1);

  const order = {
    summary: "Buy me!",
    amount: "KUDOS:5",
    fulfillment_url: "taler://fulfillment-success/thx",
  };

  let merchant = {
    makeInstanceBaseUrl: function(instanceName?: string) {
      return "https://backend.demo.taler.net/instances/donations/";
    },
    port: 0,
    name: "donations",
  };

  t.assertTrue("TALER_ENV_FRONTENDS_APITOKEN" in process.env);

  await makeTestPayment(
    t,
    {
      merchant, wallet, order
    },
    {
      "Authorization": `Bearer ${process.env["TALER_ENV_FRONTENDS_APITOKEN"]}`,
    });

  await wallet.runUntilDone();

  let balanceAfter = await wallet.client.call(WalletApiOperation.GetBalances, {});
  t.assertTrue(balanceAfter["balances"].length == 1);
  t.assertTrue(balanceBefore["balances"][0]["available"] > balanceAfter["balances"][0]["available"]);
}

runPaymentDemoTest.excludeByDefault = true;
runPaymentDemoTest.suites = ["buildbot"];
