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
  SandboxUserBundle,
  NexusUserBundle,
  launchLibeufinServices,
  LibeufinSandboxApi,
  LibeufinNexusApi,
} from "../harness/libeufin";

/**
 * Run basic test with LibEuFin.
 */
export async function runLibeufinKeyrotationTest(t: GlobalTestState) {
  /**
   * User saltetd "01"
   */
  const user01nexus = new NexusUserBundle(
    "01",
    "http://localhost:5010/ebicsweb",
  );
  const user01sandbox = new SandboxUserBundle("01");

  /**
   * Launch Sandbox and Nexus.
   */
  const libeufinServices = await launchLibeufinServices(
    t, [user01nexus], [user01sandbox],
  );

  await LibeufinNexusApi.fetchTransactions(
    libeufinServices.libeufinNexus,
    user01nexus.localAccountName,
  );

  /* Rotate the Sandbox keys, and fetch the transactions again */
  await LibeufinSandboxApi.rotateKeys(
    libeufinServices.libeufinSandbox,
    user01sandbox.ebicsBankAccount.subscriber.hostID,
  );

  try {
    await LibeufinNexusApi.fetchTransactions(
      libeufinServices.libeufinNexus,
      user01nexus.localAccountName,
    );
  } catch (e: any) {
    /**
     * Asserting that Nexus responded with a 500 Internal server
     * error, because the bank signed the last response with a new
     * key pair that was never downloaded by Nexus.
     *
     * NOTE: the bank accepted the request addressed to the old
     * public key.  Should it in this case reject the request even
     * before trying to verify it?
     */
    t.assertTrue(e.response.status == 500);
    t.assertTrue(e.response.data.code == 9000);
  }
}
runLibeufinKeyrotationTest.suites = ["libeufin"];
