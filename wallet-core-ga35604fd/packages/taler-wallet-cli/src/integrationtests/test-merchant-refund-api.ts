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
import {
  GlobalTestState,
  MerchantPrivateApi,
  BankServiceInterface,
  MerchantServiceInterface,
  WalletCli,
  ExchangeServiceInterface,
} from "../harness/harness.js";
import { createSimpleTestkudosEnvironment, withdrawViaBank } from "../harness/helpers.js";
import {
  URL,
  durationFromSpec,
  PreparePayResultType,
} from "@gnu-taler/taler-util";
import axios from "axios";
import { WalletApiOperation } from "@gnu-taler/taler-wallet-core";

async function testRefundApiWithFulfillmentUrl(
  t: GlobalTestState,
  env: {
    merchant: MerchantServiceInterface;
    bank: BankServiceInterface;
    wallet: WalletCli;
    exchange: ExchangeServiceInterface;
  },
): Promise<void> {
  const { wallet, bank, exchange, merchant } = env;

  // Set up order.
  const orderResp = await MerchantPrivateApi.createOrder(merchant, "default", {
    order: {
      summary: "Buy me!",
      amount: "TESTKUDOS:5",
      fulfillment_url: "https://example.com/fulfillment",
    },
    refund_delay: durationFromSpec({ minutes: 5 }),
  });

  let orderStatus = await MerchantPrivateApi.queryPrivateOrderStatus(merchant, {
    orderId: orderResp.order_id,
  });

  t.assertTrue(orderStatus.order_status === "unpaid");

  const talerPayUri = orderStatus.taler_pay_uri;
  const orderId = orderResp.order_id;

  // Make wallet pay for the order

  let preparePayResult = await wallet.client.call(
    WalletApiOperation.PreparePayForUri,
    {
      talerPayUri,
    },
  );

  t.assertTrue(
    preparePayResult.status === PreparePayResultType.PaymentPossible,
  );

  await wallet.client.call(WalletApiOperation.ConfirmPay, {
    proposalId: preparePayResult.proposalId,
  });

  // Check if payment was successful.

  orderStatus = await MerchantPrivateApi.queryPrivateOrderStatus(merchant, {
    orderId: orderResp.order_id,
  });

  t.assertTrue(orderStatus.order_status === "paid");

  preparePayResult = await wallet.client.call(
    WalletApiOperation.PreparePayForUri,
    {
      talerPayUri,
    },
  );

  t.assertTrue(
    preparePayResult.status === PreparePayResultType.AlreadyConfirmed,
  );

  await MerchantPrivateApi.giveRefund(merchant, {
    amount: "TESTKUDOS:5",
    instance: "default",
    justification: "foo",
    orderId: orderResp.order_id,
  });

  orderStatus = await MerchantPrivateApi.queryPrivateOrderStatus(merchant, {
    orderId: orderResp.order_id,
  });

  t.assertTrue(orderStatus.order_status === "paid");

  t.assertAmountEquals(orderStatus.refund_amount, "TESTKUDOS:5");

  // Now test what the merchant gives as a response for various requests to the
  // public order status URL!

  let publicOrderStatusUrl = new URL(
    `orders/${orderId}`,
    merchant.makeInstanceBaseUrl(),
  );
  publicOrderStatusUrl.searchParams.set(
    "h_contract",
    preparePayResult.contractTermsHash,
  );

  let publicOrderStatusResp = await axios.get(publicOrderStatusUrl.href, {
    validateStatus: () => true,
  });
  console.log(publicOrderStatusResp.data);
  t.assertTrue(publicOrderStatusResp.status === 200);
  t.assertAmountEquals(publicOrderStatusResp.data.refund_amount, "TESTKUDOS:5");

  publicOrderStatusUrl = new URL(
    `orders/${orderId}`,
    merchant.makeInstanceBaseUrl(),
  );
  console.log(`requesting order status via '${publicOrderStatusUrl.href}'`);
  publicOrderStatusResp = await axios.get(publicOrderStatusUrl.href, {
    validateStatus: () => true,
  });
  console.log(publicOrderStatusResp.status);
  console.log(publicOrderStatusResp.data);
  // We didn't give any authentication, so we should get a fulfillment URL back
  t.assertTrue(publicOrderStatusResp.status === 403);
}

async function testRefundApiWithFulfillmentMessage(
  t: GlobalTestState,
  env: {
    merchant: MerchantServiceInterface;
    bank: BankServiceInterface;
    wallet: WalletCli;
    exchange: ExchangeServiceInterface;
  },
): Promise<void> {
  const { wallet, bank, exchange, merchant } = env;

  // Set up order.
  const orderResp = await MerchantPrivateApi.createOrder(merchant, "default", {
    order: {
      summary: "Buy me!",
      amount: "TESTKUDOS:5",
      fulfillment_message: "Thank you for buying foobar",
    },
    refund_delay: durationFromSpec({ minutes: 5 }),
  });

  let orderStatus = await MerchantPrivateApi.queryPrivateOrderStatus(merchant, {
    orderId: orderResp.order_id,
  });

  t.assertTrue(orderStatus.order_status === "unpaid");

  const talerPayUri = orderStatus.taler_pay_uri;
  const orderId = orderResp.order_id;

  // Make wallet pay for the order

  let preparePayResult = await wallet.client.call(
    WalletApiOperation.PreparePayForUri,
    {
      talerPayUri,
    },
  );

  t.assertTrue(
    preparePayResult.status === PreparePayResultType.PaymentPossible,
  );

  await wallet.client.call(WalletApiOperation.ConfirmPay, {
    proposalId: preparePayResult.proposalId,
  });

  // Check if payment was successful.

  orderStatus = await MerchantPrivateApi.queryPrivateOrderStatus(merchant, {
    orderId: orderResp.order_id,
  });

  t.assertTrue(orderStatus.order_status === "paid");

  preparePayResult = await wallet.client.call(
    WalletApiOperation.PreparePayForUri,
    {
      talerPayUri,
    },
  );

  t.assertTrue(
    preparePayResult.status === PreparePayResultType.AlreadyConfirmed,
  );

  await MerchantPrivateApi.giveRefund(merchant, {
    amount: "TESTKUDOS:5",
    instance: "default",
    justification: "foo",
    orderId: orderResp.order_id,
  });

  orderStatus = await MerchantPrivateApi.queryPrivateOrderStatus(merchant, {
    orderId: orderResp.order_id,
  });

  t.assertTrue(orderStatus.order_status === "paid");

  t.assertAmountEquals(orderStatus.refund_amount, "TESTKUDOS:5");

  // Now test what the merchant gives as a response for various requests to the
  // public order status URL!

  let publicOrderStatusUrl = new URL(
    `orders/${orderId}`,
    merchant.makeInstanceBaseUrl(),
  );
  publicOrderStatusUrl.searchParams.set(
    "h_contract",
    preparePayResult.contractTermsHash,
  );

  let publicOrderStatusResp = await axios.get(publicOrderStatusUrl.href, {
    validateStatus: () => true,
  });
  console.log(publicOrderStatusResp.data);
  t.assertTrue(publicOrderStatusResp.status === 200);
  t.assertAmountEquals(publicOrderStatusResp.data.refund_amount, "TESTKUDOS:5");

  publicOrderStatusUrl = new URL(
    `orders/${orderId}`,
    merchant.makeInstanceBaseUrl(),
  );

  publicOrderStatusResp = await axios.get(publicOrderStatusUrl.href, {
    validateStatus: () => true,
  });
  console.log(publicOrderStatusResp.data);
  // We didn't give any authentication, so we should get a fulfillment URL back
  t.assertTrue(publicOrderStatusResp.status === 403);
}

/**
 * Test case for the refund API of the merchant backend.
 */
export async function runMerchantRefundApiTest(t: GlobalTestState) {
  // Set up test environment

  const {
    wallet,
    bank,
    exchange,
    merchant,
  } = await createSimpleTestkudosEnvironment(t);

  // Withdraw digital cash into the wallet.

  await withdrawViaBank(t, { wallet, bank, exchange, amount: "TESTKUDOS:20" });

  await testRefundApiWithFulfillmentUrl(t, {
    wallet,
    bank,
    exchange,
    merchant,
  });

  await testRefundApiWithFulfillmentMessage(t, {
    wallet,
    bank,
    exchange,
    merchant,
  });
}

runMerchantRefundApiTest.suites = ["merchant"];
