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

import { ContractTerms, PreparePayResultType } from "@gnu-taler/taler-util";
import { createExample } from "../test-utils";
import { PaymentRequestView as TestedComponent } from "./Pay";

export default {
  title: "cta/pay",
  component: TestedComponent,
  argTypes: {},
};

export const NoBalance = createExample(TestedComponent, {
  payStatus: {
    status: PreparePayResultType.InsufficientBalance,
    noncePriv: "",
    proposalId: "proposal1234",
    contractTerms: ({
      merchant: {
        name: "someone",
      },
      summary: "some beers",
      amount: "USD:10",
    } as Partial<ContractTerms>) as any,
    amountRaw: "USD:10",
  },
});

export const NoEnoughBalance = createExample(TestedComponent, {
  payStatus: {
    status: PreparePayResultType.InsufficientBalance,
    noncePriv: "",
    proposalId: "proposal1234",
    contractTerms: ({
      merchant: {
        name: "someone",
      },
      summary: "some beers",
      amount: "USD:10",
    } as Partial<ContractTerms>) as any,
    amountRaw: "USD:10",
  },
  balance: {
    currency: "USD",
    fraction: 40000000,
    value: 9,
  },
});

export const PaymentPossible = createExample(TestedComponent, {
  uri:
    "taler://pay/merchant-backend.taler/2021.242-01G2X4275RBWG/?c=66BE594PDZR24744J6EQK52XM0",
  payStatus: {
    status: PreparePayResultType.PaymentPossible,
    amountEffective: "USD:10",
    amountRaw: "USD:10",
    noncePriv: "",
    contractTerms: ({
      nonce: "123213123",
      merchant: {
        name: "someone",
      },
      amount: "USD:10",
      summary: "some beers",
    } as Partial<ContractTerms>) as any,
    contractTermsHash: "123456",
    proposalId: "proposal1234",
  },
});

export const PaymentPossibleWithFee = createExample(TestedComponent, {
  uri:
    "taler://pay/merchant-backend.taler/2021.242-01G2X4275RBWG/?c=66BE594PDZR24744J6EQK52XM0",
  payStatus: {
    status: PreparePayResultType.PaymentPossible,
    amountEffective: "USD:10.20",
    amountRaw: "USD:10",
    noncePriv: "",
    contractTerms: ({
      nonce: "123213123",
      merchant: {
        name: "someone",
      },
      amount: "USD:10",
      summary: "some beers",
    } as Partial<ContractTerms>) as any,
    contractTermsHash: "123456",
    proposalId: "proposal1234",
  },
});

export const AlreadyConfirmedWithFullfilment = createExample(TestedComponent, {
  payStatus: {
    status: PreparePayResultType.AlreadyConfirmed,
    amountEffective: "USD:10",
    amountRaw: "USD:10",
    contractTerms: ({
      merchant: {
        name: "someone",
      },
      fulfillment_message:
        "congratulations! you are looking at the fulfillment message! ",
      summary: "some beers",
      amount: "USD:10",
    } as Partial<ContractTerms>) as any,
    contractTermsHash: "123456",
    proposalId: "proposal1234",
    paid: false,
  },
});

export const AlreadyConfirmedWithoutFullfilment = createExample(
  TestedComponent,
  {
    payStatus: {
      status: PreparePayResultType.AlreadyConfirmed,
      amountEffective: "USD:10",
      amountRaw: "USD:10",
      contractTerms: ({
        merchant: {
          name: "someone",
        },
        summary: "some beers",
        amount: "USD:10",
      } as Partial<ContractTerms>) as any,
      contractTermsHash: "123456",
      proposalId: "proposal1234",
      paid: false,
    },
  },
);

export const AlreadyPaid = createExample(TestedComponent, {
  payStatus: {
    status: PreparePayResultType.AlreadyConfirmed,
    amountEffective: "USD:10",
    amountRaw: "USD:10",
    contractTerms: ({
      merchant: {
        name: "someone",
      },
      fulfillment_message:
        "congratulations! you are looking at the fulfillment message! ",
      summary: "some beers",
      amount: "USD:10",
    } as Partial<ContractTerms>) as any,
    contractTermsHash: "123456",
    proposalId: "proposal1234",
    paid: true,
  },
});
