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
import { GlobalTestState, MerchantPrivateApi, BankApi, getWireMethod } from "../harness/harness.js";
import { createSimpleTestkudosEnvironment } from "../harness/helpers.js";

/**
 * Run test for basic, bank-integrated withdrawal.
 */
export async function runTippingTest(t: GlobalTestState) {
  // Set up test environment

  const {
    wallet,
    bank,
    exchange,
    merchant,
    exchangeBankAccount,
  } = await createSimpleTestkudosEnvironment(t);

  const mbu = await BankApi.createRandomBankUser(bank);

  const tipReserveResp = await MerchantPrivateApi.createTippingReserve(
    merchant,
    "default",
    {
      exchange_url: exchange.baseUrl,
      initial_balance: "TESTKUDOS:10",
      wire_method: getWireMethod(),
    },
  );

  console.log("tipReserveResp:", tipReserveResp);

  t.assertDeepEqual(
    tipReserveResp.payto_uri,
    exchangeBankAccount.accountPaytoUri,
  );

  await BankApi.adminAddIncoming(bank, {
    amount: "TESTKUDOS:10",
    debitAccountPayto: mbu.accountPaytoUri,
    exchangeBankAccount,
    reservePub: tipReserveResp.reserve_pub,
  });

  await exchange.runWirewatchOnce();

  await merchant.stop();
  await merchant.start();
  await merchant.pingUntilAvailable();

  const r = await MerchantPrivateApi.queryTippingReserves(merchant, "default");
  console.log("tipping reserves:", JSON.stringify(r, undefined, 2));

  t.assertTrue(r.reserves.length === 1);
  t.assertDeepEqual(
    r.reserves[0].exchange_initial_amount,
    r.reserves[0].merchant_initial_amount,
  );

  const tip = await MerchantPrivateApi.giveTip(merchant, "default", {
    amount: "TESTKUDOS:5",
    justification: "why not?",
    next_url: "https://example.com/after-tip",
  });

  console.log("created tip", tip);

  const doTip = async (): Promise<void> => {
    const ptr = await wallet.client.call(WalletApiOperation.PrepareTip, {
      talerTipUri: tip.taler_tip_uri,
    });

    console.log(ptr);

    t.assertAmountEquals(ptr.tipAmountRaw, "TESTKUDOS:5");
    t.assertAmountEquals(ptr.tipAmountEffective, "TESTKUDOS:4.85");

    await wallet.client.call(WalletApiOperation.AcceptTip, {
      walletTipId: ptr.walletTipId,
    });

    await wallet.runUntilDone();

    const bal = await wallet.client.call(WalletApiOperation.GetBalances, {});

    console.log(bal);

    t.assertAmountEquals(bal.balances[0].available, "TESTKUDOS:4.85");

    const txns = await wallet.client.call(
      WalletApiOperation.GetTransactions,
      {},
    );

    console.log("Transactions:", JSON.stringify(txns, undefined, 2));

    t.assertDeepEqual(txns.transactions[0].type, "tip");
    t.assertDeepEqual(txns.transactions[0].pending, false);
    t.assertAmountEquals(
      txns.transactions[0].amountEffective,
      "TESTKUDOS:4.85",
    );
    t.assertAmountEquals(txns.transactions[0].amountRaw, "TESTKUDOS:5.0");
  };

  // Check twice so make sure tip handling is idempotent
  await doTip();
  await doTip();
}

runTippingTest.suites = ["wallet", "wallet-tipping"];
