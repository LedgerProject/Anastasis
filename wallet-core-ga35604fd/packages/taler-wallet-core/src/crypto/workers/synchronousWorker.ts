/*
 This file is part of GNU Taler
 (C) 2019 GNUnet e.V.

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
  CryptoImplementation,
  PrimitiveWorker,
} from "./cryptoImplementation.js";

import { CryptoWorkerFactory } from "./cryptoApi.js";
import { CryptoWorker } from "./cryptoWorkerInterface.js";

import child_process from "child_process";
import type internal from "stream";
import { OpenedPromise, openPromise } from "../../index.js";
import { FreshCoin, Logger } from "@gnu-taler/taler-util";

const logger = new Logger("synchronousWorker.ts");

class MyPrimitiveWorker implements PrimitiveWorker {
  proc: child_process.ChildProcessByStdio<
    internal.Writable,
    internal.Readable,
    null
  >;
  requests: Array<{
    p: OpenedPromise<any>;
    req: any;
  }> = [];

  constructor() {
    const stdoutChunks: Buffer[] = [];
    this.proc = child_process.spawn("taler-crypto-worker", {
      //stdio: ["pipe", "pipe", "inherit"],
      stdio: ["pipe", "pipe", "inherit"],
      detached: true,
    });
    this.proc.on("close", function (code) {
      logger.error("child process exited");
    });
    (this.proc.stdout as any).unref();
    (this.proc.stdin as any).unref();
    this.proc.unref();

    this.proc.stdout.on("data", (x) => {
      // console.log("got chunk", x.toString("utf-8"));
      if (x instanceof Buffer) {
        const nlIndex = x.indexOf("\n");
        if (nlIndex >= 0) {
          const before = x.slice(0, nlIndex);
          const after = x.slice(nlIndex + 1);
          stdoutChunks.push(after);
          const str = Buffer.concat([...stdoutChunks, before]).toString(
            "utf-8",
          );
          const req = this.requests.shift()!;
          if (this.requests.length === 0) {
            this.proc.unref();
          }
          //logger.info(`got response: ${str}`);
          req.p.resolve(JSON.parse(str));
        } else {
          stdoutChunks.push(x);
        }
      } else {
        throw Error(`unexpected data chunk type (${typeof x})`);
      }
    });
  }

  async setupRefreshPlanchet(req: {
    transfer_secret: string;
    coin_index: number;
  }): Promise<{
    coin_pub: string;
    coin_priv: string;
    blinding_key: string;
  }> {
    return this.queueRequest({
      op: "setup_refresh_planchet",
      args: req,
    });
  }

  async queueRequest(req: any): Promise<any> {
    const p = openPromise<any>();
    if (this.requests.length === 0) {
      this.proc.ref();
    }
    this.requests.push({ req, p });
    this.proc.stdin.write(JSON.stringify(req) + "\n");
    return p.promise;
  }

  async eddsaVerify(req: {
    msg: string;
    sig: string;
    pub: string;
  }): Promise<{ valid: boolean }> {
    return this.queueRequest({
      op: "eddsa_verify",
      args: req,
    });
  }
}

/**
 * The synchronous crypto worker produced by this factory doesn't run in the
 * background, but actually blocks the caller until the operation is done.
 */
export class SynchronousCryptoWorkerFactory implements CryptoWorkerFactory {
  startWorker(): CryptoWorker {
    if (typeof require === "undefined") {
      throw Error("cannot make worker, require(...) not defined");
    }
    return new SynchronousCryptoWorker();
  }

  getConcurrency(): number {
    return 1;
  }
}

/**
 * Worker implementation that uses node subprocesses.
 */
export class SynchronousCryptoWorker {
  /**
   * Function to be called when we receive a message from the worker thread.
   */
  onmessage: undefined | ((m: any) => void);

  /**
   * Function to be called when we receive an error from the worker thread.
   */
  onerror: undefined | ((m: any) => void);

  primitiveWorker: PrimitiveWorker;

  constructor() {
    this.onerror = undefined;
    this.onmessage = undefined;
    if (process.env["TALER_WALLET_PRIMITIVE_WORKER"]) {
      this.primitiveWorker = new MyPrimitiveWorker();
    }
  }

  /**
   * Add an event listener for either an "error" or "message" event.
   */
  addEventListener(event: "message" | "error", fn: (x: any) => void): void {
    switch (event) {
      case "message":
        this.onmessage = fn;
        break;
      case "error":
        this.onerror = fn;
        break;
    }
  }

  private dispatchMessage(msg: any): void {
    if (this.onmessage) {
      this.onmessage({ data: msg });
    }
  }

  private async handleRequest(
    operation: string,
    id: number,
    args: string[],
  ): Promise<void> {
    const impl = new CryptoImplementation(this.primitiveWorker);

    if (!(operation in impl)) {
      console.error(`crypto operation '${operation}' not found`);
      return;
    }

    let result: any;
    try {
      result = await (impl as any)[operation](...args);
    } catch (e) {
      logger.error("error during operation", e);
      return;
    }

    try {
      setTimeout(() => this.dispatchMessage({ result, id }), 0);
    } catch (e) {
      logger.error("got error during dispatch", e);
    }
  }

  /**
   * Send a message to the worker thread.
   */
  postMessage(msg: any): void {
    const args = msg.args;
    if (!Array.isArray(args)) {
      console.error("args must be array");
      return;
    }
    const id = msg.id;
    if (typeof id !== "number") {
      console.error("RPC id must be number");
      return;
    }
    const operation = msg.operation;
    if (typeof operation !== "string") {
      console.error("RPC operation must be string");
      return;
    }

    this.handleRequest(operation, id, args).catch((e) => {
      console.error("Error while handling crypto request:", e);
    });
  }

  /**
   * Forcibly terminate the worker thread.
   */
  terminate(): void {
    // This is a no-op.
  }
}
