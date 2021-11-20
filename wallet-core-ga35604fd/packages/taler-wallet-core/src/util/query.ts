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
 * Database query abstractions.
 * @module Query
 * @author Florian Dold
 */

/**
 * Imports.
 */
import { openPromise } from "./promiseUtils.js";
import {
  IDBRequest,
  IDBTransaction,
  IDBValidKey,
  IDBDatabase,
  IDBFactory,
  IDBVersionChangeEvent,
  IDBCursor,
  IDBKeyPath,
} from "@gnu-taler/idb-bridge";
import { Logger } from "@gnu-taler/taler-util";
import { performanceNow } from "./timer.js";

const logger = new Logger("query.ts");

/**
 * Exception that should be thrown by client code to abort a transaction.
 */
export const TransactionAbort = Symbol("transaction_abort");

/**
 * Options for an index.
 */
export interface IndexOptions {
  /**
   * If true and the path resolves to an array, create an index entry for
   * each member of the array (instead of one index entry containing the full array).
   *
   * Defaults to false.
   */
  multiEntry?: boolean;

  /**
   * Database version that this store was added in, or
   * undefined if added in the first version.
   */
  versionAdded?: number;
}

function requestToPromise(req: IDBRequest): Promise<any> {
  const stack = Error("Failed request was started here.");
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      console.error("error in DB request", req.error);
      reject(req.error);
      console.error("Request failed:", stack);
    };
  });
}

type CursorResult<T> = CursorEmptyResult<T> | CursorValueResult<T>;

interface CursorEmptyResult<T> {
  hasValue: false;
}

interface CursorValueResult<T> {
  hasValue: true;
  value: T;
}

class TransactionAbortedError extends Error {
  constructor(m: string) {
    super(m);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, TransactionAbortedError.prototype);
  }
}

class ResultStream<T> {
  private currentPromise: Promise<void>;
  private gotCursorEnd = false;
  private awaitingResult = false;

  constructor(private req: IDBRequest) {
    this.awaitingResult = true;
    let p = openPromise<void>();
    this.currentPromise = p.promise;
    req.onsuccess = () => {
      if (!this.awaitingResult) {
        throw Error("BUG: invariant violated");
      }
      const cursor = req.result;
      if (cursor) {
        this.awaitingResult = false;
        p.resolve();
        p = openPromise<void>();
        this.currentPromise = p.promise;
      } else {
        this.gotCursorEnd = true;
        p.resolve();
      }
    };
    req.onerror = () => {
      p.reject(req.error);
    };
  }

  async toArray(): Promise<T[]> {
    const arr: T[] = [];
    while (true) {
      const x = await this.next();
      if (x.hasValue) {
        arr.push(x.value);
      } else {
        break;
      }
    }
    return arr;
  }

  async map<R>(f: (x: T) => R): Promise<R[]> {
    const arr: R[] = [];
    while (true) {
      const x = await this.next();
      if (x.hasValue) {
        arr.push(f(x.value));
      } else {
        break;
      }
    }
    return arr;
  }

  async forEachAsync(f: (x: T) => Promise<void>): Promise<void> {
    while (true) {
      const x = await this.next();
      if (x.hasValue) {
        await f(x.value);
      } else {
        break;
      }
    }
  }

  async forEach(f: (x: T) => void): Promise<void> {
    while (true) {
      const x = await this.next();
      if (x.hasValue) {
        f(x.value);
      } else {
        break;
      }
    }
  }

  async filter(f: (x: T) => boolean): Promise<T[]> {
    const arr: T[] = [];
    while (true) {
      const x = await this.next();
      if (x.hasValue) {
        if (f(x.value)) {
          arr.push(x.value);
        }
      } else {
        break;
      }
    }
    return arr;
  }

  async next(): Promise<CursorResult<T>> {
    if (this.gotCursorEnd) {
      return { hasValue: false };
    }
    if (!this.awaitingResult) {
      const cursor: IDBCursor | undefined = this.req.result;
      if (!cursor) {
        throw Error("assertion failed");
      }
      this.awaitingResult = true;
      cursor.continue();
    }
    await this.currentPromise;
    if (this.gotCursorEnd) {
      return { hasValue: false };
    }
    const cursor = this.req.result;
    if (!cursor) {
      throw Error("assertion failed");
    }
    return { hasValue: true, value: cursor.value };
  }
}

/**
 * Return a promise that resolves to the opened IndexedDB database.
 */
export function openDatabase(
  idbFactory: IDBFactory,
  databaseName: string,
  databaseVersion: number,
  onVersionChange: () => void,
  onUpgradeNeeded: (
    db: IDBDatabase,
    oldVersion: number,
    newVersion: number,
    upgradeTransaction: IDBTransaction,
  ) => void,
): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = idbFactory.open(databaseName, databaseVersion);
    req.onerror = (e) => {
      logger.error("database error", e);
      reject(new Error("database error"));
    };
    req.onsuccess = (e) => {
      req.result.onversionchange = (evt: IDBVersionChangeEvent) => {
        logger.info(
          `handling live db version change from ${evt.oldVersion} to ${evt.newVersion}`,
        );
        req.result.close();
        onVersionChange();
      };
      resolve(req.result);
    };
    req.onupgradeneeded = (e) => {
      const db = req.result;
      const newVersion = e.newVersion;
      if (!newVersion) {
        throw Error("upgrade needed, but new version unknown");
      }
      const transaction = req.transaction;
      if (!transaction) {
        throw Error("no transaction handle available in upgrade handler");
      }
      onUpgradeNeeded(db, e.oldVersion, newVersion, transaction);
    };
  });
}

export interface IndexDescriptor {
  name: string;
  keyPath: IDBKeyPath | IDBKeyPath[];
  multiEntry?: boolean;
}

export interface StoreDescriptor<RecordType> {
  _dummy: undefined & RecordType;
  name: string;
  keyPath?: IDBKeyPath | IDBKeyPath[];
  autoIncrement?: boolean;
}

export interface StoreOptions {
  keyPath?: IDBKeyPath | IDBKeyPath[];
  autoIncrement?: boolean;
}

export function describeContents<RecordType = never>(
  name: string,
  options: StoreOptions,
): StoreDescriptor<RecordType> {
  return { name, keyPath: options.keyPath, _dummy: undefined as any };
}

export function describeIndex(
  name: string,
  keyPath: IDBKeyPath | IDBKeyPath[],
  options: IndexOptions = {},
): IndexDescriptor {
  return {
    keyPath,
    name,
    multiEntry: options.multiEntry,
  };
}

interface IndexReadOnlyAccessor<RecordType> {
  iter(query?: IDBValidKey): ResultStream<RecordType>;
  get(query: IDBValidKey): Promise<RecordType | undefined>;
  getAll(query: IDBValidKey, count?: number): Promise<RecordType[]>;
}

type GetIndexReadOnlyAccess<RecordType, IndexMap> = {
  [P in keyof IndexMap]: IndexReadOnlyAccessor<RecordType>;
};

interface IndexReadWriteAccessor<RecordType> {
  iter(query: IDBValidKey): ResultStream<RecordType>;
  get(query: IDBValidKey): Promise<RecordType | undefined>;
  getAll(query: IDBValidKey, count?: number): Promise<RecordType[]>;
}

type GetIndexReadWriteAccess<RecordType, IndexMap> = {
  [P in keyof IndexMap]: IndexReadWriteAccessor<RecordType>;
};

export interface StoreReadOnlyAccessor<RecordType, IndexMap> {
  get(key: IDBValidKey): Promise<RecordType | undefined>;
  iter(query?: IDBValidKey): ResultStream<RecordType>;
  indexes: GetIndexReadOnlyAccess<RecordType, IndexMap>;
}

export interface StoreReadWriteAccessor<RecordType, IndexMap> {
  get(key: IDBValidKey): Promise<RecordType | undefined>;
  iter(query?: IDBValidKey): ResultStream<RecordType>;
  put(r: RecordType): Promise<void>;
  add(r: RecordType): Promise<void>;
  delete(key: IDBValidKey): Promise<void>;
  indexes: GetIndexReadWriteAccess<RecordType, IndexMap>;
}

export interface StoreWithIndexes<
  SD extends StoreDescriptor<unknown>,
  IndexMap
> {
  store: SD;
  indexMap: IndexMap;

  /**
   * Type marker symbol, to check that the descriptor
   * has been created through the right function.
   */
  mark: Symbol;
}

export type GetRecordType<T> = T extends StoreDescriptor<infer X> ? X : unknown;

const storeWithIndexesSymbol = Symbol("StoreWithIndexesMark");

export function describeStore<SD extends StoreDescriptor<unknown>, IndexMap>(
  s: SD,
  m: IndexMap,
): StoreWithIndexes<SD, IndexMap> {
  return {
    store: s,
    indexMap: m,
    mark: storeWithIndexesSymbol,
  };
}

export type GetReadOnlyAccess<BoundStores> = {
  [P in keyof BoundStores]: BoundStores[P] extends StoreWithIndexes<
    infer SD,
    infer IM
  >
    ? StoreReadOnlyAccessor<GetRecordType<SD>, IM>
    : unknown;
};

export type GetReadWriteAccess<BoundStores> = {
  [P in keyof BoundStores]: BoundStores[P] extends StoreWithIndexes<
    infer SD,
    infer IM
  >
    ? StoreReadWriteAccessor<GetRecordType<SD>, IM>
    : unknown;
};

type ReadOnlyTransactionFunction<BoundStores, T> = (
  t: GetReadOnlyAccess<BoundStores>,
) => Promise<T>;

type ReadWriteTransactionFunction<BoundStores, T> = (
  t: GetReadWriteAccess<BoundStores>,
) => Promise<T>;

export interface TransactionContext<BoundStores> {
  runReadWrite<T>(f: ReadWriteTransactionFunction<BoundStores, T>): Promise<T>;
  runReadOnly<T>(f: ReadOnlyTransactionFunction<BoundStores, T>): Promise<T>;
}

type CheckDescriptor<T> = T extends StoreWithIndexes<infer SD, infer IM>
  ? StoreWithIndexes<SD, IM>
  : unknown;

type GetPickerType<F, SM> = F extends (x: SM) => infer Out
  ? { [P in keyof Out]: CheckDescriptor<Out[P]> }
  : unknown;

function runTx<Arg, Res>(
  tx: IDBTransaction,
  arg: Arg,
  f: (t: Arg) => Promise<Res>,
): Promise<Res> {
  const stack = Error("Failed transaction was started here.");
  return new Promise((resolve, reject) => {
    let funResult: any = undefined;
    let gotFunResult = false;
    let transactionException: any = undefined;
    tx.oncomplete = () => {
      // This is a fatal error: The transaction completed *before*
      // the transaction function returned.  Likely, the transaction
      // function waited on a promise that is *not* resolved in the
      // microtask queue, thus triggering the auto-commit behavior.
      // Unfortunately, the auto-commit behavior of IDB can't be switched
      // of.  There are some proposals to add this functionality in the future.
      if (!gotFunResult) {
        const msg =
          "BUG: transaction closed before transaction function returned";
        console.error(msg);
        reject(Error(msg));
      }
      resolve(funResult);
    };
    tx.onerror = () => {
      logger.error("error in transaction");
      logger.error(`${stack}`);
    };
    tx.onabort = () => {
      let msg: string;
      if (tx.error) {
        msg = `Transaction aborted (transaction error): ${tx.error}`;
      } else if (transactionException !== undefined) {
        msg = `Transaction aborted (exception thrown): ${transactionException}`;
      } else {
        msg = "Transaction aborted (no DB error)";
      }
      logger.error(msg);
      reject(new TransactionAbortedError(msg));
    };
    const resP = Promise.resolve().then(() => f(arg));
    resP
      .then((result) => {
        gotFunResult = true;
        funResult = result;
      })
      .catch((e) => {
        if (e == TransactionAbort) {
          logger.trace("aborting transaction");
        } else {
          transactionException = e;
          console.error("Transaction failed:", e);
          console.error(stack);
          tx.abort();
        }
      })
      .catch((e) => {
        console.error("fatal: aborting transaction failed", e);
      });
  });
}

function makeReadContext(
  tx: IDBTransaction,
  storePick: { [n: string]: StoreWithIndexes<any, any> },
): any {
  const ctx: { [s: string]: StoreReadOnlyAccessor<any, any> } = {};
  for (const storeAlias in storePick) {
    const indexes: { [s: string]: IndexReadOnlyAccessor<any> } = {};
    const swi = storePick[storeAlias];
    const storeName = swi.store.name;
    for (const indexAlias in storePick[storeAlias].indexMap) {
      const indexDescriptor: IndexDescriptor =
        storePick[storeAlias].indexMap[indexAlias];
      const indexName = indexDescriptor.name;
      indexes[indexAlias] = {
        get(key) {
          const req = tx.objectStore(storeName).index(indexName).get(key);
          return requestToPromise(req);
        },
        iter(query) {
          const req = tx
            .objectStore(storeName)
            .index(indexName)
            .openCursor(query);
          return new ResultStream<any>(req);
        },
        getAll(query, count) {
          const req = tx.objectStore(storeName).index(indexName).getAll(query, count);
          return requestToPromise(req);
        }
      };
    }
    ctx[storeAlias] = {
      indexes,
      get(key) {
        const req = tx.objectStore(storeName).get(key);
        return requestToPromise(req);
      },
      iter(query) {
        const req = tx.objectStore(storeName).openCursor(query);
        return new ResultStream<any>(req);
      },
    };
  }
  return ctx;
}

function makeWriteContext(
  tx: IDBTransaction,
  storePick: { [n: string]: StoreWithIndexes<any, any> },
): any {
  const ctx: { [s: string]: StoreReadWriteAccessor<any, any> } = {};
  for (const storeAlias in storePick) {
    const indexes: { [s: string]: IndexReadWriteAccessor<any> } = {};
    const swi = storePick[storeAlias];
    const storeName = swi.store.name;
    for (const indexAlias in storePick[storeAlias].indexMap) {
      const indexDescriptor: IndexDescriptor =
        storePick[storeAlias].indexMap[indexAlias];
      const indexName = indexDescriptor.name;
      indexes[indexAlias] = {
        get(key) {
          const req = tx.objectStore(storeName).index(indexName).get(key);
          return requestToPromise(req);
        },
        iter(query) {
          const req = tx
            .objectStore(storeName)
            .index(indexName)
            .openCursor(query);
          return new ResultStream<any>(req);
        },
        getAll(query, count) {
          const req = tx.objectStore(storeName).index(indexName).getAll(query, count);
          return requestToPromise(req);
        }
      };
    }
    ctx[storeAlias] = {
      indexes,
      get(key) {
        const req = tx.objectStore(storeName).get(key);
        return requestToPromise(req);
      },
      iter(query) {
        const req = tx.objectStore(storeName).openCursor(query);
        return new ResultStream<any>(req);
      },
      add(r) {
        const req = tx.objectStore(storeName).add(r);
        return requestToPromise(req);
      },
      put(r) {
        const req = tx.objectStore(storeName).put(r);
        return requestToPromise(req);
      },
      delete(k) {
        const req = tx.objectStore(storeName).delete(k);
        return requestToPromise(req);
      },
    };
  }
  return ctx;
}

/**
 * Type-safe access to a database with a particular store map.
 *
 * A store map is the metadata that describes the store.
 */
export class DbAccess<StoreMap> {
  constructor(private db: IDBDatabase, private stores: StoreMap) {}

  mktx<
    PickerType extends (x: StoreMap) => unknown,
    BoundStores extends GetPickerType<PickerType, StoreMap>
  >(f: PickerType): TransactionContext<BoundStores> {
    const storePick = f(this.stores) as any;
    if (typeof storePick !== "object" || storePick === null) {
      throw Error();
    }
    const storeNames: string[] = [];
    for (const storeAlias of Object.keys(storePick)) {
      const swi = (storePick as any)[storeAlias] as StoreWithIndexes<any, any>;
      if (swi.mark !== storeWithIndexesSymbol) {
        throw Error("invalid store descriptor returned from selector function");
      }
      storeNames.push(swi.store.name);
    }

    const runReadOnly = <T>(
      txf: ReadOnlyTransactionFunction<BoundStores, T>,
    ): Promise<T> => {
      const tx = this.db.transaction(storeNames, "readonly");
      const readContext = makeReadContext(tx, storePick);
      return runTx(tx, readContext, txf);
    };

    const runReadWrite = <T>(
      txf: ReadWriteTransactionFunction<BoundStores, T>,
    ): Promise<T> => {
      const tx = this.db.transaction(storeNames, "readwrite");
      const writeContext = makeWriteContext(tx, storePick);
      return runTx(tx, writeContext, txf);
    };

    return {
      runReadOnly,
      runReadWrite,
    };
  }
}
