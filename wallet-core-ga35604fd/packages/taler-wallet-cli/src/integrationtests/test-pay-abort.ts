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
 * Fault injection test to check aborting partial payment
 * via refunds.
 */

/**
 * Imports.
 */
import { URL, PreparePayResultType, TalerErrorCode } from "@gnu-taler/taler-util";
import { WalletApiOperation } from "@gnu-taler/taler-wallet-core";
import {
  FaultInjectionRequestContext,
  FaultInjectionResponseContext,
} from "../harness/faultInjection";
import { GlobalTestState, MerchantPrivateApi, setupDb } from "../harness/harness.js";
import {
  createFaultInjectedMerchantTestkudosEnvironment,
  withdrawViaBank,
} from "../harness/helpers.js";

/**
 * Run test for basic, bank-integrated withdrawal.
 */
export async function runPayAbortTest(t: GlobalTestState) {
  const {
    bank,
    faultyExchange,
    wallet,
    faultyMerchant,
  } = await createFaultInjectedMerchantTestkudosEnvironment(t);
  // Set up test environment

  await withdrawViaBank(t, {
    wallet,
    exchange: faultyExchange,
    amount: "TESTKUDOS:20",
    bank,
  });

  const orderResp = await MerchantPrivateApi.createOrder(
    faultyMerchant,
    "default",
    {
      order: {
        summary: "Buy me!",
        amount: "TESTKUDOS:15",
        fulfillment_url: "taler://fulfillment-success/thx",
      },
    },
  );

  let orderStatus = await MerchantPrivateApi.queryPrivateOrderStatus(
    faultyMerchant,
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

  // We let only the first deposit through!
  let firstDepositUrl: string | undefined;

  faultyExchange.faultProxy.addFault({
    async modifyRequest(ctx: FaultInjectionRequestContext) {
      const url = new URL(ctx.requestUrl);
      if (url.pathname.endsWith("/deposit")) {
        if (!firstDepositUrl) {
          firstDepositUrl = url.href;
          return;
        }
        if (url.href != firstDepositUrl) {
          url.pathname = "/doesntexist";
          ctx.requestUrl = url.href;
        }
      }
    },
    async modifyResponse(ctx: FaultInjectionResponseContext) {
      const url = new URL(ctx.request.requestUrl);
      if (url.pathname.endsWith("/deposit") && url.href != firstDepositUrl) {
        ctx.responseBody = Buffer.from("{}");
        ctx.statusCode = 500;
      }
    },
  });

  faultyMerchant.faultProxy.addFault({
    async modifyResponse(ctx: FaultInjectionResponseContext) {
      const url = new URL(ctx.request.requestUrl);
      if (url.pathname.endsWith("/pay") && url.href != firstDepositUrl) {
        ctx.responseBody = Buffer.from("{}");
        ctx.statusCode = 400;
      }
    },
  });

  await t.assertThrowsOperationErrorAsync(async () => {
    await wallet.client.call(WalletApiOperation.ConfirmPay, {
      proposalId: preparePayResult.proposalId,
    });
  });

  let txr = await wallet.client.call(WalletApiOperation.GetTransactions, {});
  console.log(JSON.stringify(txr, undefined, 2));

  t.assertDeepEqual(txr.transactions[1].type, "payment");
  t.assertDeepEqual(txr.transactions[1].pending, true);
  t.assertDeepEqual(
    txr.transactions[1].error?.code,
    TalerErrorCode.WALLET_RECEIVED_MALFORMED_RESPONSE,
  );

  await wallet.client.call(WalletApiOperation.AbortFailedPayWithRefund, {
    proposalId: preparePayResult.proposalId,
  });

  await wallet.runUntilDone();

  txr = await wallet.client.call(WalletApiOperation.GetTransactions, {});
  console.log(JSON.stringify(txr, undefined, 2));

  const txTypes = txr.transactions.map((x) => x.type);

  t.assertDeepEqual(txTypes, ["withdrawal", "payment", "refund"]);
}

runPayAbortTest.suites = ["wallet"];
