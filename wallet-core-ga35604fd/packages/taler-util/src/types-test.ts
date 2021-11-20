/*
 This file is part of TALER
 (C) 2017 Inria and GNUnet e.V.

 TALER is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 TALER is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 TALER; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

import test from "ava";
import { codecForContractTerms } from "./talerTypes.js";

test("contract terms validation", (t) => {
  const c = {
    nonce: "123123123",
    h_wire: "123",
    amount: "EUR:1.5",
    auditors: [],
    exchanges: [{ master_pub: "foo", url: "foo" }],
    fulfillment_url: "foo",
    max_fee: "EUR:1.5",
    merchant_pub: "12345",
    merchant: { name: "Foo" },
    order_id: "test_order",
    pay_deadline: { t_ms: 42 },
    wire_transfer_deadline: { t_ms: 42 },
    merchant_base_url: "https://example.com/pay",
    products: [],
    refund_deadline: { t_ms: 42 },
    summary: "hello",
    timestamp: { t_ms: 42 },
    wire_method: "test",
  };

  codecForContractTerms().decode(c);

  const c1 = JSON.parse(JSON.stringify(c));
  c1.pay_deadline = "foo";

  try {
    codecForContractTerms().decode(c1);
  } catch (e) {
    t.pass();
    return;
  }

  t.fail();
});

test("contract terms validation (locations)", (t) => {
  const c = {
    nonce: "123123123",
    h_wire: "123",
    amount: "EUR:1.5",
    auditors: [],
    exchanges: [{ master_pub: "foo", url: "foo" }],
    fulfillment_url: "foo",
    max_fee: "EUR:1.5",
    merchant_pub: "12345",
    merchant: {
      name: "Foo",
      address: {
        country: "DE",
      },
    },
    order_id: "test_order",
    pay_deadline: { t_ms: 42 },
    wire_transfer_deadline: { t_ms: 42 },
    merchant_base_url: "https://example.com/pay",
    products: [],
    refund_deadline: { t_ms: 42 },
    summary: "hello",
    timestamp: { t_ms: 42 },
    wire_method: "test",
    delivery_location: {
      country: "FR",
      town: "Rennes",
    },
  };

  const r = codecForContractTerms().decode(c);

  t.assert(r.merchant.address?.country === "DE");
  t.assert(r.delivery_location?.country === "FR");
  t.assert(r.delivery_location?.town === "Rennes");
});
