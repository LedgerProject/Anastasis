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
 *
 * @author Sebastian Javier Marchano (sebasjm)
 */

import {
  PaymentStatus,
  TransactionCommon,
  TransactionDeposit,
  TransactionPayment,
  TransactionRefresh,
  TransactionRefund,
  TransactionTip,
  TransactionType,
  TransactionWithdrawal,
  WithdrawalType,
} from "@gnu-taler/taler-util";
import { createExample } from "../test-utils";
import { HistoryView as TestedComponent } from "./History";

export default {
  title: "popup/history/list",
  component: TestedComponent,
};

const commonTransaction = {
  amountRaw: "USD:10",
  amountEffective: "USD:9",
  pending: false,
  timestamp: {
    t_ms: new Date().getTime(),
  },
  transactionId: "12",
} as TransactionCommon;

const exampleData = {
  withdraw: {
    ...commonTransaction,
    type: TransactionType.Withdrawal,
    exchangeBaseUrl: "http://exchange.demo.taler.net",
    withdrawalDetails: {
      reservePub: "A05AJGMFNSK4Q62NXR2FKNDB1J4EXTYQTE7VA4M9GZQ4TR06YBNG",
      confirmed: false,
      exchangePaytoUris: ["payto://x-taler-bank/bank/account"],
      type: WithdrawalType.ManualTransfer,
    },
  } as TransactionWithdrawal,
  payment: {
    ...commonTransaction,
    amountEffective: "USD:11",
    type: TransactionType.Payment,
    info: {
      contractTermsHash: "ASDZXCASD",
      merchant: {
        name: "the merchant",
      },
      orderId: "2021.167-03NPY6MCYMVGT",
      products: [],
      summary: "the summary",
      fulfillmentMessage: "",
    },
    proposalId: "1EMJJH8EP1NX3XF7733NCYS2DBEJW4Q2KA5KEB37MCQJQ8Q5HMC0",
    status: PaymentStatus.Accepted,
  } as TransactionPayment,
  deposit: {
    ...commonTransaction,
    type: TransactionType.Deposit,
    depositGroupId: "#groupId",
    targetPaytoUri: "payto://x-taler-bank/bank/account",
  } as TransactionDeposit,
  refresh: {
    ...commonTransaction,
    type: TransactionType.Refresh,
    exchangeBaseUrl: "http://exchange.taler",
  } as TransactionRefresh,
  tip: {
    ...commonTransaction,
    type: TransactionType.Tip,
    merchantBaseUrl: "http://merchant.taler",
  } as TransactionTip,
  refund: {
    ...commonTransaction,
    type: TransactionType.Refund,
    refundedTransactionId:
      "payment:1EMJJH8EP1NX3XF7733NCYS2DBEJW4Q2KA5KEB37MCQJQ8Q5HMC0",
    info: {
      contractTermsHash: "ASDZXCASD",
      merchant: {
        name: "the merchant",
      },
      orderId: "2021.167-03NPY6MCYMVGT",
      products: [],
      summary: "the summary",
      fulfillmentMessage: "",
    },
  } as TransactionRefund,
};

export const EmptyWithBalance = createExample(TestedComponent, {
  list: [],
  balances: [
    {
      available: "TESTKUDOS:10",
      pendingIncoming: "TESTKUDOS:0",
      pendingOutgoing: "TESTKUDOS:0",
      hasPendingTransactions: false,
      requiresUserInput: false,
    },
  ],
});

export const EmptyWithNoBalance = createExample(TestedComponent, {
  list: [],
  balances: [],
});

export const One = createExample(TestedComponent, {
  list: [exampleData.withdraw],
  balances: [
    {
      available: "USD:10",
      pendingIncoming: "USD:0",
      pendingOutgoing: "USD:0",
      hasPendingTransactions: false,
      requiresUserInput: false,
    },
  ],
});

export const OnePending = createExample(TestedComponent, {
  list: [
    {
      ...exampleData.withdraw,
      pending: true,
    },
  ],
  balances: [
    {
      available: "USD:10",
      pendingIncoming: "USD:0",
      pendingOutgoing: "USD:0",
      hasPendingTransactions: false,
      requiresUserInput: false,
    },
  ],
});

export const Several = createExample(TestedComponent, {
  list: [
    exampleData.withdraw,
    exampleData.payment,
    exampleData.withdraw,
    exampleData.payment,
    exampleData.refresh,
    exampleData.refund,
    exampleData.tip,
    exampleData.deposit,
  ],
  balances: [
    {
      available: "TESTKUDOS:10",
      pendingIncoming: "TESTKUDOS:0",
      pendingOutgoing: "TESTKUDOS:0",
      hasPendingTransactions: false,
      requiresUserInput: false,
    },
  ],
});

export const SeveralWithTwoCurrencies = createExample(TestedComponent, {
  list: [
    exampleData.withdraw,
    exampleData.payment,
    exampleData.withdraw,
    exampleData.payment,
    exampleData.refresh,
    exampleData.refund,
    exampleData.tip,
    exampleData.deposit,
  ],
  balances: [
    {
      available: "TESTKUDOS:10",
      pendingIncoming: "TESTKUDOS:0",
      pendingOutgoing: "TESTKUDOS:0",
      hasPendingTransactions: false,
      requiresUserInput: false,
    },
    {
      available: "USD:10",
      pendingIncoming: "USD:0",
      pendingOutgoing: "USD:0",
      hasPendingTransactions: false,
      requiresUserInput: false,
    },
  ],
});
