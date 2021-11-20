/*
 This file is part of GNU Taler
 (C) 2021 Taler Systems S.A.

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
import { URL } from "@gnu-taler/taler-util";
import { CoinConfig, defaultCoinConfig } from "./harness/denomStructures.js";
import {
  GlobalTestState,
  setupDb,
  FakeBankService,
  ExchangeService,
} from "./harness/harness.js";

/**
 * Entry point for the benchmark.
 *
 * The benchmark runs against an existing Taler deployment and does not
 * set up its own services.
 */
export async function runEnv1(t: GlobalTestState): Promise<void> {
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
}
