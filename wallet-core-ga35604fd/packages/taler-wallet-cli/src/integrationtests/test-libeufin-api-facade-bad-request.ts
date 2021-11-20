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
import axios from "axios";
import { URL } from "@gnu-taler/taler-util";
import { GlobalTestState } from "../harness/harness.js";
import {
  SandboxUserBundle,
  NexusUserBundle,
  launchLibeufinServices,
  LibeufinNexusApi,
} from "../harness/libeufin";

export async function runLibeufinApiFacadeBadRequestTest(t: GlobalTestState) {

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
  console.log("malformed facade");
  const baseUrl = libeufinServices.libeufinNexus.baseUrl;
  let url = new URL("facades", baseUrl);
  let resp = await axios.post(
    url.href,
    {
      name: "malformed-facade",
      type: "taler-wire-gateway",
      config: {}, // malformation here.
    },
    {
      auth: {
        username: "admin",
        password: "test",
      },
      validateStatus: () => true,
    },
  );
  t.assertTrue(resp.status == 400);
}

runLibeufinApiFacadeBadRequestTest.suites = ["libeufin"];
