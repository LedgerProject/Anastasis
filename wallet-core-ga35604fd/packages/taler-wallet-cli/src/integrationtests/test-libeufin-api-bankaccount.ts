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
import { GlobalTestState } from "../harness/harness.js";
import {
  NexusUserBundle,
  LibeufinNexusApi,
  LibeufinNexusService,
  LibeufinSandboxService,
  LibeufinSandboxApi,
  findNexusPayment,
} from "../harness/libeufin";

/**
 * Run basic test with LibEuFin.
 */
export async function runLibeufinApiBankaccountTest(t: GlobalTestState) {
  const nexus = await LibeufinNexusService.create(t, {
    httpPort: 5011,
    databaseJdbcUri: `jdbc:sqlite:${t.testDir}/libeufin-nexus.sqlite3`,
  });
  await nexus.start();
  await nexus.pingUntilAvailable();

  await LibeufinNexusApi.createUser(nexus, {
    username: "one",
    password: "testing-the-bankaccount-api",
  });
  const sandbox = await LibeufinSandboxService.create(t, {
    httpPort: 5012,
    databaseJdbcUri: `jdbc:sqlite:${t.testDir}/libeufin-sandbox.sqlite3`,
  });
  await sandbox.start();
  await sandbox.pingUntilAvailable();
  await LibeufinSandboxApi.createEbicsHost(sandbox, "mock");
  await LibeufinSandboxApi.createEbicsSubscriber(sandbox, {
    hostID: "mock",
    userID: "mock",
    partnerID: "mock",
  });
  await LibeufinSandboxApi.createEbicsBankAccount(sandbox, {
    subscriber: {
      hostID: "mock",
      partnerID: "mock",
      userID: "mock",
    },
    iban: "DE71500105179674997361",
    bic: "BELADEBEXXX",
    name: "mock",
    label: "mock",
  });
  await LibeufinNexusApi.createEbicsBankConnection(nexus, {
    name: "bankaccount-api-test-connection",
    ebicsURL: "http://localhost:5012/ebicsweb",
    hostID: "mock",
    userID: "mock",
    partnerID: "mock",
  });
  await LibeufinNexusApi.connectBankConnection(
    nexus,
    "bankaccount-api-test-connection",
  );
  await LibeufinNexusApi.fetchAccounts(
    nexus,
    "bankaccount-api-test-connection",
  );

  await LibeufinNexusApi.importConnectionAccount(
    nexus,
    "bankaccount-api-test-connection",
    "mock",
    "local-mock",
  );
  await LibeufinSandboxApi.simulateIncomingTransaction(
    sandbox,
    "mock", // creditor bankaccount label
    {
      debtorIban: "DE84500105176881385584",
      debtorBic: "BELADEBEXXX",
      debtorName: "mock2",
      amount: "1",
      subject: "mock subject",
    }
  );
  await LibeufinNexusApi.fetchTransactions(nexus, "local-mock");
  let transactions = await LibeufinNexusApi.getAccountTransactions(
    nexus,
    "local-mock",
  );
  let el = findNexusPayment("mock subject", transactions.data);
  t.assertTrue(el instanceof Object);
}
runLibeufinApiBankaccountTest.suites = ["libeufin"];
