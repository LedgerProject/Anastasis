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
import { CoreApiResponse } from "@gnu-taler/taler-util";
import { WalletApiOperation } from "@gnu-taler/taler-wallet-core";
import { CoinConfig, defaultCoinConfig } from "../harness/denomStructures";
import {
  DbInfo,
  HarnessExchangeBankAccount,
  ExchangeService,
  GlobalTestState,
  MerchantService,
  setupDb,
  WalletCli,
} from "../harness/harness.js";
import { makeTestPayment } from "../harness/helpers.js";
import {
  LibeufinNexusApi,
  LibeufinNexusService,
  LibeufinSandboxApi,
  LibeufinSandboxService,
} from "../harness/libeufin";

const exchangeIban = "DE71500105179674997361";
const customerIban = "DE84500105176881385584";
const customerBic = "BELADEBEXXX";
const merchantIban = "DE42500105171245624648";

export interface LibeufinTestEnvironment {
  commonDb: DbInfo;
  exchange: ExchangeService;
  exchangeBankAccount: HarnessExchangeBankAccount;
  merchant: MerchantService;
  wallet: WalletCli;
  libeufinSandbox: LibeufinSandboxService;
  libeufinNexus: LibeufinNexusService;
}

/**
 * Create a Taler environment with LibEuFin and an EBICS account.
 */
export async function createLibeufinTestEnvironment(
  t: GlobalTestState,
  coinConfig: CoinConfig[] = defaultCoinConfig.map((x) => x("EUR")),
): Promise<LibeufinTestEnvironment> {
  const db = await setupDb(t);

  const libeufinSandbox = await LibeufinSandboxService.create(t, {
    httpPort: 5010,
    databaseJdbcUri: `jdbc:sqlite:${t.testDir}/libeufin-sandbox.sqlite3`,
  });

  await libeufinSandbox.start();
  await libeufinSandbox.pingUntilAvailable();

  const libeufinNexus = await LibeufinNexusService.create(t, {
    httpPort: 5011,
    databaseJdbcUri: `jdbc:sqlite:${t.testDir}/libeufin-nexus.sqlite3`,
  });

  await libeufinNexus.start();
  await libeufinNexus.pingUntilAvailable();

  await LibeufinSandboxApi.createEbicsHost(libeufinSandbox, "host01");
  // Subscriber and bank Account for the exchange
  await LibeufinSandboxApi.createEbicsSubscriber(libeufinSandbox, {
    hostID: "host01",
    partnerID: "partner01",
    userID: "user01",
  });
  await LibeufinSandboxApi.createEbicsBankAccount(libeufinSandbox, {
    bic: "DEUTDEBB101",
    iban: exchangeIban,
    label: "exchangeacct",
    name: "Taler Exchange",
    subscriber: {
      hostID: "host01",
      partnerID: "partner01",
      userID: "user01",
    },
  });
  // Subscriber and bank Account for the merchant
  // (Merchant doesn't need EBICS access, but sandbox right now only supports EBICS
  // accounts.)
  await LibeufinSandboxApi.createEbicsSubscriber(libeufinSandbox, {
    hostID: "host01",
    partnerID: "partner02",
    userID: "user02",
  });
  await LibeufinSandboxApi.createEbicsBankAccount(libeufinSandbox, {
    bic: "AUTOATW1XXX",
    iban: merchantIban,
    label: "merchantacct",
    name: "Merchant",
    subscriber: {
      hostID: "host01",
      partnerID: "partner02",
      userID: "user02",
    },
  });

  await LibeufinNexusApi.createEbicsBankConnection(libeufinNexus, {
    name: "myconn",
    ebicsURL: "http://localhost:5010/ebicsweb",
    hostID: "host01",
    partnerID: "partner01",
    userID: "user01",
  });
  await LibeufinNexusApi.connectBankConnection(libeufinNexus, "myconn");
  await LibeufinNexusApi.fetchAccounts(libeufinNexus, "myconn");
  await LibeufinNexusApi.importConnectionAccount(
    libeufinNexus,
    "myconn",
    "exchangeacct",
    "myacct",
  );

  await LibeufinNexusApi.createTwgFacade(libeufinNexus, {
    name: "twg1",
    accountName: "myacct",
    connectionName: "myconn",
    currency: "EUR",
    reserveTransferLevel: "report",
  });

  await LibeufinNexusApi.createUser(libeufinNexus, {
    username: "twguser",
    password: "twgpw",
  });

  await LibeufinNexusApi.postPermission(libeufinNexus, {
    action: "grant",
    permission: {
      subjectType: "user",
      subjectId: "twguser",
      resourceType: "facade",
      resourceId: "twg1",
      permissionName: "facade.talerWireGateway.history",
    },
  });

  await LibeufinNexusApi.postPermission(libeufinNexus, {
    action: "grant",
    permission: {
      subjectType: "user",
      subjectId: "twguser",
      resourceType: "facade",
      resourceId: "twg1",
      permissionName: "facade.talerWireGateway.transfer",
    },
  });

  const exchange = ExchangeService.create(t, {
    name: "testexchange-1",
    currency: "EUR",
    httpPort: 8081,
    database: db.connStr,
  });

  const merchant = await MerchantService.create(t, {
    name: "testmerchant-1",
    currency: "EUR",
    httpPort: 8083,
    database: db.connStr,
  });

  const exchangeBankAccount: HarnessExchangeBankAccount = {
    accountName: "twguser",
    accountPassword: "twgpw",
    accountPaytoUri: `payto://iban/${exchangeIban}?receiver-name=Exchange`,
    wireGatewayApiBaseUrl:
      "http://localhost:5011/facades/twg1/taler-wire-gateway/",
  };

  exchange.addBankAccount("1", exchangeBankAccount);

  exchange.addCoinConfigList(coinConfig);

  await exchange.start();
  await exchange.pingUntilAvailable();

  merchant.addExchange(exchange);

  await merchant.start();
  await merchant.pingUntilAvailable();

  await merchant.addInstance({
    id: "default",
    name: "Default Instance",
    paytoUris: [`payto://iban/${merchantIban}?receiver-name=Merchant`],
    defaultWireTransferDelay: { d_ms: 0 },
  });

  console.log("setup done!");

  const wallet = new WalletCli(t);

  return {
    commonDb: db,
    exchange,
    merchant,
    wallet,
    exchangeBankAccount,
    libeufinNexus,
    libeufinSandbox,
  };
}

/**
 * Run basic test with LibEuFin.
 */
export async function runLibeufinBasicTest(t: GlobalTestState) {
  // Set up test environment

  const {
    wallet,
    exchange,
    merchant,
    libeufinSandbox,
    libeufinNexus,
  } = await createLibeufinTestEnvironment(t);

  await wallet.client.call(WalletApiOperation.AddExchange, {
    exchangeBaseUrl: exchange.baseUrl,
  });

  const wr = await wallet.client.call(
    WalletApiOperation.AcceptManualWithdrawal,
    {
      exchangeBaseUrl: exchange.baseUrl,
      amount: "EUR:10",
    },
  );

  const reservePub: string = wr.reservePub;

  await LibeufinSandboxApi.simulateIncomingTransaction(
    libeufinSandbox,
    "exchangeacct",
    {
      amount: "15.00",
      debtorBic: customerBic,
      debtorIban: customerIban,
      debtorName: "Jane Customer",
      subject: `Taler Top-up ${reservePub}`,
    },
  );

  await LibeufinNexusApi.fetchTransactions(libeufinNexus, "myacct");

  await exchange.runWirewatchOnce();

  await wallet.runUntilDone();

  const bal = await wallet.client.call(WalletApiOperation.GetBalances, {});
  console.log("balances", JSON.stringify(bal, undefined, 2));
  t.assertAmountEquals(bal.balances[0].available, "EUR:14.7");

  const order = {
    summary: "Buy me!",
    amount: "EUR:5",
    fulfillment_url: "taler://fulfillment-success/thx",
  };

  await makeTestPayment(t, { wallet, merchant, order });

  await exchange.runAggregatorOnce();
  await exchange.runTransferOnce();

  await LibeufinNexusApi.submitAllPaymentInitiations(libeufinNexus, "myacct");

  const exchangeTransactions = await LibeufinSandboxApi.getAccountTransactions(
    libeufinSandbox,
    "exchangeacct",
  );

  console.log(
    "exchange transactions:",
    JSON.stringify(exchangeTransactions, undefined, 2),
  );

  t.assertDeepEqual(
    exchangeTransactions.payments[0].creditDebitIndicator,
    "credit",
  );
  t.assertDeepEqual(
    exchangeTransactions.payments[1].creditDebitIndicator,
    "debit",
  );
  t.assertDeepEqual(exchangeTransactions.payments[1].debtorIban, exchangeIban);
  t.assertDeepEqual(
    exchangeTransactions.payments[1].creditorIban,
    merchantIban,
  );
}
runLibeufinBasicTest.suites = ["libeufin"];
