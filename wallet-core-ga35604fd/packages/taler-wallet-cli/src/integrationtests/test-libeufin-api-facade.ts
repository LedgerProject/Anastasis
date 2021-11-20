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
  LibeufinNexusApi,
} from "../harness/libeufin";

/**
 * Run basic test with LibEuFin.
 */
export async function runLibeufinApiFacadeTest(t: GlobalTestState) {
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
    t,
    [user01nexus],
    [user01sandbox],
    ["twg"],
  );
  let resp = await LibeufinNexusApi.getAllFacades(
    libeufinServices.libeufinNexus,
  );
  // check that original facade shows up.
  t.assertTrue(resp.data["facades"][0]["name"] == user01nexus.twgReq["name"]);

  const twgBaseUrl: string = resp.data["facades"][0]["baseUrl"];
  t.assertTrue(typeof twgBaseUrl === "string");
  t.assertTrue(twgBaseUrl.startsWith("http://"));
  t.assertTrue(twgBaseUrl.endsWith("/"));

  // delete it.
  resp = await LibeufinNexusApi.deleteFacade(
    libeufinServices.libeufinNexus,
    user01nexus.twgReq["name"],
  );
  // check that no facades show up.
  t.assertTrue(!resp.data.hasOwnProperty("facades"));
}

runLibeufinApiFacadeTest.suites = ["libeufin"];
