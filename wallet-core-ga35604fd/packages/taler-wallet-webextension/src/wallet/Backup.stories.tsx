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

import { ProviderPaymentType } from "@gnu-taler/taler-wallet-core";
import { addDays } from "date-fns";
import { BackupView as TestedComponent } from "./BackupPage";
import { createExample } from "../test-utils";

export default {
  title: "wallet/backup/list",
  component: TestedComponent,
  argTypes: {
    onRetry: { action: "onRetry" },
    onDelete: { action: "onDelete" },
    onBack: { action: "onBack" },
  },
};

export const LotOfProviders = createExample(TestedComponent, {
  providers: [
    {
      active: true,
      name: "sync.demo",
      syncProviderBaseUrl: "http://sync.taler:9967/",
      lastSuccessfulBackupTimestamp: {
        t_ms: 1625063925078,
      },
      paymentProposalIds: [
        "43Q5WWRJPNS4SE9YKS54H9THDS94089EDGXW9EHBPN6E7M184XEG",
      ],
      paymentStatus: {
        type: ProviderPaymentType.Paid,
        paidUntil: {
          t_ms: 1656599921000,
        },
      },
      terms: {
        annualFee: "ARS:1",
        storageLimitInMegabytes: 16,
        supportedProtocolVersion: "0.0",
      },
    },
    {
      active: true,
      name: "sync.demo",
      syncProviderBaseUrl: "http://sync.taler:9967/",
      lastSuccessfulBackupTimestamp: {
        t_ms: 1625063925078,
      },
      paymentProposalIds: [
        "43Q5WWRJPNS4SE9YKS54H9THDS94089EDGXW9EHBPN6E7M184XEG",
      ],
      paymentStatus: {
        type: ProviderPaymentType.Paid,
        paidUntil: {
          t_ms: addDays(new Date(), 13).getTime(),
        },
      },
      terms: {
        annualFee: "ARS:1",
        storageLimitInMegabytes: 16,
        supportedProtocolVersion: "0.0",
      },
    },
    {
      active: false,
      name: "sync.demo",
      syncProviderBaseUrl: "http://sync.demo.taler.net/",
      paymentProposalIds: [],
      paymentStatus: {
        type: ProviderPaymentType.Pending,
      },
      terms: {
        annualFee: "KUDOS:0.1",
        storageLimitInMegabytes: 16,
        supportedProtocolVersion: "0.0",
      },
    },
    {
      active: false,
      name: "sync.demo",
      syncProviderBaseUrl: "http://sync.demo.taler.net/",
      paymentProposalIds: [],
      paymentStatus: {
        type: ProviderPaymentType.InsufficientBalance,
      },
      terms: {
        annualFee: "KUDOS:0.1",
        storageLimitInMegabytes: 16,
        supportedProtocolVersion: "0.0",
      },
    },
    {
      active: false,
      name: "sync.demo",
      syncProviderBaseUrl: "http://sync.demo.taler.net/",
      paymentProposalIds: [],
      paymentStatus: {
        type: ProviderPaymentType.TermsChanged,
        newTerms: {
          annualFee: "USD:2",
          storageLimitInMegabytes: 8,
          supportedProtocolVersion: "2",
        },
        oldTerms: {
          annualFee: "USD:1",
          storageLimitInMegabytes: 16,
          supportedProtocolVersion: "1",
        },
        paidUntil: {
          t_ms: "never",
        },
      },
      terms: {
        annualFee: "KUDOS:0.1",
        storageLimitInMegabytes: 16,
        supportedProtocolVersion: "0.0",
      },
    },
    {
      active: false,
      name: "sync.demo",
      syncProviderBaseUrl: "http://sync.demo.taler.net/",
      paymentProposalIds: [],
      paymentStatus: {
        type: ProviderPaymentType.Unpaid,
      },
      terms: {
        annualFee: "KUDOS:0.1",
        storageLimitInMegabytes: 16,
        supportedProtocolVersion: "0.0",
      },
    },
    {
      active: false,
      name: "sync.demo",
      syncProviderBaseUrl: "http://sync.demo.taler.net/",
      paymentProposalIds: [],
      paymentStatus: {
        type: ProviderPaymentType.Unpaid,
      },
      terms: {
        annualFee: "KUDOS:0.1",
        storageLimitInMegabytes: 16,
        supportedProtocolVersion: "0.0",
      },
    },
  ],
});

export const OneProvider = createExample(TestedComponent, {
  providers: [
    {
      active: true,
      name: "sync.demo",
      syncProviderBaseUrl: "http://sync.taler:9967/",
      lastSuccessfulBackupTimestamp: {
        t_ms: 1625063925078,
      },
      paymentProposalIds: [
        "43Q5WWRJPNS4SE9YKS54H9THDS94089EDGXW9EHBPN6E7M184XEG",
      ],
      paymentStatus: {
        type: ProviderPaymentType.Paid,
        paidUntil: {
          t_ms: 1656599921000,
        },
      },
      terms: {
        annualFee: "ARS:1",
        storageLimitInMegabytes: 16,
        supportedProtocolVersion: "0.0",
      },
    },
  ],
});

export const Empty = createExample(TestedComponent, {
  providers: [],
});
