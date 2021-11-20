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
import { GlobalTestState, MerchantPrivateApi } from "../harness/harness.js";
import { createSimpleTestkudosEnvironment, withdrawViaBank } from "../harness/helpers.js";
import { URL } from "url";
import { WalletApiOperation } from "@gnu-taler/taler-wallet-core";

/**
 * Run test for the merchant's order lifecycle.
 *
 * FIXME: Is this test still necessary?  We initially wrote if to confirm/document
 * assumptions about how the merchant should work.
 */
export async function runClaimLoopTest(t: GlobalTestState) {
  // Set up test environment

  const {
    wallet,
    bank,
    exchange,
    merchant,
  } = await createSimpleTestkudosEnvironment(t);

  await withdrawViaBank(t, { wallet, bank, exchange, amount: "TESTKUDOS:20" });

  // Set up order.
  const orderResp = await MerchantPrivateApi.createOrder(merchant, "default", {
    order: {
      summary: "Buy me!",
      amount: "TESTKUDOS:5",
      fulfillment_url: "taler://fulfillment-success/thx",
    },
  });

  // Query private order status before claiming it.
  let orderStatusBefore = await MerchantPrivateApi.queryPrivateOrderStatus(
    merchant,
    {
      orderId: orderResp.order_id,
    },
  );
  t.assertTrue(orderStatusBefore.order_status === "unpaid");
  let statusUrlBefore = new URL(orderStatusBefore.order_status_url);

  // Make wallet claim the unpaid order.
  t.assertTrue(orderStatusBefore.order_status === "unpaid");
  const talerPayUri = orderStatusBefore.taler_pay_uri;
  await wallet.client.call(WalletApiOperation.PreparePayForUri, {
    talerPayUri,
  });

  // Query private order status after claiming it.
  let orderStatusAfter = await MerchantPrivateApi.queryPrivateOrderStatus(
    merchant,
    {
      orderId: orderResp.order_id,
    },
  );
  t.assertTrue(orderStatusAfter.order_status === "claimed");

  await t.shutdown();
}
