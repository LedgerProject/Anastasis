/*
 This file is part of GNU Taler
 (C) 2021 Taler Systems S.A.

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
 * Selection of coins for payments.
 *
 * @author Florian Dold
 */

/**
 * Imports.
 */
import { AmountJson, Amounts, DenominationPubKey } from "@gnu-taler/taler-util";
import { strcmp, Logger } from "@gnu-taler/taler-util";

const logger = new Logger("coinSelection.ts");

/**
 * Result of selecting coins, contains the exchange, and selected
 * coins with their denomination.
 */
export interface PayCoinSelection {
  /**
   * Amount requested by the merchant.
   */
  paymentAmount: AmountJson;

  /**
   * Public keys of the coins that were selected.
   */
  coinPubs: string[];

  /**
   * Amount that each coin contributes.
   */
  coinContributions: AmountJson[];

  /**
   * How much of the wire fees is the customer paying?
   */
  customerWireFees: AmountJson;

  /**
   * How much of the deposit fees is the customer paying?
   */
  customerDepositFees: AmountJson;
}

/**
 * Structure to describe a coin that is available to be
 * used in a payment.
 */
export interface AvailableCoinInfo {
  /**
   * Public key of the coin.
   */
  coinPub: string;

  /**
   * Coin's denomination public key.
   */
  denomPub: DenominationPubKey;

  /**
   * Amount still remaining (typically the full amount,
   * as coins are always refreshed after use.)
   */
  availableAmount: AmountJson;

  /**
   * Deposit fee for the coin.
   */
  feeDeposit: AmountJson;

  exchangeBaseUrl: string;
}

export type PreviousPayCoins = {
  coinPub: string;
  contribution: AmountJson;
  feeDeposit: AmountJson;
  exchangeBaseUrl: string;
}[];

export interface CoinCandidateSelection {
  candidateCoins: AvailableCoinInfo[];
  wireFeesPerExchange: Record<string, AmountJson>;
}

export interface SelectPayCoinRequest {
  candidates: CoinCandidateSelection;
  contractTermsAmount: AmountJson;
  depositFeeLimit: AmountJson;
  wireFeeLimit: AmountJson;
  wireFeeAmortization: number;
  prevPayCoins?: PreviousPayCoins;
}

interface CoinSelectionTally {
  /**
   * Amount that still needs to be paid.
   * May increase during the computation when fees need to be covered.
   */
  amountPayRemaining: AmountJson;

  /**
   * Allowance given by the merchant towards wire fees
   */
  amountWireFeeLimitRemaining: AmountJson;

  /**
   * Allowance given by the merchant towards deposit fees
   * (and wire fees after wire fee limit is exhausted)
   */
  amountDepositFeeLimitRemaining: AmountJson;

  customerDepositFees: AmountJson;

  customerWireFees: AmountJson;

  wireFeeCoveredForExchange: Set<string>;
}

/**
 * Account for the fees of spending a coin.
 */
function tallyFees(
  tally: CoinSelectionTally,
  wireFeesPerExchange: Record<string, AmountJson>,
  wireFeeAmortization: number,
  exchangeBaseUrl: string,
  feeDeposit: AmountJson,
): CoinSelectionTally {
  const currency = tally.amountPayRemaining.currency;
  let amountWireFeeLimitRemaining = tally.amountWireFeeLimitRemaining;
  let amountDepositFeeLimitRemaining = tally.amountDepositFeeLimitRemaining;
  let customerDepositFees = tally.customerDepositFees;
  let customerWireFees = tally.customerWireFees;
  let amountPayRemaining = tally.amountPayRemaining;
  const wireFeeCoveredForExchange = new Set(tally.wireFeeCoveredForExchange);

  if (!tally.wireFeeCoveredForExchange.has(exchangeBaseUrl)) {
    const wf =
      wireFeesPerExchange[exchangeBaseUrl] ?? Amounts.getZero(currency);
    const wfForgiven = Amounts.min(amountWireFeeLimitRemaining, wf);
    amountWireFeeLimitRemaining = Amounts.sub(
      amountWireFeeLimitRemaining,
      wfForgiven,
    ).amount;
    // The remaining, amortized amount needs to be paid by the
    // wallet or covered by the deposit fee allowance.
    let wfRemaining = Amounts.divide(
      Amounts.sub(wf, wfForgiven).amount,
      wireFeeAmortization,
    );

    // This is the amount forgiven via the deposit fee allowance.
    const wfDepositForgiven = Amounts.min(
      amountDepositFeeLimitRemaining,
      wfRemaining,
    );
    amountDepositFeeLimitRemaining = Amounts.sub(
      amountDepositFeeLimitRemaining,
      wfDepositForgiven,
    ).amount;

    wfRemaining = Amounts.sub(wfRemaining, wfDepositForgiven).amount;
    customerWireFees = Amounts.add(customerWireFees, wfRemaining).amount;
    amountPayRemaining = Amounts.add(amountPayRemaining, wfRemaining).amount;

    wireFeeCoveredForExchange.add(exchangeBaseUrl);
  }

  const dfForgiven = Amounts.min(feeDeposit, amountDepositFeeLimitRemaining);

  amountDepositFeeLimitRemaining = Amounts.sub(
    amountDepositFeeLimitRemaining,
    dfForgiven,
  ).amount;

  // How much does the user spend on deposit fees for this coin?
  const dfRemaining = Amounts.sub(feeDeposit, dfForgiven).amount;
  customerDepositFees = Amounts.add(customerDepositFees, dfRemaining).amount;
  amountPayRemaining = Amounts.add(amountPayRemaining, dfRemaining).amount;

  return {
    amountDepositFeeLimitRemaining,
    amountPayRemaining,
    amountWireFeeLimitRemaining,
    customerDepositFees,
    customerWireFees,
    wireFeeCoveredForExchange,
  };
}

function denomPubCmp(
  p1: DenominationPubKey,
  p2: DenominationPubKey,
): -1 | 0 | 1 {
  if (p1.cipher < p2.cipher) {
    return -1;
  } else if (p1.cipher > p2.cipher) {
    return +1;
  }
  if (p1.cipher !== 1 || p2.cipher !== 1) {
    throw Error("unsupported cipher");
  }
  return strcmp(p1.rsa_public_key, p2.rsa_public_key);
}

/**
 * Given a list of candidate coins, select coins to spend under the merchant's
 * constraints.
 *
 * The prevPayCoins can be specified to "repair" a coin selection
 * by adding additional coins, after a broken (e.g. double-spent) coin
 * has been removed from the selection.
 *
 * This function is only exported for the sake of unit tests.
 */
export function selectPayCoins(
  req: SelectPayCoinRequest,
): PayCoinSelection | undefined {
  const {
    candidates,
    contractTermsAmount,
    depositFeeLimit,
    wireFeeLimit,
    wireFeeAmortization,
  } = req;

  if (candidates.candidateCoins.length === 0) {
    return undefined;
  }
  const coinPubs: string[] = [];
  const coinContributions: AmountJson[] = [];
  const currency = contractTermsAmount.currency;

  let tally: CoinSelectionTally = {
    amountPayRemaining: contractTermsAmount,
    amountWireFeeLimitRemaining: wireFeeLimit,
    amountDepositFeeLimitRemaining: depositFeeLimit,
    customerDepositFees: Amounts.getZero(currency),
    customerWireFees: Amounts.getZero(currency),
    wireFeeCoveredForExchange: new Set(),
  };

  const prevPayCoins = req.prevPayCoins ?? [];

  // Look at existing pay coin selection and tally up
  for (const prev of prevPayCoins) {
    tally = tallyFees(
      tally,
      candidates.wireFeesPerExchange,
      wireFeeAmortization,
      prev.exchangeBaseUrl,
      prev.feeDeposit,
    );
    tally.amountPayRemaining = Amounts.sub(
      tally.amountPayRemaining,
      prev.contribution,
    ).amount;

    coinPubs.push(prev.coinPub);
    coinContributions.push(prev.contribution);
  }

  const prevCoinPubs = new Set(prevPayCoins.map((x) => x.coinPub));

  // Sort by available amount (descending),  deposit fee (ascending) and
  // denomPub (ascending) if deposit fee is the same
  // (to guarantee deterministic results)
  const candidateCoins = [...candidates.candidateCoins].sort(
    (o1, o2) =>
      -Amounts.cmp(o1.availableAmount, o2.availableAmount) ||
      Amounts.cmp(o1.feeDeposit, o2.feeDeposit) ||
      denomPubCmp(o1.denomPub, o2.denomPub),
  );

  // FIXME:  Here, we should select coins in a smarter way.
  // Instead of always spending the next-largest coin,
  // we should try to find the smallest coin that covers the
  // amount.

  for (const aci of candidateCoins) {
    // Don't use this coin if depositing it is more expensive than
    // the amount it would give the merchant.
    if (Amounts.cmp(aci.feeDeposit, aci.availableAmount) > 0) {
      continue;
    }

    if (Amounts.isZero(tally.amountPayRemaining)) {
      // We have spent enough!
      break;
    }

    // The same coin can't contribute twice to the same payment,
    // by a fundamental, intentional limitation of the protocol.
    if (prevCoinPubs.has(aci.coinPub)) {
      continue;
    }

    tally = tallyFees(
      tally,
      candidates.wireFeesPerExchange,
      wireFeeAmortization,
      aci.exchangeBaseUrl,
      aci.feeDeposit,
    );

    let coinSpend = Amounts.max(
      Amounts.min(tally.amountPayRemaining, aci.availableAmount),
      aci.feeDeposit,
    );

    tally.amountPayRemaining = Amounts.sub(
      tally.amountPayRemaining,
      coinSpend,
    ).amount;
    coinPubs.push(aci.coinPub);
    coinContributions.push(coinSpend);
  }

  if (Amounts.isZero(tally.amountPayRemaining)) {
    return {
      paymentAmount: contractTermsAmount,
      coinContributions,
      coinPubs,
      customerDepositFees: tally.customerDepositFees,
      customerWireFees: tally.customerWireFees,
    };
  }
  return undefined;
}
