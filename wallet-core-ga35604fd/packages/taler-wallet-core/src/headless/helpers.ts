/*
 This file is part of GNU Taler
 (C) 2019 Taler Systems S.A.

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
 * Helpers to create headless wallets.
 * @author Florian Dold <dold@taler.net>
 */

/**
 * Imports.
 */
import {
  MemoryBackend,
  BridgeIDBFactory,
  shimIndexedDB,
} from "@gnu-taler/idb-bridge";
import { openTalerDatabase } from "../db-utils.js";
import { HttpRequestLibrary } from "../util/http.js";
import { NodeThreadCryptoWorkerFactory } from "../crypto/workers/nodeThreadWorker.js";
import { NodeHttpLib } from "./NodeHttpLib.js";
import { Logger } from "@gnu-taler/taler-util";
import { SynchronousCryptoWorkerFactory } from "../crypto/workers/synchronousWorker.js";
import type { IDBFactory } from "@gnu-taler/idb-bridge";
import { WalletNotification } from "@gnu-taler/taler-util";
import { Wallet } from "../wallet.js";
import * as fs from "fs";

const logger = new Logger("headless/helpers.ts");

export interface DefaultNodeWalletArgs {
  /**
   * Location of the wallet database.
   *
   * If not specified, the wallet starts out with an empty database and
   * the wallet database is stored only in memory.
   */
  persistentStoragePath?: string;

  /**
   * Handler for asynchronous notifications from the wallet.
   */
  notifyHandler?: (n: WalletNotification) => void;

  /**
   * If specified, use this as HTTP request library instead
   * of the default one.
   */
  httpLib?: HttpRequestLibrary;
}

/**
 * Generate a random alphanumeric ID.  Does *not* use cryptographically
 * secure randomness.
 */
function makeId(length: number): string {
  let result = "";
  const characters = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

/**
 * Get a wallet instance with default settings for node.
 */
export async function getDefaultNodeWallet(
  args: DefaultNodeWalletArgs = {},
): Promise<Wallet> {
  BridgeIDBFactory.enableTracing = false;
  const myBackend = new MemoryBackend();
  myBackend.enableTracing = false;

  const storagePath = args.persistentStoragePath;
  if (storagePath) {
    try {
      const dbContentStr: string = fs.readFileSync(storagePath, {
        encoding: "utf-8",
      });
      const dbContent = JSON.parse(dbContentStr);
      myBackend.importDump(dbContent);
    } catch (e: any) {
      const code: string = e.code;
      if (code === "ENOENT") {
        logger.trace("wallet file doesn't exist yet");
      } else {
        logger.error("could not open wallet database file");
        throw e;
      }
    }

    myBackend.afterCommitCallback = async () => {
      logger.trace("committing database");
      // Allow caller to stop persisting the wallet.
      if (args.persistentStoragePath === undefined) {
        return;
      }
      const tmpPath = `${args.persistentStoragePath}-${makeId(5)}.tmp`;
      const dbContent = myBackend.exportDump();
      fs.writeFileSync(tmpPath, JSON.stringify(dbContent, undefined, 2), {
        encoding: "utf-8",
      });
      // Atomically move the temporary file onto the DB path.
      fs.renameSync(tmpPath, args.persistentStoragePath);
    };
  }

  BridgeIDBFactory.enableTracing = false;

  const myBridgeIdbFactory = new BridgeIDBFactory(myBackend);
  const myIdbFactory: IDBFactory = (myBridgeIdbFactory as any) as IDBFactory;

  let myHttpLib;
  if (args.httpLib) {
    myHttpLib = args.httpLib;
  } else {
    myHttpLib = new NodeHttpLib();
  }

  const myVersionChange = (): Promise<void> => {
    logger.error("version change requested, should not happen");
    throw Error(
      "BUG: wallet DB version change event can't happen with memory IDB",
    );
  };

  shimIndexedDB(myBridgeIdbFactory);

  const myDb = await openTalerDatabase(myIdbFactory, myVersionChange);

  let workerFactory;
  if (process.env["TALER_WALLET_SYNC_CRYPTO"]) {
    logger.info("using synchronous crypto worker");
    workerFactory = new SynchronousCryptoWorkerFactory();
  } else {
    try {
      // Try if we have worker threads available, fails in older node versions.
      const _r = "require";
      const worker_threads = module[_r]("worker_threads");
      // require("worker_threads");
      workerFactory = new NodeThreadCryptoWorkerFactory();
    } catch (e) {
      logger.warn(
        "worker threads not available, falling back to synchronous workers",
      );
      workerFactory = new SynchronousCryptoWorkerFactory();
    }
  }
  const w = await Wallet.create(myDb, myHttpLib, workerFactory);

  if (args.notifyHandler) {
    w.addNotificationListener(args.notifyHandler);
  }
  return w;
}
