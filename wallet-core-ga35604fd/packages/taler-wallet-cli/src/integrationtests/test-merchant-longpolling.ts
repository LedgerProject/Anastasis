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
import {
  PreparePayResultType,
  codecForMerchantOrderStatusUnpaid,
  ConfirmPayResultType,
  URL,
} from "@gnu-taler/taler-util";
import axios from "axios";
import { WalletApiOperation } from "@gnu-taler/taler-wallet-core";

/**
 * Run test for basic, bank-integrated withdrawal.
 */
export async function runMerchantLongpollingTest(t: GlobalTestState) {
  // Set up test environment

  const {
    wallet,
    bank,
    exchange,
    merchant,
  } = await createSimpleTestkudosEnvironment(t);

  // Withdraw digital cash into the wallet.

  await withdrawViaBank(t, { wallet, bank, exchange, amount: "TESTKUDOS:20" });

  /**
   * =========================================================================
   * Create an order and let the wallet pay under a session ID
   *
   * We check along the way that the JSON response to /orders/{order_id}
   * returns the right thing.
   * =========================================================================
   */

  let orderResp = await MerchantPrivateApi.createOrder(merchant, "default", {
    order: {
      summary: "Buy me!",
      amount: "TESTKUDOS:5",
      fulfillment_url: "https://example.com/article42",
    },
    create_token: false,
  });

  let orderStatus = await MerchantPrivateApi.queryPrivateOrderStatus(merchant, {
    orderId: orderResp.order_id,
    sessionId: "mysession-one",
  });

  t.assertTrue(orderStatus.order_status === "unpaid");

  t.assertTrue(orderStatus.already_paid_order_id === undefined);
  let publicOrderStatusUrl = new URL(orderStatus.order_status_url);

  // First, request order status without longpolling
  {
    console.log("requesting", publicOrderStatusUrl.href);
    let publicOrderStatusResp = await axios.get(publicOrderStatusUrl.href, {
      validateStatus: () => true,
    });

    if (publicOrderStatusResp.status != 402) {
      throw Error(
        `expected status 402 (before claiming, no long polling), but got ${publicOrderStatusResp.status}`,
      );
    }
  }

  // Now do long-polling for half a second!
  publicOrderStatusUrl.searchParams.set("timeout_ms", "500");

  console.log("requesting", publicOrderStatusUrl.href);
  let publicOrderStatusResp = await axios.get(publicOrderStatusUrl.href, {
    validateStatus: () => true,
  });

  if (publicOrderStatusResp.status != 402) {
    throw Error(
      `expected status 402 (before claiming, with long-polling), but got ${publicOrderStatusResp.status}`,
    );
  }

  let pubUnpaidStatus = codecForMerchantOrderStatusUnpaid().decode(
    publicOrderStatusResp.data,
  );

  console.log(pubUnpaidStatus);

  /**
   * =========================================================================
   * Now actually pay, but WHILE a long poll is active!
   * =========================================================================
   */

  let preparePayResp = await wallet.client.call(
    WalletApiOperation.PreparePayForUri,
    {
      talerPayUri: pubUnpaidStatus.taler_pay_uri,
    },
  );

  t.assertTrue(preparePayResp.status === PreparePayResultType.PaymentPossible);

  publicOrderStatusUrl.searchParams.set("timeout_ms", "5000");
  publicOrderStatusUrl.searchParams.set(
    "h_contract",
    preparePayResp.contractTermsHash,
  );

  let publicOrderStatusPromise = axios.get(publicOrderStatusUrl.href, {
    validateStatus: () => true,
  });

  t.assertTrue(preparePayResp.status === PreparePayResultType.PaymentPossible);

  const proposalId = preparePayResp.proposalId;

  publicOrderStatusResp = await publicOrderStatusPromise;

  if (publicOrderStatusResp.status != 402) {
    throw Error(
      `expected status 402 (after claiming), but got ${publicOrderStatusResp.status}`,
    );
  }

  pubUnpaidStatus = codecForMerchantOrderStatusUnpaid().decode(
    publicOrderStatusResp.data,
  );

  const confirmPayRes = await wallet.client.call(
    WalletApiOperation.ConfirmPay,
    {
      proposalId: proposalId,
    },
  );

  t.assertTrue(confirmPayRes.type === ConfirmPayResultType.Done);
}

runMerchantLongpollingTest.suites = ["merchant"];
