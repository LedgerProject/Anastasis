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
 * API to access the Taler crypto worker thread.
 * @author Florian Dold
 */

import type {
  CryptoWorker,
  CryptoWorkerFactory,
} from "@gnu-taler/taler-wallet-core";

export class BrowserCryptoWorkerFactory implements CryptoWorkerFactory {
  startWorker(): CryptoWorker {
    const workerCtor = Worker;
    const workerPath = "/dist/browserWorkerEntry.js";
    return new workerCtor(workerPath) as CryptoWorker;
  }

  getConcurrency(): number {
    let concurrency = 2;
    try {
      // only works in the browser
      // tslint:disable-next-line:no-string-literal
      concurrency = (navigator as any)["hardwareConcurrency"];
      concurrency = Math.max(1, Math.ceil(concurrency / 2));
    } catch (e) {
      concurrency = 2;
    }
    return concurrency;
  }
}
