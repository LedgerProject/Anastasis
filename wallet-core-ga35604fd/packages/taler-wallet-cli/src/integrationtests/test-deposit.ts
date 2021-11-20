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
import { GlobalTestState, getPayto } from "../harness/harness.js";
import { createSimpleTestkudosEnvironment, withdrawViaBank } from "../harness/helpers.js";

/**
 * Run test for basic, bank-integrated withdrawal and payment.
 */
export async function runDepositTest(t: GlobalTestState) {
  // Set up test environment

  const {
    wallet,
    bank,
    exchange,
    merchant,
  } = await createSimpleTestkudosEnvironment(t);

  // Withdraw digital cash into the wallet.

  await withdrawViaBank(t, { wallet, bank, exchange, amount: "TESTKUDOS:20" });

  await wallet.runUntilDone();

  const { depositGroupId } = await wallet.client.call(
    WalletApiOperation.CreateDepositGroup,
    {
      amount: "TESTKUDOS:10",
      depositPaytoUri: getPayto("foo"),
    },
  );

  await wallet.runUntilDone();

  const transactions = await wallet.client.call(
    WalletApiOperation.GetTransactions,
    {},
  );
  console.log("transactions", JSON.stringify(transactions, undefined, 2));
  t.assertDeepEqual(transactions.transactions[0].type, "withdrawal");
  t.assertTrue(!transactions.transactions[0].pending);
  t.assertDeepEqual(transactions.transactions[1].type, "deposit");
  t.assertTrue(!transactions.transactions[1].pending);
  // The raw amount is what ends up on the bank account, which includes
  // deposit and wire fees.
  t.assertDeepEqual(transactions.transactions[1].amountRaw, "TESTKUDOS:9.79");

  const trackResult = wallet.client.call(WalletApiOperation.TrackDepositGroup, {
    depositGroupId,
  });

  console.log(JSON.stringify(trackResult, undefined, 2));
}
