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

// This test only checks that LibEuFin doesn't fail when
// it generates Camt statements - no assertions take place.
// Furthermore, it prints the Camt.053 being generated.
export async function runLibeufinApiSandboxCamtTest(t: GlobalTestState) {

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
    label: "mock-account-0",
  });
  await LibeufinSandboxApi.createBankAccount(sandbox, {
    iban: "DE71500105179674997361",
    bic: "BELADEBEXXX",
    name: "Mock Name",
    label: "mock-account-1",
  });
  await sandbox.makeTransaction("mock-account-0", "mock-account-1", "EUR:1", "+1");
  await sandbox.makeTransaction("mock-account-0", "mock-account-1", "EUR:1", "+1");
  await sandbox.makeTransaction("mock-account-0", "mock-account-1", "EUR:1", "+1");
  await sandbox.makeTransaction("mock-account-1", "mock-account-0", "EUR:5", "minus 5");
  await sandbox.c53tick();
  let ret = await LibeufinSandboxApi.getCamt053(sandbox, "mock-account-1");
  console.log(ret);
}
runLibeufinApiSandboxCamtTest.excludeByDefault = true;
runLibeufinApiSandboxCamtTest.suites = ["libeufin"];
