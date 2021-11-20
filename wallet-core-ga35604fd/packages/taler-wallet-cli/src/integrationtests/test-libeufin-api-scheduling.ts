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
import { GlobalTestState, setupDb } from "../harness/harness.js";
import {
  SandboxUserBundle,
  NexusUserBundle,
  launchLibeufinServices,
  LibeufinSandboxApi,
  LibeufinNexusApi,
  LibeufinNexusService,
} from "../harness/libeufin";

/**
 * Test Nexus scheduling API.  It creates a task, check whether it shows
 * up, then deletes it, and check if it's gone.  Ideally, a check over the
 * _liveliness_ of a scheduled task should happen.
 */
export async function runLibeufinApiSchedulingTest(t: GlobalTestState) {
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
  const user01sandbox = new SandboxUserBundle("01");
  await launchLibeufinServices(t, [user01nexus], [user01sandbox]);
  await LibeufinNexusApi.postTask(nexus, user01nexus.localAccountName, {
    name: "test-task",
    cronspec: "* * *",
    type: "fetch",
    params: {
      level: "all",
      rangeType: "all",
    },
  });
  let resp = await LibeufinNexusApi.getTasks(
    nexus,
    user01nexus.localAccountName,
    "test-task",
  );
  t.assertTrue(resp.data["taskName"] == "test-task");
  await LibeufinNexusApi.deleteTask(
    nexus,
    user01nexus.localAccountName,
    "test-task",
  );
  try {
    await LibeufinNexusApi.getTasks(
      nexus,
      user01nexus.localAccountName,
      "test-task",
    );
  } catch (err: any) {
    t.assertTrue(err.response.status == 404);
  }

  // Same with submit task.
  await LibeufinNexusApi.postTask(nexus, user01nexus.localAccountName, {
    name: "test-task",
    cronspec: "* * *",
    type: "submit",
    params: {},
  });
  resp = await LibeufinNexusApi.getTasks(
    nexus,
    user01nexus.localAccountName,
    "test-task",
  );
  t.assertTrue(resp.data["taskName"] == "test-task");
  await LibeufinNexusApi.deleteTask(
    nexus,
    user01nexus.localAccountName,
    "test-task",
  );
  try {
    await LibeufinNexusApi.getTasks(
      nexus,
      user01nexus.localAccountName,
      "test-task",
    );
  } catch (err: any) {
    t.assertTrue(err.response.status == 404);
  }
}
runLibeufinApiSchedulingTest.suites = ["libeufin"];
