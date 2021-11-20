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
import { PreparePayResultType } from "@gnu-taler/taler-util";
import { WalletApiOperation } from "@gnu-taler/taler-wallet-core";

/**
 * Test the wallet-core payment API, especially that repeated operations
 * return the expected result.
 */
export async function runPaymentIdempotencyTest(t: GlobalTestState) {
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
    },
  });

  let orderStatus = await MerchantPrivateApi.queryPrivateOrderStatus(merchant, {
    orderId: orderResp.order_id,
  });

  t.assertTrue(orderStatus.order_status === "unpaid");

  const talerPayUri = orderStatus.taler_pay_uri;

  // Make wallet pay for the order

  const preparePayResult = await wallet.client.call(
    WalletApiOperation.PreparePayForUri,
    {
      talerPayUri: orderStatus.taler_pay_uri,
    },
  );

  const preparePayResultRep = await wallet.client.call(
    WalletApiOperation.PreparePayForUri,
    {
      talerPayUri: orderStatus.taler_pay_uri,
    },
  );

  t.assertTrue(
    preparePayResult.status === PreparePayResultType.PaymentPossible,
  );
  t.assertTrue(
    preparePayResultRep.status === PreparePayResultType.PaymentPossible,
  );

  const proposalId = preparePayResult.proposalId;

  await wallet.client.call(WalletApiOperation.ConfirmPay, {
    // FIXME: should be validated, don't cast!
    proposalId: proposalId,
  });

  // Check if payment was successful.

  orderStatus = await MerchantPrivateApi.queryPrivateOrderStatus(merchant, {
    orderId: orderResp.order_id,
  });

  t.assertTrue(orderStatus.order_status === "paid");

  const preparePayResultAfter = await wallet.client.call(
    WalletApiOperation.PreparePayForUri,
    {
      talerPayUri,
    },
  );

  t.assertTrue(
    preparePayResultAfter.status === PreparePayResultType.AlreadyConfirmed,
  );
  t.assertTrue(preparePayResultAfter.paid === true);

  await t.shutdown();
}

runPaymentIdempotencyTest.suites = ["wallet"];
