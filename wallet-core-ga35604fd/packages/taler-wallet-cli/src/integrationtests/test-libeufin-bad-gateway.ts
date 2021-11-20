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
  NexusUserBundle,
  LibeufinNexusApi,
  LibeufinNexusService,
  LibeufinSandboxService,
} from "../harness/libeufin";

/**
 * Testing how Nexus reacts when the Sandbox is unreachable.
 * Typically, because the user specified a wrong EBICS endpoint.
 */
export async function runLibeufinBadGatewayTest(t: GlobalTestState) {
  /**
   * User saltetd "01"
   */
  const user01nexus = new NexusUserBundle(
    "01", "http://localhost:5010/not-found", // the EBICS endpoint at Sandbox
  );

  // Start Nexus
  const libeufinNexus = await LibeufinNexusService.create(t, {
    httpPort: 5011,
    databaseJdbcUri: `jdbc:sqlite:${t.testDir}/libeufin-nexus.sqlite3`,
  });
  await libeufinNexus.start();
  await libeufinNexus.pingUntilAvailable();

  // Start Sandbox
  const libeufinSandbox = await LibeufinSandboxService.create(t, {
    httpPort: 5010,
    databaseJdbcUri: `jdbc:sqlite:${t.testDir}/libeufin-sandbox.sqlite3`,
  });
  await libeufinSandbox.start();
  await libeufinSandbox.pingUntilAvailable();
  
  // Connecting to a non-existent Sandbox endpoint.
  await LibeufinNexusApi.createEbicsBankConnection(
    libeufinNexus,
    user01nexus.connReq
  );

  // 502 Bad Gateway expected.
  try {
    await LibeufinNexusApi.connectBankConnection(
      libeufinNexus,
      user01nexus.connReq.name,
    );
  } catch(e: any) {
    t.assertTrue(e.response.status == 502);
    return;
  }
  t.assertTrue(false);
}
runLibeufinBadGatewayTest.suites = ["libeufin"];
