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
import {
  withdrawViaBank,
  createFaultInjectedMerchantTestkudosEnvironment,
} from "../harness/helpers.js";
import axios from "axios";
import {
  FaultInjectionRequestContext,
  FaultInjectionResponseContext,
} from "../harness/faultInjection";
import {
  codecForMerchantOrderStatusUnpaid,
  ConfirmPayResultType,
  PreparePayResultType,
  TalerErrorCode,
  TalerErrorDetails,
  URL,
} from "@gnu-taler/taler-util";
import { WalletApiOperation } from "@gnu-taler/taler-wallet-core";

/**
 * Run test for a payment where the merchant has a transient
 * failure in /pay
 */
export async function runPaymentTransientTest(t: GlobalTestState) {
  // Set up test environment

  const {
    wallet,
    bank,
    exchange,
    faultyMerchant,
  } = await createFaultInjectedMerchantTestkudosEnvironment(t);

  // Withdraw digital cash into the wallet.

  await withdrawViaBank(t, { wallet, bank, exchange, amount: "TESTKUDOS:20" });

  const merchant = faultyMerchant;

  let orderResp = await MerchantPrivateApi.createOrder(merchant, "default", {
    order: {
      summary: "Buy me!",
      amount: "TESTKUDOS:5",
      fulfillment_url: "https://example.com/article42",
      public_reorder_url: "https://example.com/article42-share",
    },
  });

  let orderStatus = await MerchantPrivateApi.queryPrivateOrderStatus(merchant, {
    orderId: orderResp.order_id,
    sessionId: "mysession-one",
  });

  t.assertTrue(orderStatus.order_status === "unpaid");

  t.assertTrue(orderStatus.already_paid_order_id === undefined);
  let publicOrderStatusUrl = orderStatus.order_status_url;

  let publicOrderStatusResp = await axios.get(publicOrderStatusUrl, {
    validateStatus: () => true,
  });

  if (publicOrderStatusResp.status != 402) {


    throw Error(
      `expected status 402 (before claiming), but got ${publicOrderStatusResp.status}`,
    );
  }

  let pubUnpaidStatus = codecForMerchantOrderStatusUnpaid().decode(
    publicOrderStatusResp.data,
  );

  console.log(pubUnpaidStatus);

  let preparePayResp = await wallet.client.call(
    WalletApiOperation.PreparePayForUri,
    {
      talerPayUri: pubUnpaidStatus.taler_pay_uri,
    },
  );

  t.assertTrue(preparePayResp.status === PreparePayResultType.PaymentPossible);

  const proposalId = preparePayResp.proposalId;

  publicOrderStatusResp = await axios.get(publicOrderStatusUrl, {
    validateStatus: () => true,
  });

  if (publicOrderStatusResp.status != 402) {
    throw Error(
      `expected status 402 (after claiming), but got ${publicOrderStatusResp.status}`,
    );
  }

  pubUnpaidStatus = codecForMerchantOrderStatusUnpaid().decode(
    publicOrderStatusResp.data,
  );

  let faultInjected = false;

  faultyMerchant.faultProxy.addFault({
    async modifyResponse(ctx: FaultInjectionResponseContext) {
      console.log("in modifyResponse");
      const url = new URL(ctx.request.requestUrl);
      console.log("pathname is", url.pathname);
      if (!url.pathname.endsWith("/pay")) {
        return;
      }
      if (faultInjected) {
        console.log("not injecting pay fault");
        return;
      }
      faultInjected = true;
      console.log("injecting pay fault");
      const err: TalerErrorDetails = {
        code: TalerErrorCode.GENERIC_DB_COMMIT_FAILED,
        details: {},
        hint: "huh",
        message: "something went wrong",
      };
      ctx.responseBody = Buffer.from(JSON.stringify(err));
      ctx.statusCode = 500;
    },
  });

  const confirmPayResp = await wallet.client.call(
    WalletApiOperation.ConfirmPay,
    {
      proposalId,
    },
  );

  console.log(confirmPayResp);

  t.assertTrue(confirmPayResp.type === ConfirmPayResultType.Pending);
  t.assertTrue(faultInjected);

  const confirmPayRespTwo = await wallet.client.call(
    WalletApiOperation.ConfirmPay,
    {
      proposalId,
    },
  );

  t.assertTrue(confirmPayRespTwo.type === ConfirmPayResultType.Done);

  // Now ask the merchant if paid

  console.log("requesting", publicOrderStatusUrl);
  publicOrderStatusResp = await axios.get(publicOrderStatusUrl, {
    validateStatus: () => true,
  });

  console.log(publicOrderStatusResp.data);

  if (publicOrderStatusResp.status != 200) {
    console.log(publicOrderStatusResp.data);
    throw Error(
      `expected status 200 (after paying), but got ${publicOrderStatusResp.status}`,
    );
  }
}

runPaymentTransientTest.suites = ["wallet"];
