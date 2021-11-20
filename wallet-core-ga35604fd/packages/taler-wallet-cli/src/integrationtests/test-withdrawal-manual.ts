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
import { GlobalTestState, BankApi } from "../harness/harness.js";
import { createSimpleTestkudosEnvironment } from "../harness/helpers.js";
import { WalletApiOperation } from "@gnu-taler/taler-wallet-core";

/**
 * Run test for basic, bank-integrated withdrawal.
 */
export async function runTestWithdrawalManualTest(t: GlobalTestState) {
  // Set up test environment

  const {
    wallet,
    bank,
    exchange,
    exchangeBankAccount,
  } = await createSimpleTestkudosEnvironment(t);

  // Create a withdrawal operation

  const user = await BankApi.createRandomBankUser(bank);

  await wallet.client.call(WalletApiOperation.AddExchange, {
    exchangeBaseUrl: exchange.baseUrl,
  });


  const wres = await wallet.client.call(WalletApiOperation.AcceptManualWithdrawal, {
    exchangeBaseUrl: exchange.baseUrl,
    amount: "TESTKUDOS:10",
  });

  const reservePub: string = wres.reservePub;

  // Bug.
  await BankApi.adminAddIncoming(bank, {
    exchangeBankAccount,
    amount: "TESTKUDOS:10",
    debitAccountPayto: user.accountPaytoUri,
    reservePub: reservePub,
  });

  await exchange.runWirewatchOnce();

  await wallet.runUntilDone();

  // Check balance

  const balResp = await wallet.client.call(WalletApiOperation.GetBalances, {});
  t.assertAmountEquals("TESTKUDOS:9.72", balResp.balances[0].available);

  await t.shutdown();
}

runTestWithdrawalManualTest.suites = ["wallet"];
