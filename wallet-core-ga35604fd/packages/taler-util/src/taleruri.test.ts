/*
 This file is part of GNU Taler
 (C) 2019 GNUnet e.V.

 GNU Taler is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 GNU Taler is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 GNU Taler; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

import test from "ava";
import {
  parsePayUri,
  parseWithdrawUri,
  parseRefundUri,
  parseTipUri,
} from "./taleruri.js";

test("taler pay url parsing: wrong scheme", (t) => {
  const url1 = "talerfoo://";
  const r1 = parsePayUri(url1);
  t.is(r1, undefined);

  const url2 = "taler://refund/a/b/c/d/e/f";
  const r2 = parsePayUri(url2);
  t.is(r2, undefined);
});

test("taler pay url parsing: defaults", (t) => {
  const url1 = "taler://pay/example.com/myorder/";
  const r1 = parsePayUri(url1);
  if (!r1) {
    t.fail();
    return;
  }
  t.is(r1.merchantBaseUrl, "https://example.com/");
  t.is(r1.sessionId, "");

  const url2 = "taler://pay/example.com/myorder/mysession";
  const r2 = parsePayUri(url2);
  if (!r2) {
    t.fail();
    return;
  }
  t.is(r2.merchantBaseUrl, "https://example.com/");
  t.is(r2.sessionId, "mysession");
});

test("taler pay url parsing: instance", (t) => {
  const url1 = "taler://pay/example.com/instances/myinst/myorder/";
  const r1 = parsePayUri(url1);
  if (!r1) {
    t.fail();
    return;
  }
  t.is(r1.merchantBaseUrl, "https://example.com/instances/myinst/");
  t.is(r1.orderId, "myorder");
});

test("taler pay url parsing (claim token)", (t) => {
  const url1 = "taler://pay/example.com/instances/myinst/myorder/?c=ASDF";
  const r1 = parsePayUri(url1);
  if (!r1) {
    t.fail();
    return;
  }
  t.is(r1.merchantBaseUrl, "https://example.com/instances/myinst/");
  t.is(r1.orderId, "myorder");
  t.is(r1.claimToken, "ASDF");
});

test("taler refund uri parsing: non-https #1", (t) => {
  const url1 = "taler+http://refund/example.com/myorder/";
  const r1 = parseRefundUri(url1);
  if (!r1) {
    t.fail();
    return;
  }
  t.is(r1.merchantBaseUrl, "http://example.com/");
  t.is(r1.orderId, "myorder");
});

test("taler pay uri parsing: non-https", (t) => {
  const url1 = "taler+http://pay/example.com/myorder/";
  const r1 = parsePayUri(url1);
  if (!r1) {
    t.fail();
    return;
  }
  t.is(r1.merchantBaseUrl, "http://example.com/");
  t.is(r1.orderId, "myorder");
});

test("taler pay uri parsing: missing session component", (t) => {
  const url1 = "taler+http://pay/example.com/myorder";
  const r1 = parsePayUri(url1);
  if (r1) {
    t.fail();
    return;
  }
  t.pass();
});

test("taler withdraw uri parsing", (t) => {
  const url1 = "taler://withdraw/bank.example.com/12345";
  const r1 = parseWithdrawUri(url1);
  if (!r1) {
    t.fail();
    return;
  }
  t.is(r1.withdrawalOperationId, "12345");
  t.is(r1.bankIntegrationApiBaseUrl, "https://bank.example.com/");
});

test("taler withdraw uri parsing (http)", (t) => {
  const url1 = "taler+http://withdraw/bank.example.com/12345";
  const r1 = parseWithdrawUri(url1);
  if (!r1) {
    t.fail();
    return;
  }
  t.is(r1.withdrawalOperationId, "12345");
  t.is(r1.bankIntegrationApiBaseUrl, "http://bank.example.com/");
});

test("taler refund uri parsing", (t) => {
  const url1 = "taler://refund/merchant.example.com/1234/";
  const r1 = parseRefundUri(url1);
  if (!r1) {
    t.fail();
    return;
  }
  t.is(r1.merchantBaseUrl, "https://merchant.example.com/");
  t.is(r1.orderId, "1234");
});

test("taler refund uri parsing with instance", (t) => {
  const url1 = "taler://refund/merchant.example.com/instances/myinst/1234/";
  const r1 = parseRefundUri(url1);
  if (!r1) {
    t.fail();
    return;
  }
  t.is(r1.orderId, "1234");
  t.is(r1.merchantBaseUrl, "https://merchant.example.com/instances/myinst/");
});

test("taler tip pickup uri", (t) => {
  const url1 = "taler://tip/merchant.example.com/tipid";
  const r1 = parseTipUri(url1);
  if (!r1) {
    t.fail();
    return;
  }
  t.is(r1.merchantBaseUrl, "https://merchant.example.com/");
});

test("taler tip pickup uri with instance", (t) => {
  const url1 = "taler://tip/merchant.example.com/instances/tipm/tipid";
  const r1 = parseTipUri(url1);
  if (!r1) {
    t.fail();
    return;
  }
  t.is(r1.merchantBaseUrl, "https://merchant.example.com/instances/tipm/");
  t.is(r1.merchantTipId, "tipid");
});

test("taler tip pickup uri with instance and prefix", (t) => {
  const url1 = "taler://tip/merchant.example.com/my/pfx/tipm/tipid";
  const r1 = parseTipUri(url1);
  if (!r1) {
    t.fail();
    return;
  }
  t.is(r1.merchantBaseUrl, "https://merchant.example.com/my/pfx/tipm/");
  t.is(r1.merchantTipId, "tipid");
});
