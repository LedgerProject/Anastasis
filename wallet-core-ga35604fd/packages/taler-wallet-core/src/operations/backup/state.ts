/*
 This file is part of GNU Taler
 (C) 2020 Taler Systems SA

 GNU Taler is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 GNU Taler is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 GNU Taler; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

import { encodeCrock, getRandomBytes } from "@gnu-taler/taler-util";
import {
  ConfigRecord,
  WalletBackupConfState,
  WalletStoresV1,
  WALLET_BACKUP_STATE_KEY,
} from "../../db.js";
import { checkDbInvariant } from "../../util/invariants.js";
import { GetReadOnlyAccess } from "../../util/query.js";
import { InternalWalletState } from "../../common.js";

export async function provideBackupState(
  ws: InternalWalletState,
): Promise<WalletBackupConfState> {
  const bs: ConfigRecord | undefined = await ws.db
    .mktx((x) => ({
      config: x.config,
    }))
    .runReadOnly(async (tx) => {
      return await tx.config.get(WALLET_BACKUP_STATE_KEY);
    });
  if (bs) {
    checkDbInvariant(bs.key === WALLET_BACKUP_STATE_KEY);
    return bs.value;
  }
  // We need to generate the key outside of the transaction
  // due to how IndexedDB works.
  const k = await ws.cryptoApi.createEddsaKeypair();
  const d = getRandomBytes(5);
  // FIXME: device ID should be configured when wallet is initialized
  // and be based on hostname
  const deviceId = `wallet-core-${encodeCrock(d)}`;
  return await ws.db
    .mktx((x) => ({
      config: x.config,
    }))
    .runReadWrite(async (tx) => {
      let backupStateEntry: ConfigRecord | undefined = await tx.config.get(
        WALLET_BACKUP_STATE_KEY,
      );
      if (!backupStateEntry) {
        backupStateEntry = {
          key: WALLET_BACKUP_STATE_KEY,
          value: {
            deviceId,
            walletRootPub: k.pub,
            walletRootPriv: k.priv,
            lastBackupPlainHash: undefined,
          },
        };
        await tx.config.put(backupStateEntry);
      }
      checkDbInvariant(backupStateEntry.key === WALLET_BACKUP_STATE_KEY);
      return backupStateEntry.value;
    });
}

export async function getWalletBackupState(
  ws: InternalWalletState,
  tx: GetReadOnlyAccess<{ config: typeof WalletStoresV1.config }>,
): Promise<WalletBackupConfState> {
  const bs = await tx.config.get(WALLET_BACKUP_STATE_KEY);
  checkDbInvariant(!!bs, "wallet backup state should be in DB");
  checkDbInvariant(bs.key === WALLET_BACKUP_STATE_KEY);
  return bs.value;
}

export async function setWalletDeviceId(
  ws: InternalWalletState,
  deviceId: string,
): Promise<void> {
  await provideBackupState(ws);
  await ws.db
    .mktx((x) => ({
      config: x.config,
    }))
    .runReadWrite(async (tx) => {
      let backupStateEntry: ConfigRecord | undefined = await tx.config.get(
        WALLET_BACKUP_STATE_KEY,
      );
      if (
        !backupStateEntry ||
        backupStateEntry.key !== WALLET_BACKUP_STATE_KEY
      ) {
        return;
      }
      backupStateEntry.value.deviceId = deviceId;
      await tx.config.put(backupStateEntry);
    });
}

export async function getWalletDeviceId(
  ws: InternalWalletState,
): Promise<string> {
  const bs = await provideBackupState(ws);
  return bs.deviceId;
}
