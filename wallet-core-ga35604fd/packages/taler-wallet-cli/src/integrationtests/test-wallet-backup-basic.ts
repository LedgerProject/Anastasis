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
import { WalletApiOperation } from "@gnu-taler/taler-wallet-core";
import { GlobalTestState, WalletCli } from "../harness/harness.js";
import { createSimpleTestkudosEnvironment, withdrawViaBank } from "../harness/helpers.js";
import { SyncService } from "../harness/sync";

/**
 * Run test for basic, bank-integrated withdrawal.
 */
export async function runWalletBackupBasicTest(t: GlobalTestState) {
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
    activate: false,
    name: sync.baseUrl,
  });

  {
    const bi = await wallet.client.call(WalletApiOperation.GetBackupInfo, {});
    t.assertDeepEqual(bi.providers[0].active, false);
  }

  await wallet.client.call(WalletApiOperation.AddBackupProvider, {
    backupProviderBaseUrl: sync.baseUrl,
    activate: true,
    name: sync.baseUrl,
  });

  {
    const bi = await wallet.client.call(WalletApiOperation.GetBackupInfo, {});
    t.assertDeepEqual(bi.providers[0].active, true);
  }

  await wallet.client.call(WalletApiOperation.RunBackupCycle, {});

  {
    const bi = await wallet.client.call(WalletApiOperation.GetBackupInfo, {});
    console.log(bi);
    t.assertDeepEqual(
      bi.providers[0].paymentStatus.type,
      "insufficient-balance",
    );
  }

  await withdrawViaBank(t, { wallet, bank, exchange, amount: "TESTKUDOS:10" });

  await wallet.client.call(WalletApiOperation.RunBackupCycle, {});

  {
    const bi = await wallet.client.call(WalletApiOperation.GetBackupInfo, {});
    console.log(bi);
  }

  await withdrawViaBank(t, { wallet, bank, exchange, amount: "TESTKUDOS:5" });

  await wallet.client.call(WalletApiOperation.RunBackupCycle, {});

  {
    const bi = await wallet.client.call(WalletApiOperation.GetBackupInfo, {});
    console.log(bi);
  }

  const backupRecovery = await wallet.client.call(
    WalletApiOperation.ExportBackupRecovery,
    {},
  );

  const wallet2 = new WalletCli(t, "wallet2");

  // Check that the second wallet is a fresh wallet.
  {
    const bal = await wallet2.client.call(WalletApiOperation.GetBalances, {});
    t.assertTrue(bal.balances.length === 0);
  }

  await wallet2.client.call(WalletApiOperation.ImportBackupRecovery, {
    recovery: backupRecovery,
  });

  await wallet2.client.call(WalletApiOperation.RunBackupCycle, {});

  // Check that now the old balance is available!
  {
    const bal = await wallet2.client.call(WalletApiOperation.GetBalances, {});
    t.assertTrue(bal.balances.length === 1);
    console.log(bal);
  }

  // Now do some basic checks that the restored wallet is still functional
  {
    const bal1 = await wallet2.client.call(WalletApiOperation.GetBalances, {});

    t.assertAmountEquals(bal1.balances[0].available, "TESTKUDOS:14.1");

    await withdrawViaBank(t, {
      wallet: wallet2,
      bank,
      exchange,
      amount: "TESTKUDOS:10",
    });

    await wallet2.runUntilDone();

    const bal2 = await wallet2.client.call(WalletApiOperation.GetBalances, {});

    t.assertAmountEquals(bal2.balances[0].available, "TESTKUDOS:23.82");
  }
}

runWalletBackupBasicTest.suites = ["wallet", "wallet-backup"];
