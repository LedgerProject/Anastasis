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
import { durationFromSpec } from "@gnu-taler/taler-util";
import { WalletApiOperation } from "@gnu-taler/taler-wallet-core";

/**
 * Run test for basic, bank-integrated withdrawal.
 */
export async function runRefundAutoTest(t: GlobalTestState) {
  // Set up test environment

  const {
    wallet,
    bank,
    exchange,
    merchant,
  } = await createSimpleTestkudosEnvironment(t);

  // Withdraw digital cash into the wallet.

  await withdrawViaBank(t, { wallet, bank, exchange, amount: "TESTKUDOS:20" });

  // Set up order.
  const orderResp = await MerchantPrivateApi.createOrder(merchant, "default", {
    order: {
      summary: "Buy me!",
      amount: "TESTKUDOS:5",
      fulfillment_url: "taler://fulfillment-success/thx",
      auto_refund: {
        d_ms: 3000,
      },
    },
    refund_delay: durationFromSpec({ minutes: 5 }),
  });

  let orderStatus = await MerchantPrivateApi.queryPrivateOrderStatus(merchant, {
    orderId: orderResp.order_id,
  });

  t.assertTrue(orderStatus.order_status === "unpaid");

  // Make wallet pay for the order

  const r1 = await wallet.client.call(WalletApiOperation.PreparePayForUri, {
    talerPayUri: orderStatus.taler_pay_uri,
  });

  await wallet.client.call(WalletApiOperation.ConfirmPay, {
    // FIXME: should be validated, don't cast!
    proposalId: r1.proposalId,
  });

  // Check if payment was successful.

  orderStatus = await MerchantPrivateApi.queryPrivateOrderStatus(merchant, {
    orderId: orderResp.order_id,
  });

  t.assertTrue(orderStatus.order_status === "paid");

  const ref = await MerchantPrivateApi.giveRefund(merchant, {
    amount: "TESTKUDOS:5",
    instance: "default",
    justification: "foo",
    orderId: orderResp.order_id,
  });

  console.log(ref);

  // The wallet should now automatically pick up the refund.
  await wallet.runUntilDone();

  const transactions = await wallet.client.call(
    WalletApiOperation.GetTransactions,
    {},
  );
  console.log(JSON.stringify(transactions, undefined, 2));

  const transactionTypes = transactions.transactions.map((x) => x.type);
  t.assertDeepEqual(transactionTypes, ["withdrawal", "payment", "refund"]);

  await t.shutdown();
}

runRefundAutoTest.suites = ["wallet"];
