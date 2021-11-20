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
import { GlobalTestState, delayMs } from "../harness/harness.js";
import {
  SandboxUserBundle,
  NexusUserBundle,
  launchLibeufinServices,
  LibeufinSandboxApi,
  LibeufinNexusApi,
} from "../harness/libeufin";

/**
 * This test checks how the C52 and C53 coordinate.  It'll test
 * whether fresh transactions stop showing as C52 after they get
 * included in a bank statement.
 */
export async function runLibeufinC5xTest(t: GlobalTestState) {
  /**
   * User saltetd "01"
   */
  const user01nexus = new NexusUserBundle(
    "01",
    "http://localhost:5010/ebicsweb",
  );
  const user01sandbox = new SandboxUserBundle("01");

  /**
   * User saltetd "02".
   */
  const user02nexus = new NexusUserBundle(
    "02",
    "http://localhost:5010/ebicsweb",
  );
  const user02sandbox = new SandboxUserBundle("02");

  /**
   * Launch Sandbox and Nexus.
   */
  const libeufinServices = await launchLibeufinServices(
    t,
    [user01nexus, user02nexus],
    [user01sandbox, user02sandbox],
    ["twg"],
  );

  // Check that C52 and C53 have zero entries.

  // C52
  await LibeufinNexusApi.fetchTransactions(
    libeufinServices.libeufinNexus,
    user01nexus.localAccountName,
    "all", // range
    "report", // level
  );
  // C53
  await LibeufinNexusApi.fetchTransactions(
    libeufinServices.libeufinNexus,
    user01nexus.localAccountName,
    "all", // range
    "statement", // level
  );
  const nexusTxs = await LibeufinNexusApi.getAccountTransactions(
    libeufinServices.libeufinNexus,
    user01nexus.localAccountName,
  );
  t.assertTrue(nexusTxs.data["transactions"].length == 0);
  
  // Addressing one payment to user 01
  await libeufinServices.libeufinSandbox.makeTransaction(
    user02sandbox.ebicsBankAccount.label, // debit
    user01sandbox.ebicsBankAccount.label, // credit
    "EUR:10",
    "first payment",
  );

  // Checking that C52 has one and C53 has zero.

  let expectOne = await LibeufinNexusApi.fetchTransactions(
    libeufinServices.libeufinNexus,
    user01nexus.localAccountName,
    "all", // range
    "report", // C52
  );
  t.assertTrue(expectOne.data.newTransactions == 1);
  t.assertTrue(expectOne.data.downloadedTransactions == 1);

  let expectZero = await LibeufinNexusApi.fetchTransactions(
    libeufinServices.libeufinNexus,
    user01nexus.localAccountName,
    "all", // range
    "statement", // C53
  );
  t.assertTrue(expectZero.data.newTransactions == 0);
  t.assertTrue(expectZero.data.downloadedTransactions == 0);

  // Ticking now: the one payment should be downloaded
  // in a C53 but not in a C52.  In any case, the payment
  // is not new anymore, because it was already ingested
  // when it was downloaded for the first time along the
  // c52 above.
  await libeufinServices.libeufinSandbox.c53tick();

  expectOne = await LibeufinNexusApi.fetchTransactions(
    libeufinServices.libeufinNexus,
    user01nexus.localAccountName,
    "all", // range
    "statement", // C53
  );
  t.assertTrue(expectOne.data.downloadedTransactions == 1);
  t.assertTrue(expectOne.data.newTransactions == 0);

  expectZero = await LibeufinNexusApi.fetchTransactions(
    libeufinServices.libeufinNexus,
    user01nexus.localAccountName,
    "all", // range
    "report", // C52
  );
  t.assertTrue(expectZero.data.downloadedTransactions == 0);
  t.assertTrue(expectZero.data.newTransactions == 0);
}
runLibeufinC5xTest.suites = ["libeufin"];
