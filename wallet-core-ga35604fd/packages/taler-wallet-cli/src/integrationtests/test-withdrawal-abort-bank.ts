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
import { TalerErrorCode } from "@gnu-taler/taler-util";
import { WalletApiOperation } from "@gnu-taler/taler-wallet-core";
import { GlobalTestState, BankApi, BankAccessApi } from "../harness/harness.js";
import { createSimpleTestkudosEnvironment } from "../harness/helpers.js";

/**
 * Run test for basic, bank-integrated withdrawal.
 */
export async function runWithdrawalAbortBankTest(t: GlobalTestState) {
  // Set up test environment

  const { wallet, bank, exchange } = await createSimpleTestkudosEnvironment(t);

  // Create a withdrawal operation

  const user = await BankApi.createRandomBankUser(bank);
  const wop = await BankAccessApi.createWithdrawalOperation(
    bank,
    user,
    "TESTKUDOS:10",
  );

  // Hand it to the wallet

  await wallet.client.call(WalletApiOperation.GetWithdrawalDetailsForUri, {
    talerWithdrawUri: wop.taler_withdraw_uri,
  });

  await wallet.runPending();

  // Abort it

  await BankApi.abortWithdrawalOperation(bank, user, wop);

  // Withdraw

  // Difference:
  // -> with euFin, the wallet selects
  // -> with PyBank, the wallet stops _before_
  //
  // WHY ?!
  //
  const e = await t.assertThrowsOperationErrorAsync(async () => {
    await wallet.client.call(
      WalletApiOperation.AcceptBankIntegratedWithdrawal,
      {
        exchangeBaseUrl: exchange.baseUrl,
        talerWithdrawUri: wop.taler_withdraw_uri,
      },
    );
  });
  t.assertDeepEqual(
    e.operationError.code,
    TalerErrorCode.WALLET_WITHDRAWAL_OPERATION_ABORTED_BY_BANK,
  );

  await t.shutdown();
}

runWithdrawalAbortBankTest.suites = ["wallet"];
