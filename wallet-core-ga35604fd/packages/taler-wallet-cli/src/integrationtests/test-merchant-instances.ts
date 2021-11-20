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
 * Do basic checks on instance management and authentication.
 */
export async function runMerchantInstancesTest(t: GlobalTestState) {
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

  {
    const r = await merchantClient.getInstances();
    t.assertDeepEqual(r.instances.length, 2);
  }

  // Check that a "malformed" bearer Authorization header gets ignored
  {
    const url = merchant.makeInstanceBaseUrl();
    const resp = await axios.get(new URL("management/instances", url).href, {
      headers: {
        Authorization: "foo bar-baz",
      },
    });
    t.assertDeepEqual(resp.status, 200);
  }

  {
    const fullDetails = await merchantClient.getInstanceFullDetails("default");
    t.assertDeepEqual(fullDetails.auth.method, "external");
  }

  await merchantClient.changeAuth({
    method: "token",
    token: "secret-token:foobar",
  });

  // Now this should fail, as we didn't change the auth of the client yet.
  const exc = await t.assertThrowsAsync(async () => {
    console.log("requesting instances with auth", merchantClient.auth);
    const resp = await merchantClient.getInstances();
    console.log("instances result:", resp);
  });

  console.log(exc);

  t.assertAxiosError(exc);
  t.assertTrue(exc.response?.status === 401);

  merchantClient = new MerchantApiClient(merchant.makeInstanceBaseUrl(), {
    method: "token",
    token: "secret-token:foobar",
  });

  // With the new client auth settings, request should work again.
  await merchantClient.getInstances();

  // Now, try some variations.
  {
    const url = merchant.makeInstanceBaseUrl();
    const resp = await axios.get(new URL("management/instances", url).href, {
      headers: {
        // Note the spaces
        Authorization: "Bearer     secret-token:foobar",
      },
    });
    t.assertDeepEqual(resp.status, 200);
  }

  // Check that auth is reported properly
  {
    const fullDetails = await merchantClient.getInstanceFullDetails("default");
    t.assertDeepEqual(fullDetails.auth.method, "token");
    // Token should *not* be reported back.
    t.assertDeepEqual(fullDetails.auth.token, undefined);
  }

  // Check that deleting an instance checks the auth
  // of the default instance.
  {
    const unauthMerchantClient = new MerchantApiClient(
      merchant.makeInstanceBaseUrl(),
      {
        method: "external",
      },
    );

    const exc = await t.assertThrowsAsync(async () => {
      await unauthMerchantClient.deleteInstance("myinst");
    });
    console.log(exc);
    t.assertAxiosError(exc);
    t.assertDeepEqual(exc.response?.status, 401);
  }
}

runMerchantInstancesTest.suites = ["merchant"];
