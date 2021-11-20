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
  makeTestPayment,
} from "../harness/helpers.js";

/**
 * Run test for basic, bank-integrated withdrawal and payment.
 */
export async function runPaymentTest(t: GlobalTestState) {
  // Set up test environment

  const {
    wallet,
    bank,
    exchange,
    merchant,
  } = await createSimpleTestkudosEnvironment(t);

  // Withdraw digital cash into the wallet.

  await withdrawViaBank(t, { wallet, bank, exchange, amount: "TESTKUDOS:20" });

  const order = {
    summary: "Buy me!",
    amount: "TESTKUDOS:5",
    fulfillment_url: "taler://fulfillment-success/thx",
  };

  await makeTestPayment(t, { wallet, merchant, order });

  await wallet.runUntilDone();
}

runPaymentTest.suites = ["wallet"];
