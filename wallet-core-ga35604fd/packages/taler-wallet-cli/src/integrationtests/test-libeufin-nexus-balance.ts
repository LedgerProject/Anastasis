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
export async function runLibeufinNexusBalanceTest(t: GlobalTestState) {
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

  // user 01 gets 10
  await libeufinServices.libeufinSandbox.makeTransaction(
    user02sandbox.ebicsBankAccount.label, // debit
    user01sandbox.ebicsBankAccount.label, // credit
    "EUR:10",
    "first payment",
  );

  // user 01 gets another 10
  await libeufinServices.libeufinSandbox.makeTransaction(
    user02sandbox.ebicsBankAccount.label, // debit
    user01sandbox.ebicsBankAccount.label, // credit
    "EUR:10",
    "first payment",
  );

  await LibeufinNexusApi.fetchTransactions(
    libeufinServices.libeufinNexus,
    user01nexus.localAccountName,
    "all", // range
    "report", // level
  );
  
  // Check that user 01 has 20, via Nexus.
  let accountInfo = await LibeufinNexusApi.getBankAccount(
    libeufinServices.libeufinNexus,
    user01nexus.localAccountName
  );
  t.assertTrue(accountInfo.data.lastSeenBalance == "EUR:20");

  // user 01 gives 30
  await libeufinServices.libeufinSandbox.makeTransaction(
    user01sandbox.ebicsBankAccount.label, // credit
    user02sandbox.ebicsBankAccount.label, // debit
    "EUR:30",
    "third payment",
  );

  await LibeufinNexusApi.fetchTransactions(
    libeufinServices.libeufinNexus,
    user01nexus.localAccountName,
    "all", // range
    "report", // level
  );

  let accountInfoDebit = await LibeufinNexusApi.getBankAccount(
    libeufinServices.libeufinNexus,
    user01nexus.localAccountName
  );
  t.assertTrue(accountInfoDebit.data.lastSeenBalance == "-EUR:10");
}
runLibeufinNexusBalanceTest.suites = ["libeufin"];
