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
 * User 01 expects a refund from user 02, and expectedly user 03
 * should not be involved in the process.
 */
export async function runLibeufinRefundMultipleUsersTest(t: GlobalTestState) {
  /**
   * User saltetd "01"
   */
  const user01nexus = new NexusUserBundle(
    "01",
    "http://localhost:5010/ebicsweb",
  );
  const user01sandbox = new SandboxUserBundle("01");

  /**
   * User saltetd "02"
   */
  const user02nexus = new NexusUserBundle(
    "02",
    "http://localhost:5010/ebicsweb",
  );
  const user02sandbox = new SandboxUserBundle("02");

  /**
   * User saltetd "03"
   */
  const user03nexus = new NexusUserBundle(
    "03",
    "http://localhost:5010/ebicsweb",
  );
  const user03sandbox = new SandboxUserBundle("03");

  /**
   * Launch Sandbox and Nexus.
   */
  const libeufinServices = await launchLibeufinServices(
    t,
    [user01nexus, user02nexus],
    [user01sandbox, user02sandbox],
    ["twg"],
  );

  // user 01 gets the payment
  await libeufinServices.libeufinSandbox.makeTransaction(
    user02sandbox.ebicsBankAccount.label, // debit
    user01sandbox.ebicsBankAccount.label, // credit
    "EUR:1",
    "not a public key",
  );

  // user 01 fetches the payments
  await LibeufinNexusApi.fetchTransactions(
    libeufinServices.libeufinNexus,
    user01nexus.localAccountName,
  );

  // user 01 tries to submit the reimbursement, as
  // the payment didn't have a valid public key in
  // the subject.
  await LibeufinNexusApi.submitInitiatedPayment(
    libeufinServices.libeufinNexus,
    user01nexus.localAccountName,
    "1", // so far the only one that can exist.
  );

  // user 02 checks whether a reimbursement arrived.
  let history = await LibeufinSandboxApi.getAccountTransactions(
    libeufinServices.libeufinSandbox,
    user02sandbox.ebicsBankAccount["label"],
  );
  // reimbursement arrived IFF the total payments are 2:
  // 1 the original (faulty) transaction + 1 the reimbursement.
  t.assertTrue(history["payments"].length == 2);
}

runLibeufinRefundMultipleUsersTest.suites = ["libeufin"];
