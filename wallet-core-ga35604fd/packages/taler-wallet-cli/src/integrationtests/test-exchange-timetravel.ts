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
  codecForExchangeKeysJson,
  ConfirmPayResultType,
  Duration,
  durationFromSpec,
  PreparePayResultType,
  stringifyTimestamp,
} from "@gnu-taler/taler-util";
import {
  NodeHttpLib,
  PendingOperationsResponse,
  readSuccessResponseJsonOrThrow,
  WalletApiOperation,
} from "@gnu-taler/taler-wallet-core";
import { makeNoFeeCoinConfig } from "../harness/denomStructures";
import {
  BankService,
  ExchangeService,
  GlobalTestState,
  MerchantPrivateApi,
  MerchantService,
  setupDb,
  WalletCli,
  getPayto
} from "../harness/harness.js";
import { startWithdrawViaBank, withdrawViaBank } from "../harness/helpers.js";

async function applyTimeTravel(
  timetravelDuration: Duration,
  s: {
    exchange?: ExchangeService;
    merchant?: MerchantService;
    wallet?: WalletCli;
  },
): Promise<void> {
  if (s.exchange) {
    await s.exchange.stop();
    s.exchange.setTimetravel(timetravelDuration);
    await s.exchange.start();
    await s.exchange.pingUntilAvailable();
  }

  if (s.merchant) {
    await s.merchant.stop();
    s.merchant.setTimetravel(timetravelDuration);
    await s.merchant.start();
    await s.merchant.pingUntilAvailable();
  }

  if (s.wallet) {
    console.log("setting wallet time travel to", timetravelDuration);
    s.wallet.setTimetravel(timetravelDuration);
  }
}

const http = new NodeHttpLib();

/**
 * Basic time travel test.
 */
export async function runExchangeTimetravelTest(t: GlobalTestState) {
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

  exchange.addCoinConfigList(makeNoFeeCoinConfig("TESTKUDOS"));

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

  await merchant.addInstance({
    id: "minst1",
    name: "minst1",
    paytoUris: [getPayto("minst1")],
  });

  console.log("setup done!");

  const wallet = new WalletCli(t);

  // Withdraw digital cash into the wallet.

  await withdrawViaBank(t, { wallet, bank, exchange, amount: "TESTKUDOS:15" });

  const keysResp1 = await http.get(exchange.baseUrl + "keys");
  const keys1 = await readSuccessResponseJsonOrThrow(
    keysResp1,
    codecForExchangeKeysJson(),
  );
  console.log(
    "keys 1 (before time travel):",
    JSON.stringify(keys1, undefined, 2),
  );

  // Travel into the future, the deposit expiration is two years
  // into the future.
  console.log("applying first time travel");
  await applyTimeTravel(durationFromSpec({ days: 400 }), {
    wallet,
    exchange,
    merchant,
  });

  const keysResp2 = await http.get(exchange.baseUrl + "keys");
  const keys2 = await readSuccessResponseJsonOrThrow(
    keysResp2,
    codecForExchangeKeysJson(),
  );
  console.log(
    "keys 2 (after time travel):",
    JSON.stringify(keys2, undefined, 2),
  );

  const denomPubs1 = keys1.denoms.map((x) => {
    return {
      denomPub: x.denom_pub,
      expireDeposit: stringifyTimestamp(x.stamp_expire_deposit),
    };
  });

  const denomPubs2 = keys2.denoms.map((x) => {
    return {
      denomPub: x.denom_pub,
      expireDeposit: stringifyTimestamp(x.stamp_expire_deposit),
    };
  });
  const dps2 = new Set(denomPubs2.map((x) => x.denomPub));

  console.log("=== KEYS RESPONSE 1 ===");

  console.log("list issue date", stringifyTimestamp(keys1.list_issue_date));
  console.log("num denoms", keys1.denoms.length)
  console.log("denoms", JSON.stringify(denomPubs1, undefined, 2));

  console.log("=== KEYS RESPONSE 2 ===");

  console.log("list issue date", stringifyTimestamp(keys2.list_issue_date));
  console.log("num denoms", keys2.denoms.length)
  console.log("denoms", JSON.stringify(denomPubs2, undefined, 2));

  for (const da of denomPubs1) {
    if (!dps2.has(da.denomPub)) {
      console.log("=== ERROR ===");
      console.log(`denomination with public key ${da.denomPub} is not present in new /keys response`);
      console.log(
        `the new /keys response was issued ${stringifyTimestamp(
          keys2.list_issue_date,
        )}`,
      );
      console.log(
        `however, the missing denomination has stamp_expire_deposit ${da.expireDeposit}`,
      );
      console.log("see above for the verbatim /keys responses");
      t.assertTrue(false);
    }
  }
}

runExchangeTimetravelTest.suites = ["exchange"];
