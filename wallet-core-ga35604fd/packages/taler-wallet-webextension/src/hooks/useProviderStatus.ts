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

import { ProviderInfo } from "@gnu-taler/taler-wallet-core";
import { useEffect, useState } from "preact/hooks";
import * as wxApi from "../wxApi";

export interface ProviderStatus {
  info?: ProviderInfo;
  sync: () => Promise<void>;
  remove: () => Promise<void>;
}

export function useProviderStatus(url: string): ProviderStatus | undefined {
  const [status, setStatus] = useState<ProviderStatus | undefined>(undefined);

  useEffect(() => {
    async function run() {
      //create a first list of backup info by currency
      const status = await wxApi.getBackupInfo();

      const providers = status.providers.filter(
        (p) => p.syncProviderBaseUrl === url,
      );
      const info = providers.length ? providers[0] : undefined;

      async function sync() {
        if (info) {
          await wxApi.syncOneProvider(info.syncProviderBaseUrl);
        }
      }

      async function remove() {
        if (info) {
          await wxApi.removeProvider(info.syncProviderBaseUrl);
        }
      }

      setStatus({ info, sync, remove });
    }
    run();
  }, []);

  return status;
}
