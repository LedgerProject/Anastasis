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
import { createExample } from "../test-utils";
import { ProviderView as TestedComponent } from "./ProviderDetailPage";

export default {
  title: "wallet/backup/details",
  component: TestedComponent,
  argTypes: {
    onRetry: { action: "onRetry" },
    onDelete: { action: "onDelete" },
    onBack: { action: "onBack" },
  },
};

export const Active = createExample(TestedComponent, {
  info: {
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
      annualFee: "EUR:1",
      storageLimitInMegabytes: 16,
      supportedProtocolVersion: "0.0",
    },
  },
});

export const ActiveErrorSync = createExample(TestedComponent, {
  info: {
    active: true,
    name: "sync.demo",
    syncProviderBaseUrl: "http://sync.taler:9967/",
    lastSuccessfulBackupTimestamp: {
      t_ms: 1625063925078,
    },
    lastAttemptedBackupTimestamp: {
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
    lastError: {
      code: 2002,
      details: "details",
      hint: "error hint from the server",
      message: "message",
    },
    terms: {
      annualFee: "EUR:1",
      storageLimitInMegabytes: 16,
      supportedProtocolVersion: "0.0",
    },
  },
});

export const ActiveBackupProblemUnreadable = createExample(TestedComponent, {
  info: {
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
    backupProblem: {
      type: "backup-unreadable",
    },
    terms: {
      annualFee: "EUR:1",
      storageLimitInMegabytes: 16,
      supportedProtocolVersion: "0.0",
    },
  },
});

export const ActiveBackupProblemDevice = createExample(TestedComponent, {
  info: {
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
    backupProblem: {
      type: "backup-conflicting-device",
      myDeviceId: "my-device-id",
      otherDeviceId: "other-device-id",
      backupTimestamp: {
        t_ms: 1656599921000,
      },
    },
    terms: {
      annualFee: "EUR:1",
      storageLimitInMegabytes: 16,
      supportedProtocolVersion: "0.0",
    },
  },
});

export const InactiveUnpaid = createExample(TestedComponent, {
  info: {
    active: false,
    name: "sync.demo",
    syncProviderBaseUrl: "http://sync.demo.taler.net/",
    paymentProposalIds: [],
    paymentStatus: {
      type: ProviderPaymentType.Unpaid,
    },
    terms: {
      annualFee: "EUR:0.1",
      storageLimitInMegabytes: 16,
      supportedProtocolVersion: "0.0",
    },
  },
});

export const InactiveInsufficientBalance = createExample(TestedComponent, {
  info: {
    active: false,
    name: "sync.demo",
    syncProviderBaseUrl: "http://sync.demo.taler.net/",
    paymentProposalIds: [],
    paymentStatus: {
      type: ProviderPaymentType.InsufficientBalance,
    },
    terms: {
      annualFee: "EUR:0.1",
      storageLimitInMegabytes: 16,
      supportedProtocolVersion: "0.0",
    },
  },
});

export const InactivePending = createExample(TestedComponent, {
  info: {
    active: false,
    name: "sync.demo",
    syncProviderBaseUrl: "http://sync.demo.taler.net/",
    paymentProposalIds: [],
    paymentStatus: {
      type: ProviderPaymentType.Pending,
    },
    terms: {
      annualFee: "EUR:0.1",
      storageLimitInMegabytes: 16,
      supportedProtocolVersion: "0.0",
    },
  },
});

export const ActiveTermsChanged = createExample(TestedComponent, {
  info: {
    active: true,
    name: "sync.demo",
    syncProviderBaseUrl: "http://sync.demo.taler.net/",
    paymentProposalIds: [],
    paymentStatus: {
      type: ProviderPaymentType.TermsChanged,
      paidUntil: {
        t_ms: 1656599921000,
      },
      newTerms: {
        annualFee: "EUR:10",
        storageLimitInMegabytes: 8,
        supportedProtocolVersion: "0.0",
      },
      oldTerms: {
        annualFee: "EUR:0.1",
        storageLimitInMegabytes: 16,
        supportedProtocolVersion: "0.0",
      },
    },
    terms: {
      annualFee: "EUR:0.1",
      storageLimitInMegabytes: 16,
      supportedProtocolVersion: "0.0",
    },
  },
});
