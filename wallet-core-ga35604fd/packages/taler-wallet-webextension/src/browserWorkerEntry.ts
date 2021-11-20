/*
 This file is part of TALER
 (C) 2016 GNUnet e.V.

 TALER is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 TALER is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 TALER; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
*/

/**
 * Web worker for crypto operations.
 */

/**
 * Imports.
 */

import { Logger } from "@gnu-taler/taler-util";
import { CryptoImplementation } from "@gnu-taler/taler-wallet-core";

const logger = new Logger("browserWorkerEntry.ts");

const worker: Worker = (self as any) as Worker;

async function handleRequest(
  operation: string,
  id: number,
  args: string[],
): Promise<void> {
  const impl = new CryptoImplementation();

  if (!(operation in impl)) {
    console.error(`crypto operation '${operation}' not found`);
    return;
  }

  try {
    const result = await (impl as any)[operation](...args);
    worker.postMessage({ result, id });
  } catch (e) {
    logger.error("error during operation", e);
    return;
  }
}

worker.onmessage = (msg: MessageEvent) => {
  const args = msg.data.args;
  if (!Array.isArray(args)) {
    console.error("args must be array");
    return;
  }
  const id = msg.data.id;
  if (typeof id !== "number") {
    console.error("RPC id must be number");
    return;
  }
  const operation = msg.data.operation;
  if (typeof operation !== "string") {
    console.error("RPC operation must be string");
    return;
  }

  handleRequest(operation, id, args).catch((e) => {
    console.error("error in browser worker", e);
  });
};
