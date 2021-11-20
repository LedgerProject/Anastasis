/*
 This file is part of GNU Taler
 (C) 2021 Taler Systems S.A.

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
import { URL } from "@gnu-taler/taler-util";
import axios from "axios";
import {
  ExchangeService,
  GlobalTestState,
  MerchantApiClient,
  MerchantService,
  setupDb,
  getPayto
} from "../harness/harness.js";

/**
 * Test instance deletion and authentication for it
 */
export async function runMerchantInstancesDeleteTest(t: GlobalTestState) {
  // Set up test environment

  const db = await setupDb(t);

  const exchange = ExchangeService.create(t, {
    name: "testexchange-1",
    currency: "TESTKUDOS",
    httpPort: 8081,
    database: db.connStr,
  });

  const merchant = await MerchantService.create(t, {
    name: "testmerchant-1",
    currency: "TESTKUDOS",
    httpPort: 8083,
    database: db.connStr,
  });

  // We add the exchange to the config, but note that the exchange won't be started.
  merchant.addExchange(exchange);

  await merchant.start();
  await merchant.pingUntilAvailable();

  // Base URL for the default instance.
  const baseUrl = merchant.makeInstanceBaseUrl();

  {
    const r = await axios.get(new URL("config", baseUrl).href);
    console.log(r.data);
    t.assertDeepEqual(r.data.currency, "TESTKUDOS");
  }

  // Instances should initially be empty
  {
    const r = await axios.get(new URL("management/instances", baseUrl).href);
    t.assertDeepEqual(r.data.instances, []);
  }

  // Add an instance, no auth!
  await merchant.addInstance({
    id: "default",
    name: "Default Instance",
    paytoUris: [getPayto("merchant-default")],
    auth: {
      method: "external",
    },
  });

  // Add an instance, no auth!
  await merchant.addInstance({
    id: "myinst",
    name: "Second Instance",
    paytoUris: [getPayto("merchant-default")],
    auth: {
      method: "external",
    },
  });

  let merchantClient = new MerchantApiClient(merchant.makeInstanceBaseUrl(), {
    method: "external",
  });

  await merchantClient.changeAuth({
    method: "token",
    token: "secret-token:foobar",
  });

  merchantClient = new MerchantApiClient(merchant.makeInstanceBaseUrl(), {
    method: "token",
    token: "secret-token:foobar",
  });

  // Check that deleting an instance checks the auth
  // of the default instance.
  {
    const unauthMerchantClient = new MerchantApiClient(
      merchant.makeInstanceBaseUrl(),
      {
        method: "token",
        token: "secret-token:invalid",
      },
    );

    const exc = await t.assertThrowsAsync(async () => {
      await unauthMerchantClient.deleteInstance("myinst");
    });
    console.log("Got expected exception", exc);
    t.assertAxiosError(exc);
    t.assertDeepEqual(exc.response?.status, 401);
  }
}

runMerchantInstancesDeleteTest.suites = ["merchant"];
