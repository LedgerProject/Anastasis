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
 * Integration test for the wallet testing functionality used by the exchange
 * test cases.
 */

/**
 * Imports.
 */
import { Amounts } from "@gnu-taler/taler-util";
import { WalletApiOperation } from "@gnu-taler/taler-wallet-core";
import { CoinConfig, defaultCoinConfig } from "../harness/denomStructures.js";
import {
  BankService,
  ExchangeService,
  GlobalTestState,
  MerchantService,
  setupDb,
  WalletCli,
  getPayto
} from "../harness/harness.js";
import { SimpleTestEnvironment } from "../harness/helpers.js";

const merchantAuthToken = "secret-token:sandbox";

/**
 * Run a test case with a simple TESTKUDOS Taler environment, consisting
 * of one exchange, one bank and one merchant.
 */
export async function createMyEnvironment(
  t: GlobalTestState,
  coinConfig: CoinConfig[] = defaultCoinConfig.map((x) => x("TESTKUDOS")),
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

  exchange.addCoinConfigList(coinConfig);

  await exchange.start();
  await exchange.pingUntilAvailable();

  merchant.addExchange(exchange);

  await merchant.start();
  await merchant.pingUntilAvailable();

  await merchant.addInstance({
    id: "default",
    name: "Default Instance",
    paytoUris: [getPayto("merchant-default")],
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
 * Run test for basic, bank-integrated withdrawal.
 */
export async function runWallettestingTest(t: GlobalTestState) {
  const { wallet, bank, exchange, merchant } = await createMyEnvironment(t);

  await wallet.client.call(WalletApiOperation.RunIntegrationTest, {
    amountToSpend: "TESTKUDOS:5",
    amountToWithdraw: "TESTKUDOS:10",
    bankBaseUrl: bank.baseUrl,
    exchangeBaseUrl: exchange.baseUrl,
    merchantAuthToken: merchantAuthToken,
    merchantBaseUrl: merchant.makeInstanceBaseUrl(),
  });

  let txns = await wallet.client.call(WalletApiOperation.GetTransactions, {});
  console.log(JSON.stringify(txns, undefined, 2));
  let txTypes = txns.transactions.map((x) => x.type);

  t.assertDeepEqual(txTypes, [
    "withdrawal",
    "payment",
    "withdrawal",
    "payment",
    "refund",
    "payment",
  ]);

  wallet.deleteDatabase();

  await wallet.client.call(WalletApiOperation.WithdrawTestBalance, {
    amount: "TESTKUDOS:10",
    bankBaseUrl: bank.baseUrl,
    exchangeBaseUrl: exchange.baseUrl,
  });

  await wallet.runUntilDone();

  await wallet.client.call(WalletApiOperation.TestPay, {
    amount: "TESTKUDOS:5",
    merchantAuthToken: merchantAuthToken,
    merchantBaseUrl: merchant.makeInstanceBaseUrl(),
    summary: "foo",
  });

  await wallet.runUntilDone();

  txns = await wallet.client.call(WalletApiOperation.GetTransactions, {});
  console.log(JSON.stringify(txns, undefined, 2));
  txTypes = txns.transactions.map((x) => x.type);

  t.assertDeepEqual(txTypes, ["withdrawal", "payment"]);

  wallet.deleteDatabase();

  await wallet.client.call(WalletApiOperation.WithdrawTestBalance, {
    amount: "TESTKUDOS:10",
    bankBaseUrl: bank.baseUrl,
    exchangeBaseUrl: exchange.baseUrl,
  });

  await wallet.runUntilDone();

  const coinDump = await wallet.client.call(WalletApiOperation.DumpCoins, {});

  console.log("coin dump:", JSON.stringify(coinDump, undefined, 2));

  let susp: string | undefined;
  {
    for (const c of coinDump.coins) {
      if (0 === Amounts.cmp(c.remaining_value, "TESTKUDOS:8")) {
        susp = c.coin_pub;
      }
    }
  }

  t.assertTrue(susp !== undefined);

  console.log("suspending coin");

  await wallet.client.call(WalletApiOperation.SetCoinSuspended, {
    coinPub: susp,
    suspended: true,
  });

  // This should fail, as we've suspended a coin that we need
  // to pay.
  await t.assertThrowsAsync(async () => {
    await wallet.client.call(WalletApiOperation.TestPay, {
      amount: "TESTKUDOS:5",
      merchantAuthToken: merchantAuthToken,
      merchantBaseUrl: merchant.makeInstanceBaseUrl(),
      summary: "foo",
    });
  });

  console.log("unsuspending coin");

  await wallet.client.call(WalletApiOperation.SetCoinSuspended, {
    coinPub: susp,
    suspended: false,
  });

  await wallet.client.call(WalletApiOperation.TestPay, {
    amount: "TESTKUDOS:5",
    merchantAuthToken: merchantAuthToken,
    merchantBaseUrl: merchant.makeInstanceBaseUrl(),
    summary: "foo",
  });

  await t.shutdown();
}

runWallettestingTest.suites = ["wallet"];
