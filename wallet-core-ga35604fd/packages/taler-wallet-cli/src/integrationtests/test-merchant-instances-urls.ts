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
export async function runMerchantInstancesUrlsTest(t: GlobalTestState) {
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

  merchant.addExchange(exchange);

  await merchant.start();
  await merchant.pingUntilAvailable();

  const clientForDefault = new MerchantApiClient(
    merchant.makeInstanceBaseUrl(),
    {
      method: "token",
      token: "secret-token:i-am-default",
    },
  );

  await clientForDefault.createInstance({
    id: "default",
    address: {},
    default_max_deposit_fee: "TESTKUDOS:1",
    default_max_wire_fee: "TESTKUDOS:1",
    default_pay_delay: { d_ms: 60000 },
    default_wire_fee_amortization: 1,
    default_wire_transfer_delay: { d_ms: 60000 },
    jurisdiction: {},
    name: "My Default Instance",
    payto_uris: [getPayto("bar")],
    auth: {
      method: "token",
      token: "secret-token:i-am-default",
    },
  });

  await clientForDefault.createInstance({
    id: "myinst",
    address: {},
    default_max_deposit_fee: "TESTKUDOS:1",
    default_max_wire_fee: "TESTKUDOS:1",
    default_pay_delay: { d_ms: 60000 },
    default_wire_fee_amortization: 1,
    default_wire_transfer_delay: { d_ms: 60000 },
    jurisdiction: {},
    name: "My Second Instance",
    payto_uris: [getPayto("bar")],
    auth: {
      method: "token",
      token: "secret-token:i-am-myinst",
    },
  });

  async function check(url: string, token: string, expectedStatus: number) {
    const resp = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      validateStatus: () => true,
    });
    console.log(
      `checking ${url}, expected ${expectedStatus}, got ${resp.status}`,
    );
    t.assertDeepEqual(resp.status, expectedStatus);
  }

  const tokDefault = "secret-token:i-am-default";

  const defaultBaseUrl = merchant.makeInstanceBaseUrl();

  await check(
    `${defaultBaseUrl}private/instances/default/instances/default/config`,
    tokDefault,
    404,
  );

  // Instance management is only available when accessing the default instance
  // directly.
  await check(
    `${defaultBaseUrl}instances/default/private/instances`,
    "foo",
    404,
  );

  // Non-default instances don't allow instance management.
  await check(`${defaultBaseUrl}instances/foo/private/instances`, "foo", 404);
  await check(
    `${defaultBaseUrl}instances/myinst/private/instances`,
    "foo",
    404,
  );

  await check(`${defaultBaseUrl}config`, "foo", 200);
  await check(`${defaultBaseUrl}instances/default/config`, "foo", 200);
  await check(`${defaultBaseUrl}instances/myinst/config`, "foo", 200);
  await check(`${defaultBaseUrl}instances/foo/config`, "foo", 404);
  await check(
    `${defaultBaseUrl}instances/default/instances/config`,
    "foo",
    404,
  );

  await check(
    `${defaultBaseUrl}private/instances/myinst/config`,
    tokDefault,
    404,
  );

  await check(
    `${defaultBaseUrl}instances/myinst/private/orders`,
    tokDefault,
    401,
  );

  await check(
    `${defaultBaseUrl}instances/myinst/private/orders`,
    tokDefault,
    401,
  );

  await check(
    `${defaultBaseUrl}instances/myinst/private/orders`,
    "secret-token:i-am-myinst",
    200,
  );

  await check(
    `${defaultBaseUrl}private/instances/myinst/orders`,
    tokDefault,
    404,
  );
}

runMerchantInstancesUrlsTest.suites = ["merchant"];
