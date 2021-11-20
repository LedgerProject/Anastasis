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
import { WalletApiOperation } from "@gnu-taler/taler-wallet-core";
import {
  GlobalTestState,
  BankService,
  ExchangeService,
  MerchantService,
  setupDb,
  WalletCli,
  getPayto
} from "../harness/harness.js";
import {
  withdrawViaBank,
  makeTestPayment,
  SimpleTestEnvironment,
} from "../harness/helpers.js";

/**
 * Run a test case with a simple TESTKUDOS Taler environment, consisting
 * of one exchange, one bank and one merchant.
 */
export async function createMyTestkudosEnvironment(
  t: GlobalTestState,
): Promise<SimpleTestEnvironment> {
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

  const coinCommon = {
    durationLegal: "3 years",
    durationSpend: "2 years",
    durationWithdraw: "7 days",
    rsaKeySize: 1024,
    feeDeposit: "TESTKUDOS:0.0025",
    feeWithdraw: "TESTKUDOS:0",
    feeRefresh: "TESTKUDOS:0",
    feeRefund: "TESTKUDOS:0",
  };

  exchange.addCoinConfigList([
    {
      ...coinCommon,
      name: "c1",
      value: "TESTKUDOS:1.28",
    },
    {
      ...coinCommon,
      name: "c2",
      value: "TESTKUDOS:0.64",
    },
    {
      ...coinCommon,
      name: "c3",
      value: "TESTKUDOS:0.32",
    },
    {
      ...coinCommon,
      name: "c4",
      value: "TESTKUDOS:0.16",
    },
    {
      ...coinCommon,
      name: "c5",
      value: "TESTKUDOS:0.08",
    },
    {
      ...coinCommon,
      name: "c5",
      value: "TESTKUDOS:0.04",
    },
    {
      ...coinCommon,
      name: "c6",
      value: "TESTKUDOS:0.02",
    },
    {
      ...coinCommon,
      name: "c7",
      value: "TESTKUDOS:0.01",
    },
  ]);

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

  console.log("setup done!");

  const wallet = new WalletCli(t);

  return {
    commonDb: db,
    exchange,
    merchant,
    wallet,
    bank,
    exchangeBankAccount,
  };
}

/**
 * Run test for basic, bank-integrated withdrawal and payment.
 */
export async function runFeeRegressionTest(t: GlobalTestState) {
  // Set up test environment

  const {
    wallet,
    bank,
    exchange,
    merchant,
  } = await createMyTestkudosEnvironment(t);

  // Withdraw digital cash into the wallet.

  await withdrawViaBank(t, {
    wallet,
    bank,
    exchange,
    amount: "TESTKUDOS:1.92",
  });

  const coins = await wallet.client.call(WalletApiOperation.DumpCoins, {});

  // Make sure we really withdraw one 0.64 and one 1.28 coin.
  t.assertTrue(coins.coins.length === 2);

  const order = {
    summary: "Buy me!",
    amount: "TESTKUDOS:1.30",
    fulfillment_url: "taler://fulfillment-success/thx",
  };

  await makeTestPayment(t, { wallet, merchant, order });

  await wallet.runUntilDone();

  const txs = await wallet.client.call(WalletApiOperation.GetTransactions, {});
  t.assertAmountEquals(txs.transactions[1].amountEffective, "TESTKUDOS:1.30");
  console.log(txs);
}
