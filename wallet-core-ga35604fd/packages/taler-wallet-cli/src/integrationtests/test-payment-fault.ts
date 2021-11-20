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
 * Sample fault injection test.
 */

/**
 * Imports.
 */
import {
  GlobalTestState,
  MerchantService,
  ExchangeService,
  setupDb,
  BankService,
  WalletCli,
  MerchantPrivateApi,
  BankApi,
  BankAccessApi,
  getPayto
} from "../harness/harness.js";
import {
  FaultInjectedExchangeService,
  FaultInjectionRequestContext,
  FaultInjectionResponseContext,
} from "../harness/faultInjection";
import { CoreApiResponse } from "@gnu-taler/taler-util";
import { defaultCoinConfig } from "../harness/denomStructures";
import { WalletApiOperation } from "@gnu-taler/taler-wallet-core";

/**
 * Run test for basic, bank-integrated withdrawal.
 */
export async function runPaymentFaultTest(t: GlobalTestState) {
  // Set up test environment

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

  bank.setSuggestedExchange(exchange, exchangeBankAccount.accountPaytoUri);

  await bank.start();

  await bank.pingUntilAvailable();

  await exchange.addBankAccount("1", exchangeBankAccount);
  exchange.addOfferedCoins(defaultCoinConfig);

  await exchange.start();
  await exchange.pingUntilAvailable();

  const faultyExchange = new FaultInjectedExchangeService(t, exchange, 8091);

  // Print all requests to the exchange
  faultyExchange.faultProxy.addFault({
    async modifyRequest(ctx: FaultInjectionRequestContext) {
      console.log("got request", ctx);
    },
    async modifyResponse(ctx: FaultInjectionResponseContext) {
      console.log("got response", ctx);
    },
  });

  const merchant = await MerchantService.create(t, {
    name: "testmerchant-1",
    currency: "TESTKUDOS",
    httpPort: 8083,
    database: db.connStr,
  });

  merchant.addExchange(faultyExchange);

  await merchant.start();
  await merchant.pingUntilAvailable();

  await merchant.addInstance({
    id: "default",
    name: "Default Instance",
    paytoUris: [getPayto("merchant-default")],
  });

  console.log("setup done!");

  const wallet = new WalletCli(t);

  // Create withdrawal operation

  const user = await BankApi.createRandomBankUser(bank);
  const wop = await BankAccessApi.createWithdrawalOperation(
    bank,
    user,
    "TESTKUDOS:20",
  );

  // Hand it to the wallet

  await wallet.client.call(WalletApiOperation.GetWithdrawalDetailsForUri, {
    talerWithdrawUri: wop.taler_withdraw_uri,
  });

  await wallet.runPending();

  // Withdraw

  await wallet.client.call(WalletApiOperation.AcceptBankIntegratedWithdrawal, {
    exchangeBaseUrl: faultyExchange.baseUrl,
    talerWithdrawUri: wop.taler_withdraw_uri,
  });
  await wallet.runPending();

  // Confirm it

  await BankApi.confirmWithdrawalOperation(bank, user, wop);

  await wallet.runUntilDone();


  // Check balance

  await wallet.client.call(WalletApiOperation.GetBalances, {});

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

  // Make wallet pay for the order

  let apiResp: CoreApiResponse;

  const prepResp = await wallet.client.call(
    WalletApiOperation.PreparePayForUri,
    {
      talerPayUri: orderStatus.taler_pay_uri,
    },
  );

  const proposalId = prepResp.proposalId;

  await wallet.runPending();

  // Drop 3 responses from the exchange.
  let faultCount = 0;
  faultyExchange.faultProxy.addFault({
    async modifyResponse(ctx: FaultInjectionResponseContext) {
      if (!ctx.request.requestUrl.endsWith("/deposit")) {
        return;
      }
      if (faultCount < 3) {
        console.log(`blocking /deposit request #${faultCount}`);
        faultCount++;
        ctx.dropResponse = true;
      } else {
        console.log(`letting through /deposit request #${faultCount}`);
      }
    },
  });

  // confirmPay won't work, as the exchange is unreachable

  await wallet.client.call(WalletApiOperation.ConfirmPay, {
    // FIXME: should be validated, don't cast!
    proposalId: proposalId,
  });

  await wallet.runUntilDone();

  // Check if payment was successful.

  orderStatus = await MerchantPrivateApi.queryPrivateOrderStatus(merchant, {
    orderId: orderResp.order_id,
  });

  t.assertTrue(orderStatus.order_status === "paid");
}

runPaymentFaultTest.suites = ["wallet"];
runPaymentFaultTest.timeoutMs = 120000;
