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
 * Helpers to create typical test environments.
 *
 * @author Florian Dold <dold@taler.net>
 */

/**
 * Imports
 */
import {
  FaultInjectedExchangeService,
  FaultInjectedMerchantService,
} from "./faultInjection";
import { CoinConfig, defaultCoinConfig } from "./denomStructures";
import {
  AmountString,
  Duration,
  ContractTerms,
  PreparePayResultType,
  ConfirmPayResultType,
} from "@gnu-taler/taler-util";
import {
  DbInfo,
  BankService,
  ExchangeService,
  MerchantService,
  WalletCli,
  GlobalTestState,
  setupDb,
  ExchangeServiceInterface,
  BankApi,
  BankAccessApi,
  MerchantServiceInterface,
  MerchantPrivateApi,
  HarnessExchangeBankAccount,
  WithAuthorization,
  getPayto
} from "./harness.js";
import { WalletApiOperation } from "@gnu-taler/taler-wallet-core";

export interface SimpleTestEnvironment {
  commonDb: DbInfo;
  bank: BankService;
  exchange: ExchangeService;
  exchangeBankAccount: HarnessExchangeBankAccount;
  merchant: MerchantService;
  wallet: WalletCli;
}

/**
 * Run a test case with a simple TESTKUDOS Taler environment, consisting
 * of one exchange, one bank and one merchant.
 */
export async function createSimpleTestkudosEnvironment(
  t: GlobalTestState,
  coinConfig: CoinConfig[] = defaultCoinConfig.map((x) => x("TESTKUDOS")),
): Promise<SimpleTestEnvironment> {
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

  const exchangeBankAccount = await bank.createExchangeAccount(
    "myexchange",
    "x",
  );
  exchange.addBankAccount("1", exchangeBankAccount);

  bank.setSuggestedExchange(exchange, exchangeBankAccount.accountPaytoUri);

  await bank.start();

  await bank.pingUntilAvailable();

  exchange.addCoinConfigList(coinConfig);

  await exchange.start();
  await exchange.pingUntilAvailable();

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

  const wallet = new WalletCli(t);

  return {
    commonDb: db,
    exchange,
    merchant,
    wallet,
    bank,
    exchangeBankAccount,
  };
}

export interface FaultyMerchantTestEnvironment {
  commonDb: DbInfo;
  bank: BankService;
  exchange: ExchangeService;
  faultyExchange: FaultInjectedExchangeService;
  exchangeBankAccount: HarnessExchangeBankAccount;
  merchant: MerchantService;
  faultyMerchant: FaultInjectedMerchantService;
  wallet: WalletCli;
}

/**
 * Run a test case with a simple TESTKUDOS Taler environment, consisting
 * of one exchange, one bank and one merchant.
 */
export async function createFaultInjectedMerchantTestkudosEnvironment(
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

  merchant.addExchange(faultyExchange);

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
 * Withdraw balance.
 */
export async function startWithdrawViaBank(
  t: GlobalTestState,
  p: {
    wallet: WalletCli;
    bank: BankService;
    exchange: ExchangeServiceInterface;
    amount: AmountString;
  },
): Promise<void> {
  const { wallet, bank, exchange, amount } = p;

  const user = await BankApi.createRandomBankUser(bank);
  const wop = await BankAccessApi.createWithdrawalOperation(bank, user, amount);

  // Hand it to the wallet

  await wallet.client.call(WalletApiOperation.GetWithdrawalDetailsForUri, {
    talerWithdrawUri: wop.taler_withdraw_uri,
  });

  await wallet.runPending();

  // Withdraw (AKA select)

  await wallet.client.call(WalletApiOperation.AcceptBankIntegratedWithdrawal, {
    exchangeBaseUrl: exchange.baseUrl,
    talerWithdrawUri: wop.taler_withdraw_uri,
  });
  
  // Confirm it

  await BankApi.confirmWithdrawalOperation(bank, user, wop);

  await wallet.runPending();
  await wallet.runUntilDone();
}

/**
 * Withdraw balance.
 */
export async function withdrawViaBank(
  t: GlobalTestState,
  p: {
    wallet: WalletCli;
    bank: BankService;
    exchange: ExchangeServiceInterface;
    amount: AmountString;
  },
): Promise<void> {
  const { wallet } = p;

  await startWithdrawViaBank(t, p);

  await wallet.runUntilDone();

  // Check balance

  await wallet.client.call(WalletApiOperation.GetBalances, {});
}

export async function applyTimeTravel(
  timetravelDuration: Duration,
  s: {
    exchange?: ExchangeService;
    merchant?: MerchantService;
    wallet?: WalletCli;
  },
): Promise<void> {
  if (s.exchange) {
    await s.exchange.stop();
    s.exchange.setTimetravel(timetravelDuration);
    await s.exchange.start();
    await s.exchange.pingUntilAvailable();
  }

  if (s.merchant) {
    await s.merchant.stop();
    s.merchant.setTimetravel(timetravelDuration);
    await s.merchant.start();
    await s.merchant.pingUntilAvailable();
  }

  if (s.wallet) {
    s.wallet.setTimetravel(timetravelDuration);
  }
}

/**
 * Make a simple payment and check that it succeeded.
 */
export async function makeTestPayment(
  t: GlobalTestState,
  args: {
    merchant: MerchantServiceInterface;
    wallet: WalletCli;
    order: Partial<ContractTerms>;
    instance?: string;
  },
  auth: WithAuthorization = {},
): Promise<void> {
  // Set up order.

  const { wallet, merchant } = args;
  const instance = args.instance ?? "default";

  const orderResp = await MerchantPrivateApi.createOrder(
    merchant,
    instance,
    {
      order: args.order,
    },
    auth,
  );

  let orderStatus = await MerchantPrivateApi.queryPrivateOrderStatus(
    merchant,
    {
      orderId: orderResp.order_id,
    },
    auth,
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

  const r2 = await wallet.client.call(WalletApiOperation.ConfirmPay, {
    proposalId: preparePayResult.proposalId,
  });

  t.assertTrue(r2.type === ConfirmPayResultType.Done);

  // Check if payment was successful.

  orderStatus = await MerchantPrivateApi.queryPrivateOrderStatus(
    merchant,
    {
      orderId: orderResp.order_id,
      instance,
    },
    auth,
  );

  t.assertTrue(orderStatus.order_status === "paid");
}
