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
  BankService,
  ExchangeService,
  GlobalTestState,
  MerchantPrivateApi,
  MerchantService,
  setupDb,
  WalletCli,
  getPayto
} from "../harness/harness.js";
import {
  withdrawViaBank,
  createFaultInjectedMerchantTestkudosEnvironment,
  FaultyMerchantTestEnvironment,
} from "../harness/helpers.js";
import {
  PreparePayResultType,
  codecForMerchantOrderStatusUnpaid,
  ConfirmPayResultType,
} from "@gnu-taler/taler-util";
import axios from "axios";
import {
  FaultInjectedExchangeService,
  FaultInjectedMerchantService,
  FaultInjectionRequestContext,
} from "../harness/faultInjection";
import { defaultCoinConfig } from "../harness/denomStructures";
import { WalletApiOperation } from "@gnu-taler/taler-wallet-core";
import { URL } from "url";

/**
 * Run a test case with a simple TESTKUDOS Taler environment, consisting
 * of one exchange, one bank and one merchant.
 */
export async function createConfusedMerchantTestkudosEnvironment(
  t: GlobalTestState,
): Promise<FaultyMerchantTestEnvironment> {
  const db = await setupDb(t);

  const bank = await BankService.create(t, {
    allowRegistrations: true,
    currency: "TESTKUDOS",
    database: db.connStr,
    httpPort: 8082,
  });

  const exchange = ExchangeService.create(t, {
    name: "testexchange-1",
    currency: "TESTKUDOS",
    httpPort: 8081,
    database: db.connStr,
  });

  const merchant = await MerchantService.create(t, {
    name: "testmerchant-1",
    currency: "TESTKUDOS",
    httpPort: 8083,
    database: db.connStr,
  });

  const faultyMerchant = new FaultInjectedMerchantService(t, merchant, 9083);
  const faultyExchange = new FaultInjectedExchangeService(t, exchange, 9081);

  const exchangeBankAccount = await bank.createExchangeAccount(
    "myexchange",
    "x",
  );
  exchange.addBankAccount("1", exchangeBankAccount);

  bank.setSuggestedExchange(
    faultyExchange,
    exchangeBankAccount.accountPaytoUri,
  );

  await bank.start();

  await bank.pingUntilAvailable();

  exchange.addOfferedCoins(defaultCoinConfig);

  await exchange.start();
  await exchange.pingUntilAvailable();

  // Confuse the merchant by adding the non-proxied exchange.
  merchant.addExchange(exchange);

  await merchant.start();
  await merchant.pingUntilAvailable();

  await merchant.addInstance({
    id: "default",
    name: "Default Instance",
    paytoUris: [getPayto("merchant-default")],
  });

  await merchant.addInstance({
    id: "minst1",
    name: "minst1",
    paytoUris: [getPayto("minst1")]
  });

  console.log("setup done!");

  const wallet = new WalletCli(t);

  return {
    commonDb: db,
    exchange,
    merchant,
    wallet,
    bank,
    exchangeBankAccount,
    faultyMerchant,
    faultyExchange,
  };
}

/**
 * Confuse the merchant by having one URL for the same exchange in the config,
 * but sending coins from the same exchange with a different URL.
 */
export async function runMerchantExchangeConfusionTest(t: GlobalTestState) {
  // Set up test environment

  const {
    wallet,
    bank,
    faultyExchange,
    faultyMerchant,
  } = await createConfusedMerchantTestkudosEnvironment(t);

  // Withdraw digital cash into the wallet.

  await withdrawViaBank(t, {
    wallet,
    bank,
    exchange: faultyExchange,
    amount: "TESTKUDOS:20",
  });

  /**
   * =========================================================================
   * Create an order and let the wallet pay under a session ID
   *
   * We check along the way that the JSON response to /orders/{order_id}
   * returns the right thing.
   * =========================================================================
   */

  const merchant = faultyMerchant;

  let orderResp = await MerchantPrivateApi.createOrder(merchant, "default", {
    order: {
      summary: "Buy me!",
      amount: "TESTKUDOS:5",
      fulfillment_url: "https://example.com/article42",
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

  const orderUrlWithHash = new URL(publicOrderStatusUrl);
  orderUrlWithHash.searchParams.set("h_contract", preparePayResp.contractTermsHash);

  console.log("requesting", orderUrlWithHash.href);

  publicOrderStatusResp = await axios.get(orderUrlWithHash.href, {
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

  const confirmPayRes = await wallet.client.call(
    WalletApiOperation.ConfirmPay,
    {
      proposalId: proposalId,
    },
  );

  t.assertTrue(confirmPayRes.type === ConfirmPayResultType.Done);
}

runMerchantExchangeConfusionTest.suites = ["merchant"];
