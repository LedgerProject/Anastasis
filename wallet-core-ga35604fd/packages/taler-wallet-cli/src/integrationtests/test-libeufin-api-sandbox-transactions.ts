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

export async function runLibeufinApiSandboxTransactionsTest(t: GlobalTestState) {

  const sandbox = await LibeufinSandboxService.create(t, {
    httpPort: 5012,
    databaseJdbcUri: `jdbc:sqlite:${t.testDir}/libeufin-sandbox.sqlite3`,
  });
  await sandbox.start();
  await sandbox.pingUntilAvailable();
  await LibeufinSandboxApi.createBankAccount(sandbox, {
    iban: "DE71500105179674997361",
    bic: "BELADEBEXXX",
    name: "Mock Name",
    label: "mock-account",
  });
  await LibeufinSandboxApi.simulateIncomingTransaction(
    sandbox, 
    "mock-account",
    {
    
      debtorIban: "DE84500105176881385584",
      debtorBic: "BELADEBEXXX",
      debtorName: "mock2",
      subject: "mock subject",
      amount: "1" // EUR is default.
    }
  )
  await LibeufinSandboxApi.simulateIncomingTransaction(
    sandbox, 
    "mock-account",
    {
    
      debtorIban: "DE84500105176881385584",
      debtorBic: "BELADEBEXXX",
      debtorName: "mock2",
      subject: "mock subject 2",
      amount: "1.1" // EUR is default.
    }
  )
  let ret = await LibeufinSandboxApi.getAccountInfoWithBalance(sandbox, "mock-account");
  t.assertAmountEquals(ret.data.balance, "EUR:2.1");
}
runLibeufinApiSandboxTransactionsTest.suites = ["libeufin"];
