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
  LibeufinNexusService,
  LibeufinSandboxService,
  LibeufinCli,
} from "../harness/libeufin";

/**
 * Run basic test with LibEuFin.
 */
export async function runLibeufinTutorialTest(t: GlobalTestState) {
  // Set up test environment

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

  const nexusUser = { username: "foo", password: "secret" };
  const libeufinCli = new LibeufinCli(t, {
    sandboxUrl: libeufinSandbox.baseUrl,
    nexusUrl: libeufinNexus.baseUrl,
    sandboxDatabaseUri: `jdbc:sqlite:${t.testDir}/libeufin-sandbox.sqlite3`,
    nexusDatabaseUri: `jdbc:sqlite:${t.testDir}/libeufin-nexus.sqlite3`,
    user: nexusUser,
  });

  const ebicsDetails = {
    hostId: "testhost",
    partnerId: "partner01",
    userId: "user01",
  };
  const bankAccountDetails = {
    currency: "EUR",
    iban: "DE18500105172929531888",
    bic: "INGDDEFFXXX",
    personName: "Jane Normal",
    accountName: "testacct01",
  };

  await libeufinCli.checkSandbox();
  await libeufinCli.createEbicsHost("testhost");
  await libeufinCli.createEbicsSubscriber(ebicsDetails);
  await libeufinCli.createEbicsBankAccount(ebicsDetails, bankAccountDetails);
  await libeufinCli.generateTransactions(bankAccountDetails.accountName);

  await libeufinNexus.start();
  await libeufinNexus.pingUntilAvailable();

  await libeufinNexus.createNexusSuperuser(nexusUser);
  const connectionDetails = {
    subscriberDetails: ebicsDetails,
    ebicsUrl: `${libeufinSandbox.baseUrl}ebicsweb`, // FIXME: need appropriate URL concatenation
    connectionName: "my-ebics-conn",
  };
  await libeufinCli.createEbicsConnection(connectionDetails);
  await libeufinCli.createBackupFile({
    passphrase: "secret",
    outputFile: `${t.testDir}/connection-backup.json`,
    connectionName: connectionDetails.connectionName,
  });
  await libeufinCli.createKeyLetter({
    outputFile: `${t.testDir}/letter.pdf`,
    connectionName: connectionDetails.connectionName,
  });
  await libeufinCli.connect(connectionDetails.connectionName);
  await libeufinCli.downloadBankAccounts(connectionDetails.connectionName);
  await libeufinCli.listOfferedBankAccounts(connectionDetails.connectionName);

  const bankAccountImportDetails = {
    offeredBankAccountName: bankAccountDetails.accountName,
    nexusBankAccountName: "at-nexus-testacct01",
    connectionName: connectionDetails.connectionName,
  };

  await libeufinCli.importBankAccount(bankAccountImportDetails);
  await libeufinSandbox.c53tick()
  await libeufinCli.fetchTransactions(bankAccountImportDetails.nexusBankAccountName);
  await libeufinCli.transactions(bankAccountImportDetails.nexusBankAccountName);

  const paymentDetails = {
    creditorIban: "DE42500105171245624648",
    creditorBic: "BELADEBEXXX",
    creditorName: "Mina Musterfrau",
    subject: "Purchase 01234",
    amount: "1.0",
    currency: "EUR",
    nexusBankAccountName: bankAccountImportDetails.nexusBankAccountName,
  };
  await libeufinCli.preparePayment(paymentDetails);
  await libeufinCli.submitPayment(paymentDetails, "1");

  await libeufinCli.newTalerWireGatewayFacade({
    accountName: bankAccountImportDetails.nexusBankAccountName,
    connectionName: "my-ebics-conn",
    currency: "EUR",
    facadeName: "my-twg",
  });
  await libeufinCli.listFacades();
}
runLibeufinTutorialTest.suites = ["libeufin"];
