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
import { LibeufinNexusApi, LibeufinNexusService } from "../harness/libeufin";

/**
 * Run basic test with LibEuFin.
 */
export async function runLibeufinApiUsersTest(t: GlobalTestState) {
  const nexus = await LibeufinNexusService.create(t, {
    httpPort: 5011,
    databaseJdbcUri: `jdbc:sqlite:${t.testDir}/libeufin-nexus.sqlite3`,
  });
  await nexus.start();
  await nexus.pingUntilAvailable();

  await LibeufinNexusApi.createUser(nexus, {
    username: "one",
    password: "will-be-changed",
  });

  await LibeufinNexusApi.changePassword(
    nexus,
    "one",
    {
      newPassword: "got-changed",
    },
    {
      auth: {
        username: "admin",
        password: "test",
      },
    },
  );

  let resp = await LibeufinNexusApi.getUser(nexus, {
    auth: {
      username: "one",
      password: "got-changed",
    },
  });
  console.log(resp.data);
  t.assertTrue(resp.data["username"] == "one" && !resp.data["superuser"]);
}

runLibeufinApiUsersTest.suites = ["libeufin"];
