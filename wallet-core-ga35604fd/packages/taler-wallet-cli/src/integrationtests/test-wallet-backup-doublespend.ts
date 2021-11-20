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
import { PreparePayResultType } from "@gnu-taler/taler-util";
import { WalletApiOperation } from "@gnu-taler/taler-wallet-core";
import { GlobalTestState, WalletCli, MerchantPrivateApi } from "../harness/harness.js";
import {
  createSimpleTestkudosEnvironment,
  makeTestPayment,
  withdrawViaBank,
} from "../harness/helpers.js";
import { SyncService } from "../harness/sync";

/**
 * Run test for basic, bank-integrated withdrawal.
 */
export async function runWalletBackupDoublespendTest(t: GlobalTestState) {
  // Set up test environment

  const {
    commonDb,
    merchant,
    wallet,
    bank,
    exchange,
  } = await createSimpleTestkudosEnvironment(t);

  const sync = await SyncService.create(t, {
    currency: "TESTKUDOS",
    annualFee: "TESTKUDOS:0.5",
    database: commonDb.connStr,
    fulfillmentUrl: "taler://fulfillment-success",
    httpPort: 8089,
    name: "sync1",
    paymentBackendUrl: merchant.makeInstanceBaseUrl(),
    uploadLimitMb: 10,
  });

  await sync.start();
  await sync.pingUntilAvailable();

  await wallet.client.call(WalletApiOperation.AddBackupProvider, {
    backupProviderBaseUrl: sync.baseUrl,
    activate: true,
    name: sync.baseUrl,
  });

  await withdrawViaBank(t, { wallet, bank, exchange, amount: "TESTKUDOS:10" });

  await wallet.client.call(WalletApiOperation.RunBackupCycle, {});
  await wallet.runUntilDone();
  await wallet.client.call(WalletApiOperation.RunBackupCycle, {});

  const backupRecovery = await wallet.client.call(
    WalletApiOperation.ExportBackupRecovery,
    {},
  );

  const wallet2 = new WalletCli(t, "wallet2");

  await wallet2.client.call(WalletApiOperation.ImportBackupRecovery, {
    recovery: backupRecovery,
  });

  await wallet2.client.call(WalletApiOperation.RunBackupCycle, {});

  console.log(
    "wallet1 balance before spend:",
    await wallet.client.call(WalletApiOperation.GetBalances, {}),
  );

  await makeTestPayment(t, {
    merchant,
    wallet,
    order: {
      summary: "foo",
      amount: "TESTKUDOS:7",
    },
  });

  await wallet.runUntilDone();

  console.log(
    "wallet1 balance after spend:",
    await wallet.client.call(WalletApiOperation.GetBalances, {}),
  );

  {
    console.log(
      "wallet2 balance:",
      await wallet2.client.call(WalletApiOperation.GetBalances, {}),
    );
  }

  // Now we double-spend with the second wallet

  {
    const instance = "default";

    const orderResp = await MerchantPrivateApi.createOrder(merchant, instance, {
      order: {
        amount: "TESTKUDOS:8",
        summary: "bla",
        fulfillment_url: "taler://fulfillment-success",
      },
    });

    let orderStatus = await MerchantPrivateApi.queryPrivateOrderStatus(
      merchant,
      {
        orderId: orderResp.order_id,
      },
    );

    t.assertTrue(orderStatus.order_status === "unpaid");

    // Make wallet pay for the order

    const preparePayResult = await wallet2.client.call(
      WalletApiOperation.PreparePayForUri,
      {
        talerPayUri: orderStatus.taler_pay_uri,
      },
    );

    t.assertTrue(
      preparePayResult.status === PreparePayResultType.PaymentPossible,
    );

    const res = await wallet2.client.call(WalletApiOperation.ConfirmPay, {
      proposalId: preparePayResult.proposalId,
    });

    console.log(res);

    // FIXME: wait for a notification that indicates insufficient funds!

    await withdrawViaBank(t, {
      wallet: wallet2,
      bank,
      exchange,
      amount: "TESTKUDOS:50",
    });

    const bal = await wallet2.client.call(WalletApiOperation.GetBalances, {});
    console.log("bal", bal);

    await wallet2.runUntilDone();
  }
}

runWalletBackupDoublespendTest.suites = ["wallet", "wallet-backup"];
