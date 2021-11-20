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
import {
  PreparePayResultType,
  TalerErrorCode,
  TalerErrorDetails,
  TransactionType,
} from "@gnu-taler/taler-util";
import {
  WalletApiOperation,
} from "@gnu-taler/taler-wallet-core";
import { makeEventId } from "@gnu-taler/taler-wallet-core";
import { GlobalTestState, MerchantPrivateApi } from "../harness/harness.js";
import { createSimpleTestkudosEnvironment, withdrawViaBank } from "../harness/helpers.js";

export async function runDenomUnofferedTest(t: GlobalTestState) {
  // Set up test environment

  const {
    wallet,
    bank,
    exchange,
    merchant,
  } = await createSimpleTestkudosEnvironment(t);

  // Withdraw digital cash into the wallet.

  await withdrawViaBank(t, { wallet, bank, exchange, amount: "TESTKUDOS:20" });

  // Make the exchange forget the denomination.
  // Effectively we completely reset the exchange,
  // but keep the exchange master public key.

  await exchange.stop();
  await exchange.purgeDatabase();
  await exchange.purgeSecmodKeys();
  await exchange.start();
  await exchange.pingUntilAvailable();

  await merchant.stop();
  await merchant.start();
  await merchant.pingUntilAvailable();

  const order = {
    summary: "Buy me!",
    amount: "TESTKUDOS:5",
    fulfillment_url: "taler://fulfillment-success/thx",
  };

  {
    const orderResp = await MerchantPrivateApi.createOrder(
      merchant,
      "default",
      {
        order: order,
      },
    );

    let orderStatus = await MerchantPrivateApi.queryPrivateOrderStatus(
      merchant,
      {
        orderId: orderResp.order_id,
      },
    );

    t.assertTrue(orderStatus.order_status === "unpaid");

    // Make wallet pay for the order

    const preparePayResult = await wallet.client.call(
      WalletApiOperation.PreparePayForUri,
      {
        talerPayUri: orderStatus.taler_pay_uri,
      },
    );

    t.assertTrue(
      preparePayResult.status === PreparePayResultType.PaymentPossible,
    );

    const exc = await t.assertThrowsAsync(async () => {
      await wallet.client.call(WalletApiOperation.ConfirmPay, {
        proposalId: preparePayResult.proposalId,
      });
    });

    const errorDetails: TalerErrorDetails = exc.operationError;
    // FIXME: We might want a more specific error code here!
    t.assertDeepEqual(
      errorDetails.code,
      TalerErrorCode.WALLET_UNEXPECTED_REQUEST_ERROR,
    );
    const merchantErrorCode = (errorDetails.details as any).errorResponse.code;
    t.assertDeepEqual(
      merchantErrorCode,
      TalerErrorCode.MERCHANT_POST_ORDERS_ID_PAY_DENOMINATION_KEY_NOT_FOUND,
    );
  }

  await wallet.client.call(WalletApiOperation.AddExchange, {
    exchangeBaseUrl: exchange.baseUrl,
    forceUpdate: true,
  });

  // Now withdrawal should work again.
  await withdrawViaBank(t, { wallet, bank, exchange, amount: "TESTKUDOS:20" });

  await wallet.runUntilDone();

  const txs = await wallet.client.call(WalletApiOperation.GetTransactions, {});
  console.log(JSON.stringify(txs, undefined, 2));
}

runDenomUnofferedTest.suites = ["wallet"];
