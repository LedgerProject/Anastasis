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

import {
  ProviderInfo,
  ProviderPaymentPaid,
  ProviderPaymentStatus,
  ProviderPaymentType,
} from "@gnu-taler/taler-wallet-core";
import { useEffect, useState } from "preact/hooks";
import * as wxApi from "../wxApi";

export interface BackupStatus {
  deviceName: string;
  providers: ProviderInfo[];
  sync: () => Promise<void>;
}

function getStatusTypeOrder(t: ProviderPaymentStatus) {
  return [
    ProviderPaymentType.InsufficientBalance,
    ProviderPaymentType.TermsChanged,
    ProviderPaymentType.Unpaid,
    ProviderPaymentType.Paid,
    ProviderPaymentType.Pending,
  ].indexOf(t.type);
}

function getStatusPaidOrder(a: ProviderPaymentPaid, b: ProviderPaymentPaid) {
  return a.paidUntil.t_ms === "never"
    ? -1
    : b.paidUntil.t_ms === "never"
    ? 1
    : a.paidUntil.t_ms - b.paidUntil.t_ms;
}

export function useBackupStatus(): BackupStatus | undefined {
  const [status, setStatus] = useState<BackupStatus | undefined>(undefined);

  useEffect(() => {
    async function run() {
      //create a first list of backup info by currency
      const status = await wxApi.getBackupInfo();

      const providers = status.providers.sort((a, b) => {
        if (
          a.paymentStatus.type === ProviderPaymentType.Paid &&
          b.paymentStatus.type === ProviderPaymentType.Paid
        ) {
          return getStatusPaidOrder(a.paymentStatus, b.paymentStatus);
        }
        return (
          getStatusTypeOrder(a.paymentStatus) -
          getStatusTypeOrder(b.paymentStatus)
        );
      });

      async function sync() {
        await wxApi.syncAllProviders();
      }

      setStatus({ deviceName: status.deviceId, providers, sync });
    }
    run();
  }, []);

  return status;
}
