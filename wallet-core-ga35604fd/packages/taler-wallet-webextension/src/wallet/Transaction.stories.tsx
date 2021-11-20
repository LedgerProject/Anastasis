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
import { TransactionView as TestedComponent } from "./Transaction";

export default {
  title: "wallet/history/details",
  component: TestedComponent,
  argTypes: {
    onRetry: { action: "onRetry" },
    onDelete: { action: "onDelete" },
    onBack: { action: "onBack" },
  },
};

const commonTransaction = {
  amountRaw: "KUDOS:11",
  amountEffective: "KUDOS:9.2",
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
    exchangeBaseUrl: "http://exchange.taler",
    withdrawalDetails: {
      confirmed: false,
      reservePub: "A05AJGMFNSK4Q62NXR2FKNDB1J4EXTYQTE7VA4M9GZQ4TR06YBNG",
      exchangePaytoUris: ["payto://x-taler-bank/bank/account"],
      type: WithdrawalType.ManualTransfer,
    },
  } as TransactionWithdrawal,
  payment: {
    ...commonTransaction,
    amountEffective: "KUDOS:11",
    type: TransactionType.Payment,
    info: {
      contractTermsHash: "ASDZXCASD",
      merchant: {
        name: "the merchant",
      },
      orderId: "2021.167-03NPY6MCYMVGT",
      products: [],
      summary: "Essay: Why the Devil's Advocate Doesn't Help Reach the Truth",
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

const transactionError = {
  code: 2000,
  details: "details",
  hint: "this is a hint for the error",
  message: "message",
};

export const Withdraw = createExample(TestedComponent, {
  transaction: exampleData.withdraw,
});

export const WithdrawError = createExample(TestedComponent, {
  transaction: {
    ...exampleData.withdraw,
    error: transactionError,
  },
});

export const WithdrawPendingManual = createExample(TestedComponent, {
  transaction: {
    ...exampleData.withdraw,
    withdrawalDetails: {
      type: WithdrawalType.ManualTransfer,
      exchangePaytoUris: ["payto://iban/asdasdasd"],
      reservePub: "A05AJGMFNSK4Q62NXR2FKNDB1J4EXTYQTE7VA4M9GZQ4TR06YBNG",
    },
    pending: true,
  },
});

export const WithdrawPendingTalerBankUnconfirmed = createExample(
  TestedComponent,
  {
    transaction: {
      ...exampleData.withdraw,
      withdrawalDetails: {
        type: WithdrawalType.TalerBankIntegrationApi,
        confirmed: false,
        reservePub: "A05AJGMFNSK4Q62NXR2FKNDB1J4EXTYQTE7VA4M9GZQ4TR06YBNG",
        bankConfirmationUrl: "http://bank.demo.taler.net",
      },
      pending: true,
    },
  },
);

export const WithdrawPendingTalerBankConfirmed = createExample(
  TestedComponent,
  {
    transaction: {
      ...exampleData.withdraw,
      withdrawalDetails: {
        type: WithdrawalType.TalerBankIntegrationApi,
        confirmed: true,
        reservePub: "A05AJGMFNSK4Q62NXR2FKNDB1J4EXTYQTE7VA4M9GZQ4TR06YBNG",
      },
      pending: true,
    },
  },
);

export const Payment = createExample(TestedComponent, {
  transaction: exampleData.payment,
});

export const PaymentError = createExample(TestedComponent, {
  transaction: {
    ...exampleData.payment,
    error: transactionError,
  },
});

export const PaymentWithoutFee = createExample(TestedComponent, {
  transaction: {
    ...exampleData.payment,
    amountRaw: "KUDOS:11",
  },
});

export const PaymentPending = createExample(TestedComponent, {
  transaction: { ...exampleData.payment, pending: true },
});

export const PaymentWithProducts = createExample(TestedComponent, {
  transaction: {
    ...exampleData.payment,
    info: {
      ...exampleData.payment.info,
      summary: "this order has 5 products",
      products: [
        {
          description: "t-shirt",
          unit: "shirts",
          quantity: 1,
        },
        {
          description: "t-shirt",
          unit: "shirts",
          quantity: 1,
        },
        {
          description: "e-book",
        },
        {
          description: "beer",
          unit: "pint",
          quantity: 15,
        },
        {
          description: "beer",
          unit: "pint",
          quantity: 15,
        },
      ],
    },
  } as TransactionPayment,
});

export const PaymentWithLongSummary = createExample(TestedComponent, {
  transaction: {
    ...exampleData.payment,
    info: {
      ...exampleData.payment.info,
      summary:
        "this is a very long summary that will occupy severals lines, this is a very long summary that will occupy severals lines, this is a very long summary that will occupy severals lines, this is a very long summary that will occupy severals lines, ",
      products: [
        {
          description:
            "an xl sized t-shirt with some drawings on it, color pink",
          unit: "shirts",
          quantity: 1,
        },
        {
          description: "beer",
          unit: "pint",
          quantity: 15,
        },
      ],
    },
  } as TransactionPayment,
});

export const Deposit = createExample(TestedComponent, {
  transaction: exampleData.deposit,
});

export const DepositError = createExample(TestedComponent, {
  transaction: {
    ...exampleData.deposit,
    error: transactionError,
  },
});

export const DepositPending = createExample(TestedComponent, {
  transaction: { ...exampleData.deposit, pending: true },
});

export const Refresh = createExample(TestedComponent, {
  transaction: exampleData.refresh,
});

export const RefreshError = createExample(TestedComponent, {
  transaction: {
    ...exampleData.refresh,
    error: transactionError,
  },
});

export const Tip = createExample(TestedComponent, {
  transaction: exampleData.tip,
});

export const TipError = createExample(TestedComponent, {
  transaction: {
    ...exampleData.tip,
    error: transactionError,
  },
});

export const TipPending = createExample(TestedComponent, {
  transaction: { ...exampleData.tip, pending: true },
});

export const Refund = createExample(TestedComponent, {
  transaction: exampleData.refund,
});

export const RefundError = createExample(TestedComponent, {
  transaction: {
    ...exampleData.refund,
    error: transactionError,
  },
});

export const RefundPending = createExample(TestedComponent, {
  transaction: { ...exampleData.refund, pending: true },
});

export const RefundWithProducts = createExample(TestedComponent, {
  transaction: {
    ...exampleData.refund,
    info: {
      ...exampleData.refund.info,
      products: [
        {
          description: "t-shirt",
        },
        {
          description: "beer",
        },
      ],
    },
  } as TransactionRefund,
});
