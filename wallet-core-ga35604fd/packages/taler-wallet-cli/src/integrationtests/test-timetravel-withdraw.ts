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
import { GlobalTestState } from "../harness/harness.js";
import {
  createSimpleTestkudosEnvironment,
  withdrawViaBank,
  startWithdrawViaBank,
} from "../harness/helpers.js";
import { Duration, TransactionType } from "@gnu-taler/taler-util";
import { WalletApiOperation } from "@gnu-taler/taler-wallet-core";

/**
 * Basic time travel test.
 */
export async function runTimetravelWithdrawTest(t: GlobalTestState) {
  // Set up test environment

  const {
    wallet,
    bank,
    exchange,
    merchant,
  } = await createSimpleTestkudosEnvironment(t);

  // Withdraw digital cash into the wallet.

  await withdrawViaBank(t, { wallet, bank, exchange, amount: "TESTKUDOS:15" });

  // Travel 400 days into the future,
  // as the deposit expiration is two years
  // into the future.
  const timetravelDuration: Duration = {
    d_ms: 1000 * 60 * 60 * 24 * 400,
  };

  await exchange.stop();
  exchange.setTimetravel(timetravelDuration);
  await exchange.start();
  await exchange.pingUntilAvailable();
  await exchange.keyup();

  await merchant.stop();
  merchant.setTimetravel(timetravelDuration);
  await merchant.start();
  await merchant.pingUntilAvailable();

  // This should fail, as the wallet didn't time travel yet.
  await startWithdrawViaBank(t, {
    wallet,
    bank,
    exchange,
    amount: "TESTKUDOS:20",
  });

  // Check that transactions are correct for the failed withdrawal
  {
    await wallet.runUntilDone({ maxRetries: 5 });
    const transactions = await wallet.client.call(
      WalletApiOperation.GetTransactions,
      {},
    );
    console.log(transactions);
    const types = transactions.transactions.map((x) => x.type);
    t.assertDeepEqual(types, ["withdrawal", "withdrawal"]);
    const wtrans = transactions.transactions[1];
    t.assertTrue(wtrans.type === TransactionType.Withdrawal);
    t.assertTrue(wtrans.pending);
  }

  // Now we also let the wallet time travel

  wallet.setTimetravel(timetravelDuration);

  // This doesn't work yet, see https://bugs.taler.net/n/6585

  // await wallet.runUntilDone({ maxRetries: 5 });
}

runTimetravelWithdrawTest.suites = ["wallet"];
