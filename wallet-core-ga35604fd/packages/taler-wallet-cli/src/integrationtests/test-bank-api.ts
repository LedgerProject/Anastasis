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
  WalletCli,
  ExchangeService,
  setupDb,
  BankService,
  MerchantService,
  BankApi,
  BankAccessApi,
  CreditDebitIndicator,
  getPayto
} from "../harness/harness.js";
import { createEddsaKeyPair, encodeCrock } from "@gnu-taler/taler-util";
import { defaultCoinConfig } from "../harness/denomStructures";

/**
 * Run test for basic, bank-integrated withdrawal.
 */
export async function runBankApiTest(t: GlobalTestState) {
  // Set up test environment

  const db = await setupDb(t);

  const bank = await BankService.create(t, {
    allowRegistrations: true,
    currency: "TESTKUDOS",
    database: db.connStr,
    httpPort: 8082,
  });

  const exchange = ExchangeService.create(t, {
    name: "testexchange-1",
    currency: "TESTKUDOS",
    httpPort: 8081,
    database: db.connStr,
  });

  const merchant = await MerchantService.create(t, {
    name: "testmerchant-1",
    currency: "TESTKUDOS",
    httpPort: 8083,
    database: db.connStr,
  });

  const exchangeBankAccount = await bank.createExchangeAccount(
    "myexchange",
    "x",
  );
  exchange.addBankAccount("1", exchangeBankAccount);

  bank.setSuggestedExchange(exchange, exchangeBankAccount.accountPaytoUri);

  await bank.start();

  await bank.pingUntilAvailable();

  exchange.addOfferedCoins(defaultCoinConfig);

  await exchange.start();
  await exchange.pingUntilAvailable();

  merchant.addExchange(exchange);

  await merchant.start();
  await merchant.pingUntilAvailable();
  await merchant.addDefaultInstance();
  await merchant.addInstance({
    id: "minst1",
    name: "minst1",
    paytoUris: [getPayto("minst1")],
  });

  await merchant.addInstance({
    id: "default",
    name: "Default Instance",
    paytoUris: [getPayto("merchant-default")],
  });

  console.log("setup done!");

  const wallet = new WalletCli(t);

  const bankUser = await BankApi.registerAccount(bank, "user1", "pw1");

  // Make sure that registering twice results in a 409 Conflict
  {
    const e = await t.assertThrowsAsync(async () => {
      await BankApi.registerAccount(bank, "user1", "pw1");
    });
    t.assertAxiosError(e);
    t.assertTrue(e.response?.status === 409);
  }

  let balResp = await BankAccessApi.getAccountBalance(bank, bankUser);

  console.log(balResp);

  // Check that we got the sign-up bonus.
  t.assertAmountEquals(balResp.balance.amount, "TESTKUDOS:100");
  t.assertTrue(
    balResp.balance.credit_debit_indicator === CreditDebitIndicator.Credit,
  );

  const res = createEddsaKeyPair();

  await BankApi.adminAddIncoming(bank, {
    amount: "TESTKUDOS:115",
    debitAccountPayto: bankUser.accountPaytoUri,
    exchangeBankAccount: exchangeBankAccount,
    reservePub: encodeCrock(res.eddsaPub),
  });

  balResp = await BankAccessApi.getAccountBalance(bank, bankUser);
  t.assertAmountEquals(balResp.balance.amount, "TESTKUDOS:15");
  t.assertTrue(
    balResp.balance.credit_debit_indicator === CreditDebitIndicator.Debit,
  );
}
