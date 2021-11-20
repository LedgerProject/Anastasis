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
  setupDb,
  BankService,
  ExchangeService,
  MerchantService,
  WalletCli,
  MerchantPrivateApi,
  getPayto
} from "../harness/harness.js";
import { withdrawViaBank } from "../harness/helpers.js";
import { coin_ct10, coin_u1 } from "../harness/denomStructures";
import { WalletApiOperation } from "@gnu-taler/taler-wallet-core";

async function setupTest(
  t: GlobalTestState,
): Promise<{
  merchant: MerchantService;
  exchange: ExchangeService;
  bank: BankService;
}> {
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

  const exchangeBankAccount = await bank.createExchangeAccount(
    "myexchange",
    "x",
  );

  exchange.addOfferedCoins([coin_ct10, coin_u1]);

  bank.setSuggestedExchange(exchange, exchangeBankAccount.accountPaytoUri);

  await bank.start();

  await bank.pingUntilAvailable();

  await exchange.addBankAccount("1", exchangeBankAccount);

  await exchange.start();
  await exchange.pingUntilAvailable();

  const merchant = await MerchantService.create(t, {
    name: "testmerchant-1",
    currency: "TESTKUDOS",
    httpPort: 8083,
    database: db.connStr,
  });

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
    paytoUris: [getPayto("minst1")],
  });

  console.log("setup done!");

  return {
    merchant,
    bank,
    exchange,
  };
}

/**
 * Run test.
 *
 * This test uses a very sub-optimal denomination structure.
 */
export async function runPaymentMultipleTest(t: GlobalTestState) {
  // Set up test environment

  const { merchant, bank, exchange } = await setupTest(t);

  const wallet = new WalletCli(t);

  // Withdraw digital cash into the wallet.

  await withdrawViaBank(t, { wallet, bank, exchange, amount: "TESTKUDOS:100" });

  // Set up order.

  const orderResp = await MerchantPrivateApi.createOrder(merchant, "default", {
    order: {
      summary: "Buy me!",
      amount: "TESTKUDOS:80",
      fulfillment_url: "taler://fulfillment-success/thx",
    },
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

  await t.shutdown();
}

runPaymentMultipleTest.suites = ["wallet"];
runPaymentMultipleTest.timeoutMs = 120000;
