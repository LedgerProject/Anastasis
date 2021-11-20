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
import { GlobalTestState, MerchantPrivateApi, WalletCli } from "../harness/harness.js";
import { createSimpleTestkudosEnvironment, withdrawViaBank } from "../harness/helpers.js";
import { PreparePayResultType } from "@gnu-taler/taler-util";
import { TalerErrorCode } from "@gnu-taler/taler-util";
import { WalletApiOperation } from "@gnu-taler/taler-wallet-core";

/**
 * Run test for basic, bank-integrated withdrawal.
 */
export async function runPaymentClaimTest(t: GlobalTestState) {
  // Set up test environment

  const {
    wallet,
    bank,
    exchange,
    merchant,
  } = await createSimpleTestkudosEnvironment(t);

  const walletTwo = new WalletCli(t, "two");

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
      talerPayUri,
    },
  );

  t.assertTrue(
    preparePayResult.status === PreparePayResultType.PaymentPossible,
  );

  t.assertThrowsOperationErrorAsync(async () => {
    await walletTwo.client.call(WalletApiOperation.PreparePayForUri, {
      talerPayUri,
    });
  });

  await wallet.client.call(WalletApiOperation.ConfirmPay, {
    proposalId: preparePayResult.proposalId,
  });

  // Check if payment was successful.

  orderStatus = await MerchantPrivateApi.queryPrivateOrderStatus(merchant, {
    orderId: orderResp.order_id,
  });

  t.assertTrue(orderStatus.order_status === "paid");

  walletTwo.deleteDatabase();

  const err = await t.assertThrowsOperationErrorAsync(async () => {
    await walletTwo.client.call(WalletApiOperation.PreparePayForUri, {
      talerPayUri,
    });
  });

  t.assertTrue(
    err.operationError.code === TalerErrorCode.WALLET_ORDER_ALREADY_CLAIMED,
  );

  await t.shutdown();
}

runPaymentClaimTest.suites = ["wallet"];
