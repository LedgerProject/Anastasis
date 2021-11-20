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
} from "../harness/libeufin";

/**
 * Run basic test with LibEuFin.
 */
export async function runLibeufinApiPermissionsTest(t: GlobalTestState) {
  const nexus = await LibeufinNexusService.create(t, {
    httpPort: 5011,
    databaseJdbcUri: `jdbc:sqlite:${t.testDir}/libeufin-nexus.sqlite3`,
  });
  await nexus.start();
  await nexus.pingUntilAvailable();

  const user01nexus = new NexusUserBundle(
    "01",
    "http://localhost:5010/ebicsweb",
  );

  await LibeufinNexusApi.createUser(nexus, user01nexus.userReq);
  await LibeufinNexusApi.postPermission(
    nexus,
    user01nexus.twgTransferPermission,
  );
  let transferPermission = await LibeufinNexusApi.getAllPermissions(nexus);
  let element = transferPermission.data["permissions"].pop();
  t.assertTrue(
    element["permissionName"] == "facade.talerwiregateway.transfer" &&
      element["subjectId"] == "username-01",
  );
  let denyTransfer = user01nexus.twgTransferPermission;

  // Now revoke permission.
  denyTransfer["action"] = "revoke";
  await LibeufinNexusApi.postPermission(nexus, denyTransfer);

  transferPermission = await LibeufinNexusApi.getAllPermissions(nexus);
  t.assertTrue(transferPermission.data["permissions"].length == 0);
}

runLibeufinApiPermissionsTest.suites = ["libeufin"];
