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
 * Imports.
 */
import { IDBDatabase, IDBFactory, IDBTransaction } from "@gnu-taler/idb-bridge";
import { Logger } from "@gnu-taler/taler-util";
import {
  CURRENT_DB_CONFIG_KEY,
  TALER_DB_NAME,
  TALER_META_DB_NAME,
  walletMetadataStore,
  WalletStoresV1,
  WALLET_DB_MINOR_VERSION,
} from "./db.js";
import {
  DbAccess,
  IndexDescriptor,
  openDatabase,
  StoreDescriptor,
  StoreWithIndexes,
} from "./util/query.js";

const logger = new Logger("db-utils.ts");

function upgradeFromStoreMap(
  storeMap: any,
  db: IDBDatabase,
  oldVersion: number,
  newVersion: number,
  upgradeTransaction: IDBTransaction,
): void {
  if (oldVersion === 0) {
    for (const n in storeMap) {
      const swi: StoreWithIndexes<StoreDescriptor<unknown>, any> = storeMap[n];
      const storeDesc: StoreDescriptor<unknown> = swi.store;
      const s = db.createObjectStore(storeDesc.name, {
        autoIncrement: storeDesc.autoIncrement,
        keyPath: storeDesc.keyPath,
      });
      for (const indexName in swi.indexMap as any) {
        const indexDesc: IndexDescriptor = swi.indexMap[indexName];
        s.createIndex(indexDesc.name, indexDesc.keyPath, {
          multiEntry: indexDesc.multiEntry,
        });
      }
    }
    return;
  }
  if (oldVersion === newVersion) {
    return;
  }
  logger.info(`upgrading database from ${oldVersion} to ${newVersion}`);
  throw Error("upgrade not supported");
}

function onTalerDbUpgradeNeeded(
  db: IDBDatabase,
  oldVersion: number,
  newVersion: number,
  upgradeTransaction: IDBTransaction,
) {
  upgradeFromStoreMap(
    WalletStoresV1,
    db,
    oldVersion,
    newVersion,
    upgradeTransaction,
  );
}

function onMetaDbUpgradeNeeded(
  db: IDBDatabase,
  oldVersion: number,
  newVersion: number,
  upgradeTransaction: IDBTransaction,
) {
  upgradeFromStoreMap(
    walletMetadataStore,
    db,
    oldVersion,
    newVersion,
    upgradeTransaction,
  );
}

/**
 * Return a promise that resolves
 * to the taler wallet db.
 */
export async function openTalerDatabase(
  idbFactory: IDBFactory,
  onVersionChange: () => void,
): Promise<DbAccess<typeof WalletStoresV1>> {
  const metaDbHandle = await openDatabase(
    idbFactory,
    TALER_META_DB_NAME,
    1,
    () => {},
    onMetaDbUpgradeNeeded,
  );

  const metaDb = new DbAccess(metaDbHandle, walletMetadataStore);
  let currentMainVersion: string | undefined;
  await metaDb
    .mktx((x) => ({
      metaConfig: x.metaConfig,
    }))
    .runReadWrite(async (tx) => {
      const dbVersionRecord = await tx.metaConfig.get(CURRENT_DB_CONFIG_KEY);
      if (!dbVersionRecord) {
        currentMainVersion = TALER_DB_NAME;
        await tx.metaConfig.put({
          key: CURRENT_DB_CONFIG_KEY,
          value: TALER_DB_NAME,
        });
      } else {
        currentMainVersion = dbVersionRecord.value;
      }
    });

  if (currentMainVersion !== TALER_DB_NAME) {
    switch (currentMainVersion) {
      case "taler-wallet-main-v2": 
        // We consider this a pre-release
        // development version, no migration is done.
        await metaDb
          .mktx((x) => ({
            metaConfig: x.metaConfig,
          }))
          .runReadWrite(async (tx) => {
            await tx.metaConfig.put({
              key: CURRENT_DB_CONFIG_KEY,
              value: TALER_DB_NAME,
            });
          });
        break;
      default:
        throw Error(
          `migration from database ${currentMainVersion} not supported`,
        );
    }
  }

  const mainDbHandle = await openDatabase(
    idbFactory,
    TALER_DB_NAME,
    WALLET_DB_MINOR_VERSION,
    onVersionChange,
    onTalerDbUpgradeNeeded,
  );

  return new DbAccess(mainDbHandle, WalletStoresV1);
}

export function deleteTalerDatabase(idbFactory: IDBFactory): void {
  idbFactory.deleteDatabase(TALER_DB_NAME);
}
