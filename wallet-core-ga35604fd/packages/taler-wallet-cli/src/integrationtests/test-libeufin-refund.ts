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
 * Run basic test with LibEuFin.
 */
export async function runLibeufinRefundTest(t: GlobalTestState) {
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
   * Launch Sandbox and Nexus.
   */
  const libeufinServices = await launchLibeufinServices(
    t,
    [user01nexus, user02nexus],
    [user01sandbox, user02sandbox],
    ["twg"],
  );

  // user 02 pays user 01 with a faulty (non Taler) subject.
  await libeufinServices.libeufinSandbox.makeTransaction(
    user02sandbox.ebicsBankAccount.label, // debit
    user01sandbox.ebicsBankAccount.label, // credit
    "EUR:1",
    "not a public key",
  );

  // The bad payment should be now ingested and prepared as
  // a reimbursement.
  await LibeufinNexusApi.fetchTransactions(
    libeufinServices.libeufinNexus,
    user01nexus.localAccountName,
  );
  // Check that the payment arrived at the Nexus.
  const nexusTxs = await LibeufinNexusApi.getAccountTransactions(
    libeufinServices.libeufinNexus,
    user01nexus.localAccountName,
  );
  t.assertTrue(nexusTxs.data["transactions"].length == 1);

  // Submit the reimbursement
  await LibeufinNexusApi.submitInitiatedPayment(
    libeufinServices.libeufinNexus,
    user01nexus.localAccountName,
    // The initiated payment (= the reimbursement) ID below
    // got set by the Taler facade; at this point only one must
    // exist.  If "1" is not found, a 404 will make this test fail.
    "1",
  );

  // user 02 checks whether the reimbursement arrived.
  let history = await LibeufinSandboxApi.getAccountTransactions(
    libeufinServices.libeufinSandbox,
    user02sandbox.ebicsBankAccount["label"],
  );
  // 2 payments must exist: 1 the original (faulty) payment +
  // 1 the reimbursement.
  t.assertTrue(history["payments"].length == 2);
}
runLibeufinRefundTest.suites = ["libeufin"];
