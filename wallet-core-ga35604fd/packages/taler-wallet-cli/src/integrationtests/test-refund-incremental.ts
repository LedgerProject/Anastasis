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
import { GlobalTestState, delayMs, MerchantPrivateApi } from "../harness/harness.js";
import { createSimpleTestkudosEnvironment, withdrawViaBank } from "../harness/helpers.js";
import {
  TransactionType,
  Amounts,
  durationFromSpec,
} from "@gnu-taler/taler-util";
import { WalletApiOperation } from "@gnu-taler/taler-wallet-core";

/**
 * Run test for basic, bank-integrated withdrawal.
 */
export async function runRefundIncrementalTest(t: GlobalTestState) {
  // Set up test environment

  const {
    wallet,
    bank,
    exchange,
    merchant,
  } = await createSimpleTestkudosEnvironment(t);

  // Withdraw digital cash into the wallet.

  await withdrawViaBank(t, { wallet, bank, exchange, amount: "TESTKUDOS:20" });

  // Set up order.

  const orderResp = await MerchantPrivateApi.createOrder(merchant, "default", {
    order: {
      summary: "Buy me!",
      amount: "TESTKUDOS:10",
      fulfillment_url: "taler://fulfillment-success/thx",
    },
    refund_delay: durationFromSpec({ minutes: 5 }),
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
    proposalId: r1.proposalId,
  });

  // Check if payment was successful.

  orderStatus = await MerchantPrivateApi.queryPrivateOrderStatus(merchant, {
    orderId: orderResp.order_id,
  });

  t.assertTrue(orderStatus.order_status === "paid");

  let ref = await MerchantPrivateApi.giveRefund(merchant, {
    amount: "TESTKUDOS:2.5",
    instance: "default",
    justification: "foo",
    orderId: orderResp.order_id,
  });

  console.log("first refund increase response", ref);

  {
    let wr = await wallet.client.call(WalletApiOperation.ApplyRefund, {
      talerRefundUri: ref.talerRefundUri,
    });
    console.log(wr);
    const txs = await wallet.client.call(
      WalletApiOperation.GetTransactions,
      {},
    );
    console.log(
      "transactions after applying first refund:",
      JSON.stringify(txs, undefined, 2),
    );
  }

  // Wait at least a second, because otherwise the increased
  // refund will be grouped with the previous one.
  await delayMs(1200);

  ref = await MerchantPrivateApi.giveRefund(merchant, {
    amount: "TESTKUDOS:5",
    instance: "default",
    justification: "bar",
    orderId: orderResp.order_id,
  });

  console.log("second refund increase response", ref);

  // Wait at least a second, because otherwise the increased
  // refund will be grouped with the previous one.
  await delayMs(1200);

  ref = await MerchantPrivateApi.giveRefund(merchant, {
    amount: "TESTKUDOS:10",
    instance: "default",
    justification: "bar",
    orderId: orderResp.order_id,
  });

  console.log("third refund increase response", ref);

  {
    let wr = await wallet.client.call(WalletApiOperation.ApplyRefund, {
      talerRefundUri: ref.talerRefundUri,
    });
    console.log(wr);
  }

  orderStatus = await MerchantPrivateApi.queryPrivateOrderStatus(merchant, {
    orderId: orderResp.order_id,
  });

  t.assertTrue(orderStatus.order_status === "paid");

  t.assertAmountEquals(orderStatus.refund_amount, "TESTKUDOS:10");

  console.log(JSON.stringify(orderStatus, undefined, 2));

  await wallet.runUntilDone();

  const bal = await wallet.client.call(WalletApiOperation.GetBalances, {});
  console.log(JSON.stringify(bal, undefined, 2));

  {
    const txs = await wallet.client.call(
      WalletApiOperation.GetTransactions,
      {},
    );
    console.log(JSON.stringify(txs, undefined, 2));

    const txTypes = txs.transactions.map((x) => x.type);
    t.assertDeepEqual(txTypes, [
      "withdrawal",
      "payment",
      "refund",
      "refund",
      "refund",
    ]);

    for (const tx of txs.transactions) {
      if (tx.type !== TransactionType.Refund) {
        continue;
      }
      t.assertAmountLeq(tx.amountEffective, tx.amountRaw);
    }

    const raw = Amounts.sum(
      txs.transactions
        .filter((x) => x.type === TransactionType.Refund)
        .map((x) => x.amountRaw),
    ).amount;

    t.assertAmountEquals("TESTKUDOS:10", raw);

    const effective = Amounts.sum(
      txs.transactions
        .filter((x) => x.type === TransactionType.Refund)
        .map((x) => x.amountEffective),
    ).amount;

    t.assertAmountEquals("TESTKUDOS:8.33", effective);
  }

  await t.shutdown();
}

runRefundIncrementalTest.suites = ["wallet"];
