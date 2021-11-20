"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserCryptoWorkerFactory = void 0;
/**
 * API to access the Taler crypto worker thread.
 * @author Florian Dold
 */
class BrowserCryptoWorkerFactory {
  startWorker() {
    const workerCtor = Worker;
    const workerPath = "/browserWorkerEntry.js";
    return new workerCtor(workerPath);
  }
  getConcurrency() {
    let concurrency = 2;
    try {
      // only works in the browser
      // tslint:disable-next-line:no-string-literal
      concurrency = navigator["hardwareConcurrency"];
      concurrency = Math.max(1, Math.ceil(concurrency / 2));
    } catch (e) {
      concurrency = 2;
    }
    return concurrency;
  }
}
exports.BrowserCryptoWorkerFactory = BrowserCryptoWorkerFactory;
//# sourceMappingURL=browserCryptoWorkerFactory.js.map
