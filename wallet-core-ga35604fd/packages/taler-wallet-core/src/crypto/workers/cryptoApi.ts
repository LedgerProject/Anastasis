/*
 This file is part of GNU Taler
 (C) 2016 GNUnet e.V.

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
 * API to access the Taler crypto worker thread.
 * @author Florian Dold
 */

/**
 * Imports.
 */
import { CoinRecord, DenominationRecord, WireFee } from "../../db.js";

import { CryptoWorker } from "./cryptoWorkerInterface.js";

import { RecoupRequest, CoinDepositPermission } from "@gnu-taler/taler-util";

import {
  BenchmarkResult,
  PlanchetCreationResult,
  PlanchetCreationRequest,
  DepositInfo,
  MakeSyncSignatureRequest,
} from "@gnu-taler/taler-util";

import * as timer from "../../util/timer.js";
import { Logger } from "@gnu-taler/taler-util";
import {
  DerivedRefreshSession,
  DerivedTipPlanchet,
  DeriveRefreshSessionRequest,
  DeriveTipRequest,
  SignTrackTransactionRequest,
} from "../cryptoTypes.js";

const logger = new Logger("cryptoApi.ts");

/**
 * State of a crypto worker.
 */
interface WorkerState {
  /**
   * The actual worker thread.
   */
  w: CryptoWorker | null;

  /**
   * Work we're currently executing or null if not busy.
   */
  currentWorkItem: WorkItem | null;

  /**
   * Timer to terminate the worker if it's not busy enough.
   */
  terminationTimerHandle: timer.TimerHandle | null;
}

interface WorkItem {
  operation: string;
  args: any[];
  resolve: any;
  reject: any;

  /**
   * Serial id to identify a matching response.
   */
  rpcId: number;

  /**
   * Time when the work was submitted to a (non-busy) worker thread.
   */
  startTime: BigInt;
}

/**
 * Number of different priorities. Each priority p
 * must be 0 <= p < NUM_PRIO.
 */
const NUM_PRIO = 5;

export interface CryptoWorkerFactory {
  /**
   * Start a new worker.
   */
  startWorker(): CryptoWorker;

  /**
   * Query the number of workers that should be
   * run at the same time.
   */
  getConcurrency(): number;
}

/**
 * Crypto API that interfaces manages a background crypto thread
 * for the execution of expensive operations.
 */
export class CryptoApi {
  private nextRpcId = 1;
  private workers: WorkerState[];
  private workQueues: WorkItem[][];

  private workerFactory: CryptoWorkerFactory;

  /**
   * Number of busy workers.
   */
  private numBusy = 0;

  /**
   * Did we stop accepting new requests?
   */
  private stopped = false;

  /**
   * Terminate all worker threads.
   */
  terminateWorkers(): void {
    for (const worker of this.workers) {
      if (worker.w) {
        logger.trace("terminating worker");
        worker.w.terminate();
        if (worker.terminationTimerHandle) {
          worker.terminationTimerHandle.clear();
          worker.terminationTimerHandle = null;
        }
        if (worker.currentWorkItem) {
          worker.currentWorkItem.reject(Error("explicitly terminated"));
          worker.currentWorkItem = null;
        }
        worker.w = null;
      }
    }
  }

  stop(): void {
    this.terminateWorkers();
    this.stopped = true;
  }

  /**
   * Start a worker (if not started) and set as busy.
   */
  wake(ws: WorkerState, work: WorkItem): void {
    if (this.stopped) {
      logger.trace("cryptoApi is stopped");
      return;
    }
    if (ws.currentWorkItem !== null) {
      throw Error("assertion failed");
    }
    ws.currentWorkItem = work;
    this.numBusy++;
    let worker: CryptoWorker;
    if (!ws.w) {
      worker = this.workerFactory.startWorker();
      worker.onmessage = (m: any) => this.handleWorkerMessage(ws, m);
      worker.onerror = (e: any) => this.handleWorkerError(ws, e);
      ws.w = worker;
    } else {
      worker = ws.w;
    }

    const msg: any = {
      args: work.args,
      id: work.rpcId,
      operation: work.operation,
    };
    this.resetWorkerTimeout(ws);
    work.startTime = timer.performanceNow();
    timer.after(0, () => worker.postMessage(msg));
  }

  resetWorkerTimeout(ws: WorkerState): void {
    if (ws.terminationTimerHandle !== null) {
      ws.terminationTimerHandle.clear();
      ws.terminationTimerHandle = null;
    }
    const destroy = (): void => {
      // terminate worker if it's idle
      if (ws.w && ws.currentWorkItem === null) {
        ws.w.terminate();
        ws.w = null;
      }
    };
    ws.terminationTimerHandle = timer.after(15 * 1000, destroy);
    //ws.terminationTimerHandle.unref();
  }

  handleWorkerError(ws: WorkerState, e: any): void {
    if (ws.currentWorkItem) {
      logger.error(`error in worker during ${ws.currentWorkItem.operation}`, e);
    } else {
      logger.error("error in worker", e);
    }
    logger.error(e.message);
    try {
      if (ws.w) {
        ws.w.terminate();
        ws.w = null;
      }
    } catch (e) {
      logger.error(e as string);
    }
    if (ws.currentWorkItem !== null) {
      ws.currentWorkItem.reject(e);
      ws.currentWorkItem = null;
      this.numBusy--;
    }
    this.findWork(ws);
  }

  private findWork(ws: WorkerState): void {
    // try to find more work for this worker
    for (let i = 0; i < NUM_PRIO; i++) {
      const q = this.workQueues[NUM_PRIO - i - 1];
      if (q.length !== 0) {
        const work: WorkItem | undefined = q.shift();
        if (!work) {
          continue;
        }
        this.wake(ws, work);
        return;
      }
    }
  }

  handleWorkerMessage(ws: WorkerState, msg: any): void {
    const id = msg.data.id;
    if (typeof id !== "number") {
      console.error("rpc id must be number");
      return;
    }
    const currentWorkItem = ws.currentWorkItem;
    ws.currentWorkItem = null;
    this.numBusy--;
    this.findWork(ws);
    if (!currentWorkItem) {
      console.error("unsolicited response from worker");
      return;
    }
    if (id !== currentWorkItem.rpcId) {
      console.error(`RPC with id ${id} has no registry entry`);
      return;
    }

    currentWorkItem.resolve(msg.data.result);
  }

  constructor(workerFactory: CryptoWorkerFactory) {
    this.workerFactory = workerFactory;
    this.workers = new Array<WorkerState>(workerFactory.getConcurrency());

    for (let i = 0; i < this.workers.length; i++) {
      this.workers[i] = {
        currentWorkItem: null,
        terminationTimerHandle: null,
        w: null,
      };
    }

    this.workQueues = [];
    for (let i = 0; i < NUM_PRIO; i++) {
      this.workQueues.push([]);
    }
  }

  private doRpc<T>(
    operation: string,
    priority: number,
    ...args: any[]
  ): Promise<T> {
    const p: Promise<T> = new Promise<T>((resolve, reject) => {
      const rpcId = this.nextRpcId++;
      const workItem: WorkItem = {
        operation,
        args,
        resolve,
        reject,
        rpcId,
        startTime: BigInt(0),
      };

      if (this.numBusy === this.workers.length) {
        const q = this.workQueues[priority];
        if (!q) {
          throw Error("assertion failed");
        }
        this.workQueues[priority].push(workItem);
        return;
      }

      for (const ws of this.workers) {
        if (ws.currentWorkItem !== null) {
          continue;
        }
        this.wake(ws, workItem);
        return;
      }

      throw Error("assertion failed");
    });

    return p;
  }

  createPlanchet(
    req: PlanchetCreationRequest,
  ): Promise<PlanchetCreationResult> {
    return this.doRpc<PlanchetCreationResult>("createPlanchet", 1, req);
  }

  createTipPlanchet(req: DeriveTipRequest): Promise<DerivedTipPlanchet> {
    return this.doRpc<DerivedTipPlanchet>("createTipPlanchet", 1, req);
  }

  signTrackTransaction(req: SignTrackTransactionRequest): Promise<string> {
    return this.doRpc<string>("signTrackTransaction", 1, req);
  }

  hashString(str: string): Promise<string> {
    return this.doRpc<string>("hashString", 1, str);
  }

  hashEncoded(encodedBytes: string): Promise<string> {
    return this.doRpc<string>("hashEncoded", 1, encodedBytes);
  }

  isValidDenom(denom: DenominationRecord, masterPub: string): Promise<boolean> {
    return this.doRpc<boolean>("isValidDenom", 2, denom, masterPub);
  }

  isValidWireFee(
    type: string,
    wf: WireFee,
    masterPub: string,
  ): Promise<boolean> {
    return this.doRpc<boolean>("isValidWireFee", 2, type, wf, masterPub);
  }

  isValidPaymentSignature(
    sig: string,
    contractHash: string,
    merchantPub: string,
  ): Promise<boolean> {
    return this.doRpc<boolean>(
      "isValidPaymentSignature",
      1,
      sig,
      contractHash,
      merchantPub,
    );
  }

  signDepositPermission(
    depositInfo: DepositInfo,
  ): Promise<CoinDepositPermission> {
    return this.doRpc<CoinDepositPermission>(
      "signDepositPermission",
      3,
      depositInfo,
    );
  }

  createEddsaKeypair(): Promise<{ priv: string; pub: string }> {
    return this.doRpc<{ priv: string; pub: string }>("createEddsaKeypair", 1);
  }

  eddsaGetPublic(key: string): Promise<{ priv: string; pub: string }> {
    return this.doRpc<{ priv: string; pub: string }>("eddsaGetPublic", 1, key);
  }

  rsaUnblind(sig: string, bk: string, pk: string): Promise<string> {
    return this.doRpc<string>("rsaUnblind", 4, sig, bk, pk);
  }

  rsaVerify(hm: string, sig: string, pk: string): Promise<boolean> {
    return this.doRpc<boolean>("rsaVerify", 4, hm, sig, pk);
  }

  isValidWireAccount(
    paytoUri: string,
    sig: string,
    masterPub: string,
  ): Promise<boolean> {
    return this.doRpc<boolean>(
      "isValidWireAccount",
      4,
      paytoUri,
      sig,
      masterPub,
    );
  }

  isValidContractTermsSignature(
    contractTermsHash: string,
    sig: string,
    merchantPub: string,
  ): Promise<boolean> {
    return this.doRpc<boolean>(
      "isValidContractTermsSignature",
      4,
      contractTermsHash,
      sig,
      merchantPub,
    );
  }

  createRecoupRequest(coin: CoinRecord): Promise<RecoupRequest> {
    return this.doRpc<RecoupRequest>("createRecoupRequest", 1, coin);
  }

  deriveRefreshSession(
    req: DeriveRefreshSessionRequest,
  ): Promise<DerivedRefreshSession> {
    return this.doRpc<DerivedRefreshSession>("deriveRefreshSession", 4, req);
  }

  signCoinLink(
    oldCoinPriv: string,
    newDenomHash: string,
    oldCoinPub: string,
    transferPub: string,
    coinEv: string,
  ): Promise<string> {
    return this.doRpc<string>(
      "signCoinLink",
      4,
      oldCoinPriv,
      newDenomHash,
      oldCoinPub,
      transferPub,
      coinEv,
    );
  }

  benchmark(repetitions: number): Promise<BenchmarkResult> {
    return this.doRpc<BenchmarkResult>("benchmark", 1, repetitions);
  }

  makeSyncSignature(req: MakeSyncSignatureRequest): Promise<string> {
    return this.doRpc<string>("makeSyncSignature", 3, req);
  }
}
