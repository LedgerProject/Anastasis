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
export async function runLibeufinApiBankconnectionTest(t: GlobalTestState) {
  const nexus = await LibeufinNexusService.create(t, {
    httpPort: 5011,
    databaseJdbcUri: `jdbc:sqlite:${t.testDir}/libeufin-nexus.sqlite3`,
  });
  await nexus.start();
  await nexus.pingUntilAvailable();

  await LibeufinNexusApi.createUser(nexus, {
    username: "one",
    password: "testing-the-bankconnection-api",
  });

  await LibeufinNexusApi.createEbicsBankConnection(nexus, {
    name: "bankconnection-api-test-connection",
    ebicsURL: "http://localhost:5012/ebicsweb",
    hostID: "mock",
    userID: "mock",
    partnerID: "mock",
  });

  let connections = await LibeufinNexusApi.getAllConnections(nexus);
  t.assertTrue(connections.data["bankConnections"].length == 1);

  await LibeufinNexusApi.deleteBankConnection(nexus, {
    bankConnectionId: "bankconnection-api-test-connection",
  });
  connections = await LibeufinNexusApi.getAllConnections(nexus);
  t.assertTrue(connections.data["bankConnections"].length == 0);
}
runLibeufinApiBankconnectionTest.suites = ["libeufin"];
