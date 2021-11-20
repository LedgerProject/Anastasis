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
  LibeufinSandboxApi,
} from "../harness/libeufin";

/**
 * Testing the Anastasis API, offered by the Anastasis facade.
 */
export async function runLibeufinAnastasisFacadeTest(t: GlobalTestState) {
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
    ["anastasis"], // create only one Anastasis facade.
  );
  let resp = await LibeufinNexusApi.getAllFacades(
    libeufinServices.libeufinNexus,
  );
  // check that original facade shows up.
  t.assertTrue(resp.data["facades"][0]["name"] == user01nexus.anastasisReq["name"]);
  const anastasisBaseUrl: string = resp.data["facades"][0]["baseUrl"];
  t.assertTrue(typeof anastasisBaseUrl === "string");
  t.assertTrue(anastasisBaseUrl.startsWith("http://"));
  t.assertTrue(anastasisBaseUrl.endsWith("/"));

  await LibeufinNexusApi.fetchTransactions(
    libeufinServices.libeufinNexus,
    user01nexus.localAccountName,
  );

  await LibeufinNexusApi.postPermission(
    libeufinServices.libeufinNexus, {
      action: "grant",
      permission: {
        subjectId: user01nexus.userReq.username,
        subjectType: "user",
        resourceType: "facade",
        resourceId: user01nexus.anastasisReq.name,
        permissionName: "facade.anastasis.history",
      },
  }
  );

  // check if empty.
  let txsEmpty = await LibeufinNexusApi.getAnastasisTransactions(
    libeufinServices.libeufinNexus,
    anastasisBaseUrl, {delta: 5})

  t.assertTrue(txsEmpty.data.incoming_transactions.length == 0);

  LibeufinSandboxApi.simulateIncomingTransaction(
    libeufinServices.libeufinSandbox,
    user01sandbox.ebicsBankAccount.label,
    {
      debtorIban: "ES3314655813489414469157",
      debtorBic: "BCMAESM1XXX",
      debtorName: "Mock Donor",
      subject: "Anastasis donation",
      amount: "3", // Sandbox takes currency from its 'config'
    },
  )

  LibeufinSandboxApi.simulateIncomingTransaction(
    libeufinServices.libeufinSandbox,
    user01sandbox.ebicsBankAccount.label,
    {
      debtorIban: "ES3314655813489414469157",
      debtorBic: "BCMAESM1XXX",
      debtorName: "Mock Donor",
      subject: "another Anastasis donation",
      amount: "1", // Sandbox takes currency from its "config"
    },
  )

  await LibeufinNexusApi.fetchTransactions(
    libeufinServices.libeufinNexus,
    user01nexus.localAccountName,
  );

  let txs = await LibeufinNexusApi.getAnastasisTransactions(
    libeufinServices.libeufinNexus,
    anastasisBaseUrl,
    {delta: 5},
    user01nexus.userReq.username,
    user01nexus.userReq.password,
  );

  // check the two payments show up
  let txsList = txs.data.incoming_transactions
  t.assertTrue(txsList.length == 2);
  t.assertTrue([txsList[0].subject, txsList[1].subject].includes("Anastasis donation"));
  t.assertTrue([txsList[0].subject, txsList[1].subject].includes("another Anastasis donation"));
  t.assertTrue(txsList[0].row_id == 1)
  t.assertTrue(txsList[1].row_id == 2)

  LibeufinSandboxApi.simulateIncomingTransaction(
    libeufinServices.libeufinSandbox,
    user01sandbox.ebicsBankAccount.label,
    {
      debtorIban: "ES3314655813489414469157",
      debtorBic: "BCMAESM1XXX",
      debtorName: "Mock Donor",
      subject: "last Anastasis donation",
      amount: "10.10", // Sandbox takes currency from its "config"
    },
  )

  await LibeufinNexusApi.fetchTransactions(
    libeufinServices.libeufinNexus,
    user01nexus.localAccountName,
  );

  let txsLast = await LibeufinNexusApi.getAnastasisTransactions(
    libeufinServices.libeufinNexus,
    anastasisBaseUrl,
    {delta: 5, start: 2},
    user01nexus.userReq.username,
    user01nexus.userReq.password,
  );
  console.log(txsLast.data.incoming_transactions[0].subject == "last Anastasis donation");

  let txsReverse = await LibeufinNexusApi.getAnastasisTransactions(
    libeufinServices.libeufinNexus,
    anastasisBaseUrl,
    {delta: -5, start: 4},
    user01nexus.userReq.username,
    user01nexus.userReq.password,
  );
  t.assertTrue(txsReverse.data.incoming_transactions[0].row_id == 3);
  t.assertTrue(txsReverse.data.incoming_transactions[1].row_id == 2);
  t.assertTrue(txsReverse.data.incoming_transactions[2].row_id == 1);
}

runLibeufinAnastasisFacadeTest.suites = ["libeufin"];
