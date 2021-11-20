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
  setupDb,
  ExchangeService,
  FakeBankService,
} from "../harness/harness.js";
import { createSimpleTestkudosEnvironment } from "../harness/helpers.js";
import { WalletApiOperation } from "@gnu-taler/taler-wallet-core";
import { CoinConfig, defaultCoinConfig } from "../harness/denomStructures.js";
import { URL } from "@gnu-taler/taler-util";

/**
 * Run test for basic, bank-integrated withdrawal.
 */
export async function runTestWithdrawalFakebankTest(t: GlobalTestState) {
  // Set up test environment

  const db = await setupDb(t);

  const bank = await FakeBankService.create(t, {
    currency: "TESTKUDOS",
    httpPort: 8082,
  });

  const exchange = ExchangeService.create(t, {
    name: "testexchange-1",
    currency: "TESTKUDOS",
    httpPort: 8081,
    database: db.connStr,
  });

  exchange.addBankAccount("1", {
    accountName: "exchange",
    accountPassword: "x",
    wireGatewayApiBaseUrl: new URL("/exchange/", bank.baseUrl).href,
    accountPaytoUri: "payto://x-taler-bank/localhost/exchange",
  });

  await bank.start();

  await bank.pingUntilAvailable();

  const coinConfig: CoinConfig[] = defaultCoinConfig.map((x) => x("TESTKUDOS"));
  exchange.addCoinConfigList(coinConfig);

  await exchange.start();
  await exchange.pingUntilAvailable();

  console.log("setup done!");

  const wallet = new WalletCli(t);

  await wallet.client.call(WalletApiOperation.AddExchange, {
    exchangeBaseUrl: exchange.baseUrl,
  });

  await wallet.client.call(WalletApiOperation.WithdrawFakebank, {
    exchange: exchange.baseUrl,
    amount: "TESTKUDOS:10",
    bank: bank.baseUrl,
  });

  await exchange.runWirewatchOnce();

  await wallet.runUntilDone();

  // Check balance

  const balResp = await wallet.client.call(WalletApiOperation.GetBalances, {});
  t.assertAmountEquals("TESTKUDOS:9.72", balResp.balances[0].available);

  await t.shutdown();
}

runTestWithdrawalFakebankTest.suites = ["wallet"];
