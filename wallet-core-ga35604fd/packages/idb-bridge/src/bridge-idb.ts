/*
 Copyright 2017 Jeremy Scheff
 Copyright 2019-2021 Taler Systems S.A.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 or implied. See the License for the specific language governing
 permissions and limitations under the License.
 */

import {
  Backend,
  DatabaseConnection,
  DatabaseTransaction,
  RecordGetRequest,
  RecordStoreRequest,
  ResultLevel,
  Schema,
  StoreLevel,
} from "./backend-interface";
import {
  DOMException,
  DOMStringList,
  EventListener,
  IDBCursor,
  IDBCursorDirection,
  IDBDatabase,
  IDBIndex,
  IDBKeyPath,
  IDBKeyRange,
  IDBObjectStore,
  IDBOpenDBRequest,
  IDBRequest,
  IDBTransaction,
  IDBTransactionMode,
  IDBValidKey,
} from "./idbtypes";
import { canInjectKey } from "./util/canInjectKey";
import { compareKeys } from "./util/cmp";
import { enforceRange } from "./util/enforceRange";
import {
  AbortError,
  ConstraintError,
  DataCloneError,
  DataError,
  InvalidAccessError,
  InvalidStateError,
  NotFoundError,
  ReadOnlyError,
  TransactionInactiveError,
  VersionError,
} from "./util/errors";
import { FakeDOMStringList, fakeDOMStringList } from "./util/fakeDOMStringList";
import FakeEvent from "./util/FakeEvent";
import FakeEventTarget from "./util/FakeEventTarget";
import { makeStoreKeyValue } from "./util/makeStoreKeyValue";
import { normalizeKeyPath } from "./util/normalizeKeyPath";
import { openPromise } from "./util/openPromise";
import queueTask from "./util/queueTask";
import { structuredClone } from "./util/structuredClone";
import { validateKeyPath } from "./util/validateKeyPath";
import { valueToKey } from "./util/valueToKey";

/** @public */
export type CursorSource = BridgeIDBIndex | BridgeIDBObjectStore;

/** @public */
export interface RequestObj {
  operation: () => Promise<any>;
  request?: BridgeIDBRequest | undefined;
  source?: any;
}

/** @public */
export interface BridgeIDBDatabaseInfo {
  name: string;
  version: number;
}

function simplifyRange(
  r: IDBValidKey | IDBKeyRange | undefined | null,
): IDBKeyRange | null {
  if (r && typeof r === "object" && "lower" in r) {
    return r;
  }
  if (r === undefined || r === null) {
    return null;
  }
  return BridgeIDBKeyRange.bound(r, r, false, false);
}

/**
 * http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#cursor
 *
 * @public
 */
export class BridgeIDBCursor implements IDBCursor {
  _request: BridgeIDBRequest | undefined;

  private _gotValue: boolean = false;
  private _range: IDBValidKey | IDBKeyRange | undefined | null;
  // Key of previously returned record
  private _indexPosition: IDBValidKey | undefined = undefined;
  private _objectStorePosition: IDBValidKey | undefined = undefined;
  private _keyOnly: boolean;

  private _source: CursorSource;
  private _direction: IDBCursorDirection;
  private _key: IDBValidKey | undefined = undefined;
  private _primaryKey: IDBValidKey | undefined = undefined;
  private _indexName: string | undefined;
  private _objectStoreName: string;

  protected _value: any = undefined;

  constructor(
    source: CursorSource,
    objectStoreName: string,
    indexName: string | undefined,
    range: IDBValidKey | IDBKeyRange | null | undefined,
    direction: IDBCursorDirection,
    request: BridgeIDBRequest,
    keyOnly: boolean,
  ) {
    this._indexName = indexName;
    this._objectStoreName = objectStoreName;
    this._range = range;
    this._source = source;
    this._direction = direction;
    this._request = request;
    this._keyOnly = keyOnly;
  }

  get _effectiveObjectStore(): BridgeIDBObjectStore {
    if (this.source instanceof BridgeIDBObjectStore) {
      return this.source;
    }
    return this.source._objectStore;
  }

  get _backend(): Backend {
    return this._source._backend;
  }

  // Read only properties
  get source() {
    return this._source;
  }
  set source(val) {
    /* For babel */
  }

  get direction() {
    return this._direction;
  }
  set direction(val) {
    /* For babel */
  }

  get key(): IDBValidKey {
    const k = this._key;
    if (k === null || k === undefined) {
      throw Error("no key");
    }
    return k;
  }
  set key(val) {
    /* For babel */
  }

  get primaryKey(): IDBValidKey {
    const k = this._primaryKey;
    if (k === 0 || k === undefined) {
      throw Error("no key");
    }
    return k;
  }

  set primaryKey(val) {
    /* For babel */
  }

  protected get _isValueCursor(): boolean {
    return false;
  }

  /**
   * https://w3c.github.io/IndexedDB/#iterate-a-cursor
   */
  async _iterate(
    key?: IDBValidKey,
    primaryKey?: IDBValidKey,
  ): Promise<BridgeIDBCursor | null> {
    BridgeIDBFactory.enableTracing &&
      console.log(
        `iterating cursor os=${this._objectStoreName},idx=${this._indexName}`,
      );
    BridgeIDBFactory.enableTracing &&
      console.log("cursor type ", this.toString());
    const isIndex = this._indexName !== undefined;
    const recordGetRequest: RecordGetRequest = {
      direction: this.direction,
      indexName: this._indexName,
      lastIndexPosition: this._indexPosition,
      lastObjectStorePosition: this._objectStorePosition,
      limit: 1,
      range: simplifyRange(this._range),
      objectStoreName: this._objectStoreName,
      advanceIndexKey: isIndex ? key : undefined,
      advancePrimaryKey: isIndex ? primaryKey : key,
      resultLevel: this._keyOnly ? ResultLevel.OnlyKeys : ResultLevel.Full,
    };

    const { btx } = this.source._confirmStartedBackendTransaction();

    let response = await this._backend.getRecords(btx, recordGetRequest);

    if (response.count === 0) {
      if (BridgeIDBFactory.enableTracing) {
        console.log("cursor is returning empty result");
      }
      this._gotValue = false;
      return null;
    }

    if (response.count !== 1) {
      throw Error("invariant failed");
    }

    if (BridgeIDBFactory.enableTracing) {
      console.log("request is:", JSON.stringify(recordGetRequest));
      console.log("get response is:", JSON.stringify(response));
    }

    if (this._indexName !== undefined) {
      this._key = response.indexKeys![0];
    } else {
      this._key = response.primaryKeys![0];
    }

    this._primaryKey = response.primaryKeys![0];

    if (!this._keyOnly) {
      this._value = response.values![0];
    }

    this._gotValue = true;
    this._objectStorePosition = response.primaryKeys![0];
    if (response.indexKeys !== undefined && response.indexKeys.length > 0) {
      this._indexPosition = response.indexKeys![0];
    }

    return this;
  }

  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBCursor-update-IDBRequest-any-value
  public update(value: any) {
    if (value === undefined) {
      throw new TypeError();
    }

    const transaction = this._effectiveObjectStore._transaction;

    if (!transaction._active) {
      throw new TransactionInactiveError();
    }

    if (transaction.mode === "readonly") {
      throw new ReadOnlyError();
    }

    if (this._effectiveObjectStore._deleted) {
      throw new InvalidStateError();
    }

    if (
      !(this.source instanceof BridgeIDBObjectStore) &&
      this.source._deleted
    ) {
      throw new InvalidStateError();
    }

    if (!this._gotValue || !this._isValueCursor) {
      throw new InvalidStateError();
    }

    const key = this._primaryKey;

    // Effective object store
    let os: BridgeIDBObjectStore;
    if (this.source instanceof BridgeIDBObjectStore) {
      os = this.source;
    } else {
      os = this.source._objectStore;
    }

    try {
      // Only called for the side effect of throwing an exception
      structuredClone(value);
    } catch (e) {
      throw new DataCloneError();
    }

    if (os.keyPath !== null && os.keyPath !== undefined) {
      if (!canInjectKey(os.keyPath, value)) {
        throw new DataError();
      }
    }

    const storeReq: RecordStoreRequest = {
      key,
      value,
      objectStoreName: this._objectStoreName,
      storeLevel: StoreLevel.UpdateExisting,
    };

    const operation = async () => {
      if (BridgeIDBFactory.enableTracing) {
        console.log("updating at cursor");
      }
      const { btx } = this.source._confirmStartedBackendTransaction();
      await this._backend.storeRecord(btx, storeReq);
    };
    return transaction._execRequestAsync({
      operation,
      source: this,
    });
  }

  /**
   * http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBCursor-advance-void-unsigned-long-count
   */
  public advance(count: number) {
    if (typeof count !== "number" || count <= 0) {
      throw TypeError("count must be positive number");
    }

    const transaction = this._effectiveObjectStore._transaction;

    if (!transaction._active) {
      throw new TransactionInactiveError();
    }

    if (this._effectiveObjectStore._deleted) {
      throw new InvalidStateError();
    }
    if (
      !(this.source instanceof BridgeIDBObjectStore) &&
      this.source._deleted
    ) {
      throw new InvalidStateError();
    }

    if (!this._gotValue) {
      throw new InvalidStateError();
    }

    if (this._request) {
      this._request.readyState = "pending";
    }

    const operation = async () => {
      let res: IDBCursor | null = null;
      for (let i = 0; i < count; i++) {
        res = await this._iterate();
      }
      return res;
    };

    transaction._execRequestAsync({
      operation,
      request: this._request,
      source: this.source,
    });

    this._gotValue = false;
  }

  /**
   * http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBCursor-continue-void-any-key
   */
  public continue(key?: IDBValidKey) {
    const transaction = this._effectiveObjectStore._transaction;

    if (!transaction._active) {
      throw new TransactionInactiveError();
    }

    if (this._effectiveObjectStore._deleted) {
      throw new InvalidStateError();
    }
    if (
      !(this.source instanceof BridgeIDBObjectStore) &&
      this.source._deleted
    ) {
      throw new InvalidStateError();
    }

    if (!this._gotValue) {
      throw new InvalidStateError();
    }

    if (key !== undefined) {
      key = valueToKey(key);
      let lastKey =
        this._indexName === undefined
          ? this._objectStorePosition
          : this._indexPosition;

      const cmpResult = compareKeys(key, lastKey);

      if (
        (cmpResult <= 0 &&
          (this.direction === "next" || this.direction === "nextunique")) ||
        (cmpResult >= 0 &&
          (this.direction === "prev" || this.direction === "prevunique"))
      ) {
        throw new DataError();
      }
    }

    if (this._request) {
      this._request.readyState = "pending";
    }

    const operation = async () => {
      return this._iterate(key);
    };

    transaction._execRequestAsync({
      operation,
      request: this._request,
      source: this.source,
    });

    this._gotValue = false;
  }

  // https://w3c.github.io/IndexedDB/#dom-idbcursor-continueprimarykey
  public continuePrimaryKey(key: IDBValidKey, primaryKey: IDBValidKey) {
    throw Error("not implemented");
  }

  public delete() {
    const transaction = this._effectiveObjectStore._transaction;

    if (!transaction._active) {
      throw new TransactionInactiveError();
    }

    if (transaction.mode === "readonly") {
      throw new ReadOnlyError();
    }

    if (this._effectiveObjectStore._deleted) {
      throw new InvalidStateError();
    }
    if (
      !(this.source instanceof BridgeIDBObjectStore) &&
      this.source._deleted
    ) {
      throw new InvalidStateError();
    }

    if (!this._gotValue || !this._isValueCursor) {
      throw new InvalidStateError();
    }

    const operation = async () => {
      const { btx } = this.source._confirmStartedBackendTransaction();
      this._backend.deleteRecord(
        btx,
        this._objectStoreName,
        BridgeIDBKeyRange._valueToKeyRange(this._primaryKey),
      );
    };

    return transaction._execRequestAsync({
      operation,
      source: this,
    });
  }

  public toString() {
    return "[object IDBCursor]";
  }
}

export class BridgeIDBCursorWithValue extends BridgeIDBCursor {
  get value(): any {
    return this._value;
  }

  protected get _isValueCursor(): boolean {
    return true;
  }

  constructor(
    source: CursorSource,
    objectStoreName: string,
    indexName: string | undefined,
    range: IDBValidKey | IDBKeyRange | undefined | null,
    direction: IDBCursorDirection,
    request?: any,
  ) {
    super(source, objectStoreName, indexName, range, direction, request, false);
  }

  public toString() {
    return "[object IDBCursorWithValue]";
  }
}

/**
 * Ensure that an active version change transaction is currently running.
 */
const confirmActiveVersionchangeTransaction = (database: BridgeIDBDatabase) => {
  if (!database._upgradeTransaction) {
    throw new InvalidStateError();
  }

  // Find the latest versionchange transaction
  const transactions = database._transactions.filter(
    (tx: BridgeIDBTransaction) => {
      return tx.mode === "versionchange";
    },
  );
  const transaction = transactions[transactions.length - 1];

  if (!transaction || transaction._finished) {
    throw new InvalidStateError();
  }

  if (!transaction._active) {
    throw new TransactionInactiveError();
  }

  return transaction;
};

// http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#database-interface
/** @public */
export class BridgeIDBDatabase extends FakeEventTarget implements IDBDatabase {
  _closePending = false;
  _closed = false;
  _transactions: Array<BridgeIDBTransaction> = [];

  _upgradeTransaction: BridgeIDBTransaction | null = null;

  _backendConnection: DatabaseConnection;
  _backend: Backend;

  _schema: Schema;

  /**
   * Name that can be set to identify the object store in logs.
   */
  _debugName: string | undefined = undefined;

  get name(): string {
    return this._schema.databaseName;
  }

  get version(): number {
    return this._schema.databaseVersion;
  }

  get objectStoreNames(): DOMStringList {
    return fakeDOMStringList(
      Object.keys(this._schema.objectStores),
    ).sort() as DOMStringList;
  }

  /**
   * http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#database-closing-steps
   */
  _closeConnection() {
    this._closePending = true;

    // Spec is unclear what "complete" means, we assume it's
    // the same as "finished".
    const transactionsComplete = this._transactions.every(
      (transaction: BridgeIDBTransaction) => {
        return transaction._finished;
      },
    );

    if (transactionsComplete) {
      this._closed = true;
      this._backend.close(this._backendConnection);
    } else {
      queueTask(() => {
        this._closeConnection();
      });
    }
  }

  constructor(backend: Backend, backendConnection: DatabaseConnection) {
    super();

    this._schema = backend.getSchema(backendConnection);

    this._backend = backend;
    this._backendConnection = backendConnection;
  }

  // http://w3c.github.io/IndexedDB/#dom-idbdatabase-createobjectstore
  public createObjectStore(
    name: string,
    options: {
      autoIncrement?: boolean;
      keyPath?: null | IDBKeyPath | IDBKeyPath[];
    } | null = {},
  ): BridgeIDBObjectStore {
    if (name === undefined) {
      throw new TypeError();
    }
    const transaction = confirmActiveVersionchangeTransaction(this);
    const backendTx = transaction._backendTransaction;
    if (!backendTx) {
      throw Error("invariant violated");
    }

    const keyPath =
      options !== null && options.keyPath !== undefined
        ? options.keyPath
        : null;
    const autoIncrement =
      options !== null && options.autoIncrement !== undefined
        ? options.autoIncrement
        : false;

    if (keyPath !== null) {
      validateKeyPath(keyPath);
    }

    if (Object.keys(this._schema.objectStores).includes(name)) {
      throw new ConstraintError();
    }

    if (autoIncrement && (keyPath === "" || Array.isArray(keyPath))) {
      throw new InvalidAccessError();
    }

    transaction._backend.createObjectStore(
      backendTx,
      name,
      keyPath !== null ? normalizeKeyPath(keyPath) : null,
      autoIncrement,
    );

    this._schema = this._backend.getCurrentTransactionSchema(backendTx);

    const newObjectStore = transaction.objectStore(name);
    newObjectStore._justCreated = true;
    return newObjectStore;
  }

  public deleteObjectStore(name: string): void {
    if (name === undefined) {
      throw new TypeError();
    }
    const transaction = confirmActiveVersionchangeTransaction(this);
    const backendTx = transaction._backendTransaction;
    if (!backendTx) {
      throw Error("invariant violated");
    }
    this._backend.deleteObjectStore(backendTx, name);
    const os = transaction._objectStoresCache.get(name);
    if (os) {
      os._deleted = true;
      transaction._objectStoresCache.delete(name);
    }
  }

  public _internalTransaction(
    storeNames: string | string[],
    mode?: IDBTransactionMode,
    backendTransaction?: DatabaseTransaction,
    openRequest?: BridgeIDBOpenDBRequest,
  ): BridgeIDBTransaction {
    mode = mode !== undefined ? mode : "readonly";
    if (
      mode !== "readonly" &&
      mode !== "readwrite" &&
      mode !== "versionchange"
    ) {
      throw new TypeError("Invalid mode: " + mode);
    }

    if (this._upgradeTransaction) {
      throw new InvalidStateError();
    }

    if (this._closePending) {
      throw new InvalidStateError();
    }

    if (!Array.isArray(storeNames)) {
      storeNames = [storeNames];
    }
    if (storeNames.length === 0 && mode !== "versionchange") {
      throw new InvalidAccessError();
    }
    for (const storeName of storeNames) {
      if (!this.objectStoreNames.contains(storeName)) {
        throw new NotFoundError(
          "No objectStore named " + storeName + " in this database",
        );
      }
    }

    const tx = new BridgeIDBTransaction(
      storeNames,
      mode,
      this,
      backendTransaction,
      openRequest,
    );
    this._transactions.push(tx);

    queueTask(() => {
      BridgeIDBFactory.enableTracing &&
        console.log("TRACE: calling auto-commit", this._getReadableName());
      tx._start();
    });
    if (BridgeIDBFactory.enableTracing) {
      console.log("TRACE: queued task to auto-commit", this._getReadableName());
    }
    // "When a transaction is created its active flag is initially set."
    tx._active = true;
    return tx;
  }

  _getReadableName(): string {
    return `${this.name}(${this._debugName ?? "??"})`;
  }

  public transaction(
    storeNames: string | string[],
    mode?: IDBTransactionMode,
  ): BridgeIDBTransaction {
    if (mode === "versionchange") {
      throw new TypeError("Invalid mode: " + mode);
    }
    return this._internalTransaction(storeNames, mode);
  }

  public close() {
    this._closeConnection();
  }

  public toString() {
    return "[object IDBDatabase]";
  }
}

/** @public */
export type DatabaseList = Array<{ name: string; version: number }>;

/** @public */
export class BridgeIDBFactory {
  public cmp = compareKeys;
  private backend: Backend;
  private connections: BridgeIDBDatabase[] = [];
  static enableTracing: boolean = false;

  public constructor(backend: Backend) {
    this.backend = backend;
  }

  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBFactory-deleteDatabase-IDBOpenDBRequest-DOMString-name
  public deleteDatabase(name: string): BridgeIDBOpenDBRequest {
    const request = new BridgeIDBOpenDBRequest();
    request._source = null;

    queueTask(async () => {
      const databases = await this.backend.getDatabases();
      const dbInfo = databases.find((x) => x.name == name);
      if (!dbInfo) {
        // Database already doesn't exist, success!
        const event = new BridgeIDBVersionChangeEvent("success", {
          newVersion: null,
          oldVersion: 0,
        });
        request.dispatchEvent(event);
        return;
      }
      const oldVersion = dbInfo.version;

      try {
        await this.backend.deleteDatabase(name);
        request.result = undefined;
        request.readyState = "done";

        const event2 = new BridgeIDBVersionChangeEvent("success", {
          newVersion: null,
          oldVersion,
        });
        request.dispatchEvent(event2);
      } catch (err: any) {
        request.error = new Error();
        request.error.name = err.name;
        request.readyState = "done";

        const event = new FakeEvent("error", {
          bubbles: true,
          cancelable: true,
        });
        event.eventPath = [];
        request.dispatchEvent(event);
      }
    });

    return request;
  }

  // tslint:disable-next-line max-line-length
  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBFactory-open-IDBOpenDBRequest-DOMString-name-unsigned-long-long-version
  public open(name: string, version?: number): BridgeIDBOpenDBRequest {
    if (arguments.length > 1 && version !== undefined) {
      // Based on spec, not sure why "MAX_SAFE_INTEGER" instead of "unsigned long long", but it's needed to pass
      // tests
      version = enforceRange(version, "MAX_SAFE_INTEGER");
    }
    if (version === 0) {
      throw new TypeError();
    }

    const request = new BridgeIDBOpenDBRequest();

    queueTask(async () => {
      let dbconn: DatabaseConnection;
      try {
        if (BridgeIDBFactory.enableTracing) {
          console.log("TRACE: connecting to database");
        }
        dbconn = await this.backend.connectDatabase(name);
        if (BridgeIDBFactory.enableTracing) {
          console.log("TRACE: connected!");
        }
      } catch (err: any) {
        if (BridgeIDBFactory.enableTracing) {
          console.log(
            "TRACE: caught exception while trying to connect with backend",
          );
        }
        request._finishWithError(err);
        return;
      }

      const schema = this.backend.getSchema(dbconn);
      const existingVersion = schema.databaseVersion;

      if (version === undefined) {
        version = existingVersion !== 0 ? existingVersion : 1;
      }

      const requestedVersion = version;

      BridgeIDBFactory.enableTracing &&
        console.log(
          `TRACE: existing version ${existingVersion}, requested version ${requestedVersion}`,
        );

      if (existingVersion > requestedVersion) {
        request._finishWithError(new VersionError());
        return;
      }

      const db = new BridgeIDBDatabase(this.backend, dbconn);

      if (existingVersion == requestedVersion) {
        request.result = db;
        request.readyState = "done";

        const event2 = new FakeEvent("success", {
          bubbles: false,
          cancelable: false,
        });
        event2.eventPath = [];
        if (BridgeIDBFactory.enableTracing) {
          console.log(
            "open() requested same version, dispatching 'success' event on transaction",
          );
        }
        request.dispatchEvent(event2);
      } else if (existingVersion < requestedVersion) {
        // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-for-running-a-versionchange-transaction

        for (const otherConn of this.connections) {
          if (otherConn._closePending) {
            continue;
          }
          if (BridgeIDBFactory.enableTracing) {
            console.log(
              "dispatching 'versionchange' event to other connection",
            );
          }
          const event = new BridgeIDBVersionChangeEvent("versionchange", {
            newVersion: version,
            oldVersion: existingVersion,
          });
          otherConn.dispatchEvent(event);
        }

        if (this._anyOpen()) {
          if (BridgeIDBFactory.enableTracing) {
            console.log(
              "other connections are still open, dispatching 'blocked' event to other connection",
            );
          }
          const event = new BridgeIDBVersionChangeEvent("blocked", {
            newVersion: version,
            oldVersion: existingVersion,
          });
          request.dispatchEvent(event);
        }

        const backendTransaction = await this.backend.enterVersionChange(
          dbconn,
          requestedVersion,
        );

        // We need to expose the new version number to the upgrade transaction.
        db._schema = this.backend.getCurrentTransactionSchema(
          backendTransaction,
        );

        const transaction = db._internalTransaction(
          [],
          "versionchange",
          backendTransaction,
          request,
        );

        db._upgradeTransaction = transaction;

        if (BridgeIDBFactory.enableTracing) {
          console.log("dispatching upgradeneeded event");
        }

        const event = new BridgeIDBVersionChangeEvent("upgradeneeded", {
          newVersion: version,
          oldVersion: existingVersion,
        });

        transaction._active = true;

        request.readyState = "done";
        request.result = db;
        request.transaction = transaction;
        request.dispatchEvent(event);

        await transaction._waitDone();

        // We re-use the same transaction (as per spec) here.
        transaction._active = true;

        if (db._closed || db._closePending) {
          request.result = undefined;
          request.error = new AbortError();
          request.readyState = "done";
          const event2 = new FakeEvent("error", {
            bubbles: false,
            cancelable: false,
          });
          event2.eventPath = [];
          request.dispatchEvent(event2);
        } else if (transaction._aborted) {
          try {
            await db._backend.close(db._backendConnection);
          } catch (e) {
            console.error("failed to close database");
          }

          request.result = undefined;
          request.error = new AbortError();
          request.readyState = "done";
          const event2 = new FakeEvent("error", {
            bubbles: false,
            cancelable: false,
          });
          event2.eventPath = [];
          request.dispatchEvent(event2);
        } else {
          if (BridgeIDBFactory.enableTracing) {
            console.log("dispatching 'success' event for opening db");
          }

          const event2 = new FakeEvent("success", {
            bubbles: false,
            cancelable: false,
          });
          event2.eventPath = [];

          request.dispatchEvent(event2);
        }
      }

      this.connections.push(db);
      return db;
    });

    return request;
  }

  // https://w3c.github.io/IndexedDB/#dom-idbfactory-databases
  public databases(): Promise<DatabaseList> {
    return this.backend.getDatabases();
  }

  public toString(): string {
    return "[object IDBFactory]";
  }

  private _anyOpen(): boolean {
    return this.connections.some((c) => !c._closed && !c._closePending);
  }
}

// http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#idl-def-IDBIndex
/** @public */
export class BridgeIDBIndex implements IDBIndex {
  _objectStore: BridgeIDBObjectStore;

  get objectStore(): IDBObjectStore {
    return this._objectStore;
  }

  get _schema(): Schema {
    return this._objectStore._transaction._db._schema;
  }

  get keyPath(): IDBKeyPath | IDBKeyPath[] {
    return this._schema.objectStores[this._objectStore.name].indexes[this._name]
      .keyPath;
  }

  get multiEntry(): boolean {
    return this._schema.objectStores[this._objectStore.name].indexes[this._name]
      .multiEntry;
  }

  get unique(): boolean {
    return this._schema.objectStores[this._objectStore.name].indexes[this._name]
      .unique;
  }

  get _backend(): Backend {
    return this._objectStore._backend;
  }

  _confirmStartedBackendTransaction(): { btx: DatabaseTransaction } {
    return this._objectStore._confirmStartedBackendTransaction();
  }

  _confirmActiveTransaction(): void {
    this._objectStore._confirmActiveTransaction();
  }

  private _name: string;

  public _deleted: boolean = false;

  /**
   * Was this index newly created in the current transaction?
   */
  _justCreated: boolean = false;

  constructor(objectStore: BridgeIDBObjectStore, name: string) {
    this._name = name;
    this._objectStore = objectStore;
  }

  get name() {
    return this._name;
  }

  // https://w3c.github.io/IndexedDB/#dom-idbindex-name
  set name(name: any) {
    const transaction = this._objectStore._transaction;

    if (!transaction._db._upgradeTransaction) {
      throw new InvalidStateError();
    }

    if (!transaction._active) {
      throw new TransactionInactiveError();
    }

    const { btx } = this._confirmStartedBackendTransaction();

    const oldName = this._name;
    const newName = String(name);

    if (newName === oldName) {
      return;
    }

    this._backend.renameIndex(btx, this._objectStore.name, oldName, newName);

    this._objectStore._transaction._db._schema = this._backend.getCurrentTransactionSchema(
      btx,
    );

    this._objectStore._indexesCache.delete(oldName);
    this._objectStore._indexesCache.set(newName, this);
    this._name = newName;

    if (this._objectStore._indexNames.indexOf(name) >= 0) {
      throw new Error("internal invariant violated");
    }
  }

  // tslint:disable-next-line max-line-length
  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBIndex-openCursor-IDBRequest-any-range-IDBCursorDirection-direction
  public openCursor(
    range?: BridgeIDBKeyRange | IDBValidKey | null | undefined,
    direction: IDBCursorDirection = "next",
  ) {
    if (this._deleted) {
      throw new InvalidStateError(
        "tried to call 'openCursor' on a deleted index",
      );
    }

    BridgeIDBFactory.enableTracing && console.log("opening cursor on", this);

    this._confirmActiveTransaction();

    range = simplifyRange(range);

    const request = new BridgeIDBRequest();
    request._source = this;
    request.transaction = this._objectStore._transaction;

    const cursor = new BridgeIDBCursorWithValue(
      this,
      this._objectStore.name,
      this._name,
      range,
      direction,
      request,
    );

    const operation = async () => {
      return cursor._iterate();
    };

    return this._objectStore._transaction._execRequestAsync({
      operation,
      request,
      source: this,
    });
  }

  // tslint:disable-next-line max-line-length
  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBIndex-openKeyCursor-IDBRequest-any-range-IDBCursorDirection-direction
  public openKeyCursor(
    range?: BridgeIDBKeyRange | IDBValidKey | null | undefined,
    direction: IDBCursorDirection = "next",
  ) {
    this._confirmActiveTransaction();

    if (range === null) {
      range = undefined;
    }
    if (range !== undefined && !(range instanceof BridgeIDBKeyRange)) {
      range = BridgeIDBKeyRange.only(valueToKey(range));
    }

    const request = new BridgeIDBRequest();
    request._source = this;
    request.transaction = this._objectStore._transaction;

    const cursor = new BridgeIDBCursor(
      this,
      this._objectStore.name,
      this._name,
      range,
      direction,
      request,
      true,
    );

    return this._objectStore._transaction._execRequestAsync({
      operation: cursor._iterate.bind(cursor),
      request,
      source: this,
    });
  }

  private _confirmIndexExists() {
    const storeSchema = this._schema.objectStores[this._objectStore._name];
    if (!storeSchema) {
      throw new InvalidStateError(
        `no schema for object store '${this._objectStore._name}'`,
      );
    }
    if (!storeSchema.indexes[this._name]) {
      throw new InvalidStateError(
        `no schema for index '${this._name}' of object store '${this._objectStore._name}'`,
      );
    }
  }

  get(key: BridgeIDBKeyRange | IDBValidKey) {
    if (this._deleted) {
      throw new InvalidStateError();
    }
    if (this._objectStore._deleted) {
      throw new InvalidStateError();
    }
    this._confirmActiveTransaction();
    this._confirmIndexExists();

    if (!(key instanceof BridgeIDBKeyRange)) {
      key = BridgeIDBKeyRange._valueToKeyRange(key);
    }

    const getReq: RecordGetRequest = {
      direction: "next",
      indexName: this._name,
      limit: 1,
      range: key,
      objectStoreName: this._objectStore._name,
      resultLevel: ResultLevel.Full,
    };

    const operation = async () => {
      const { btx } = this._confirmStartedBackendTransaction();
      const result = await this._backend.getRecords(btx, getReq);
      if (result.count == 0) {
        return undefined;
      }
      const values = result.values;
      if (!values) {
        throw Error("invariant violated");
      }
      return values[0];
    };

    return this._objectStore._transaction._execRequestAsync({
      operation,
      source: this,
    });
  }

  // http://w3c.github.io/IndexedDB/#dom-idbindex-getall
  public getAll(
    query?: BridgeIDBKeyRange | IDBValidKey,
    count?: number,
  ): IDBRequest<any[]> {
    this._confirmIndexExists();
    this._confirmActiveTransaction();
    if (this._deleted) {
      throw new InvalidStateError();
    }

    if (!(query instanceof BridgeIDBKeyRange)) {
      query = BridgeIDBKeyRange._valueToKeyRange(query);
    }

    if (count === undefined) {
      count = -1;
    }

    const getReq: RecordGetRequest = {
      direction: "next",
      indexName: this._name,
      limit: count,
      range: query,
      objectStoreName: this._objectStore._name,
      resultLevel: ResultLevel.Full,
    };

    const operation = async () => {
      const { btx } = this._confirmStartedBackendTransaction();
      const result = await this._backend.getRecords(btx, getReq);
      const values = result.values;
      if (!values) {
        throw Error("invariant violated");
      }
      return values;
    };

    return this._objectStore._transaction._execRequestAsync({
      operation,
      source: this,
    });
  }

  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBIndex-getKey-IDBRequest-any-key
  public getKey(key: BridgeIDBKeyRange | IDBValidKey) {
    this._confirmIndexExists();
    this._confirmActiveTransaction();

    if (!(key instanceof BridgeIDBKeyRange)) {
      key = BridgeIDBKeyRange._valueToKeyRange(key);
    }

    const getReq: RecordGetRequest = {
      direction: "next",
      indexName: this._name,
      limit: 1,
      range: key,
      objectStoreName: this._objectStore._name,
      resultLevel: ResultLevel.OnlyKeys,
    };

    const operation = async () => {
      const { btx } = this._confirmStartedBackendTransaction();
      const result = await this._backend.getRecords(btx, getReq);
      if (result.count == 0) {
        return undefined;
      }
      const primaryKeys = result.primaryKeys;
      if (!primaryKeys) {
        throw Error("invariant violated");
      }
      return primaryKeys[0];
    };

    return this._objectStore._transaction._execRequestAsync({
      operation,
      source: this,
    });
  }

  // http://w3c.github.io/IndexedDB/#dom-idbindex-getallkeys
  public getAllKeys(
    query?: BridgeIDBKeyRange | IDBValidKey,
    count?: number,
  ): IDBRequest<IDBValidKey[]> {
    this._confirmIndexExists();
    this._confirmActiveTransaction();

    if (!(query instanceof BridgeIDBKeyRange)) {
      query = BridgeIDBKeyRange._valueToKeyRange(query);
    }

    if (count === undefined) {
      count = -1;
    }

    const getReq: RecordGetRequest = {
      direction: "next",
      indexName: this._name,
      limit: count,
      range: query,
      objectStoreName: this._objectStore._name,
      resultLevel: ResultLevel.OnlyKeys,
    };

    const operation = async () => {
      const { btx } = this._confirmStartedBackendTransaction();
      const result = await this._backend.getRecords(btx, getReq);
      const primaryKeys = result.primaryKeys;
      if (!primaryKeys) {
        throw Error("invariant violated");
      }
      return primaryKeys;
    };

    return this._objectStore._transaction._execRequestAsync({
      operation,
      source: this,
    });
  }

  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBIndex-count-IDBRequest-any-key
  public count(key: BridgeIDBKeyRange | IDBValidKey | null | undefined) {
    this._confirmIndexExists();
    this._confirmActiveTransaction();

    if (key === null) {
      key = undefined;
    }
    if (key !== undefined && !(key instanceof BridgeIDBKeyRange)) {
      key = BridgeIDBKeyRange.only(valueToKey(key));
    }

    const getReq: RecordGetRequest = {
      direction: "next",
      indexName: this._name,
      limit: 1,
      range: key,
      objectStoreName: this._objectStore._name,
      resultLevel: ResultLevel.OnlyCount,
    };

    const operation = async () => {
      const { btx } = this._confirmStartedBackendTransaction();
      const result = await this._backend.getRecords(btx, getReq);
      return result.count;
    };

    return this._objectStore._transaction._execRequestAsync({
      operation,
      source: this,
    });
  }

  public toString() {
    return "[object IDBIndex]";
  }
}

// http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#range-concept
/** @public */
export class BridgeIDBKeyRange {
  public static only(value: IDBValidKey) {
    if (arguments.length === 0) {
      throw new TypeError();
    }
    value = valueToKey(value);
    return new BridgeIDBKeyRange(value, value, false, false);
  }

  static lowerBound(lower: IDBValidKey, open: boolean = false) {
    if (arguments.length === 0) {
      throw new TypeError();
    }
    lower = valueToKey(lower);
    return new BridgeIDBKeyRange(lower, undefined, open, true);
  }

  static upperBound(upper: IDBValidKey, open: boolean = false) {
    if (arguments.length === 0) {
      throw new TypeError();
    }
    upper = valueToKey(upper);
    return new BridgeIDBKeyRange(undefined, upper, true, open);
  }

  static bound(
    lower: IDBValidKey,
    upper: IDBValidKey,
    lowerOpen: boolean = false,
    upperOpen: boolean = false,
  ) {
    if (arguments.length < 2) {
      throw new TypeError();
    }

    const cmpResult = compareKeys(lower, upper);
    if (cmpResult === 1 || (cmpResult === 0 && (lowerOpen || upperOpen))) {
      throw new DataError();
    }

    lower = valueToKey(lower);
    upper = valueToKey(upper);
    return new BridgeIDBKeyRange(lower, upper, lowerOpen, upperOpen);
  }

  readonly lower: IDBValidKey | undefined;
  readonly upper: IDBValidKey | undefined;
  readonly lowerOpen: boolean;
  readonly upperOpen: boolean;

  constructor(
    lower: IDBValidKey | undefined,
    upper: IDBValidKey | undefined,
    lowerOpen: boolean,
    upperOpen: boolean,
  ) {
    this.lower = lower;
    this.upper = upper;
    this.lowerOpen = lowerOpen;
    this.upperOpen = upperOpen;
  }

  // https://w3c.github.io/IndexedDB/#dom-idbkeyrange-includes
  includes(key: IDBValidKey) {
    if (arguments.length === 0) {
      throw new TypeError();
    }
    key = valueToKey(key);

    if (this.lower !== undefined) {
      const cmpResult = compareKeys(this.lower, key);

      if (cmpResult === 1 || (cmpResult === 0 && this.lowerOpen)) {
        return false;
      }
    }
    if (this.upper !== undefined) {
      const cmpResult = compareKeys(this.upper, key);

      if (cmpResult === -1 || (cmpResult === 0 && this.upperOpen)) {
        return false;
      }
    }
    return true;
  }

  toString() {
    return "[object IDBKeyRange]";
  }

  static _valueToKeyRange(value: any, nullDisallowedFlag: boolean = false) {
    if (value instanceof BridgeIDBKeyRange) {
      return value;
    }

    if (value === null || value === undefined) {
      if (nullDisallowedFlag) {
        throw new DataError();
      }
      return new BridgeIDBKeyRange(undefined, undefined, false, false);
    }

    const key = valueToKey(value);

    return BridgeIDBKeyRange.only(key);
  }
}

// http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#object-store
/** @public */
export class BridgeIDBObjectStore implements IDBObjectStore {
  _indexesCache: Map<string, BridgeIDBIndex> = new Map();

  _transaction: BridgeIDBTransaction;

  /**
   * Name that can be set to identify the object store in logs.
   */
  _debugName: string | undefined = undefined;

  _justCreated: boolean = false;

  get transaction(): IDBTransaction {
    return this._transaction;
  }

  get autoIncrement(): boolean {
    return this._schema.objectStores[this._name].autoIncrement;
  }

  get _indexNames(): FakeDOMStringList {
    return fakeDOMStringList(
      Object.keys(this._schema.objectStores[this._name].indexes),
    ).sort();
  }

  get indexNames(): DOMStringList {
    return this._indexNames as DOMStringList;
  }

  get keyPath(): IDBKeyPath | IDBKeyPath[] {
    return this._schema.objectStores[this._name].keyPath!;
  }

  _name: string;

  get _schema(): Schema {
    return this._transaction._db._schema;
  }

  _deleted: boolean = false;

  constructor(transaction: BridgeIDBTransaction, name: string) {
    this._name = name;
    this._transaction = transaction;
  }

  get name() {
    return this._name;
  }

  get _backend(): Backend {
    return this._transaction._db._backend;
  }

  get _backendConnection(): DatabaseConnection {
    return this._transaction._db._backendConnection;
  }

  _confirmStartedBackendTransaction(): { btx: DatabaseTransaction } {
    const btx = this._transaction._backendTransaction;
    if (!btx) {
      throw new InvalidStateError();
    }
    return { btx };
  }

  /**
   * Confirm that requests can currently placed against the
   * transaction of this object.
   *
   * Note that this is independent from the state of the backend
   * connection.
   */
  _confirmActiveTransaction(): void {
    if (!this._transaction._active) {
      throw new TransactionInactiveError("transaction is not active");
    }
    if (this._transaction._aborted) {
      throw new TransactionInactiveError("transaction has been aborted");
    }
  }

  // http://w3c.github.io/IndexedDB/#dom-idbobjectstore-name
  set name(newName: any) {
    const transaction = this._transaction;

    if (!transaction._db._upgradeTransaction) {
      throw new InvalidStateError();
    }

    let { btx } = this._confirmStartedBackendTransaction();

    newName = String(newName);

    const oldName = this._name;

    if (newName === oldName) {
      return;
    }

    this._backend.renameObjectStore(btx, oldName, newName);
    this._transaction._db._schema = this._backend.getCurrentTransactionSchema(
      btx,
    );

    // We don't modify scope, as the scope of the transaction
    // doesn't matter if we're in an upgrade transaction.
    this._transaction._objectStoresCache.delete(oldName);
    this._transaction._objectStoresCache.set(newName, this);
    this._transaction._cachedObjectStoreNames = undefined;

    this._name = newName;
  }

  public _store(value: any, key: IDBValidKey | undefined, overwrite: boolean) {
    if (BridgeIDBFactory.enableTracing) {
      console.log(
        `TRACE: IDBObjectStore._store, db=${this._transaction._db._getReadableName()}`,
      );
    }

    if (!this._transaction._active) {
      throw new TransactionInactiveError();
    }

    if (this._transaction.mode === "readonly") {
      throw new ReadOnlyError();
    }

    const { keyPath, autoIncrement } = this._schema.objectStores[this._name];

    if (key !== null && key !== undefined) {
      valueToKey(key);
    }

    // We only call this to synchronously verify the request.
    makeStoreKeyValue(value, key, 1, autoIncrement, keyPath);

    const operation = async () => {
      const { btx } = this._confirmStartedBackendTransaction();
      const result = await this._backend.storeRecord(btx, {
        objectStoreName: this._name,
        key: key,
        value,
        storeLevel: overwrite
          ? StoreLevel.AllowOverwrite
          : StoreLevel.NoOverwrite,
      });
      return result.key;
    };

    return this._transaction._execRequestAsync({ operation, source: this });
  }

  public put(value: any, key?: IDBValidKey) {
    if (arguments.length === 0) {
      throw new TypeError();
    }
    if (this._deleted) {
      throw new InvalidStateError(
        "tried to call 'put' on a deleted object store",
      );
    }
    return this._store(value, key, true);
  }

  public add(value: any, key?: IDBValidKey) {
    if (arguments.length === 0) {
      throw new TypeError();
    }
    if (!this._schema.objectStores[this._name]) {
      throw new InvalidStateError("object store does not exist");
    }
    return this._store(value, key, false);
  }

  public delete(key: IDBValidKey | BridgeIDBKeyRange) {
    if (arguments.length === 0) {
      throw new TypeError();
    }
    if (this._deleted) {
      throw new InvalidStateError(
        "tried to call 'delete' on a deleted object store",
      );
    }
    if (this._transaction.mode === "readonly") {
      throw new ReadOnlyError();
    }

    let keyRange: BridgeIDBKeyRange;

    if (key instanceof BridgeIDBKeyRange) {
      keyRange = key;
    } else {
      keyRange = BridgeIDBKeyRange.only(valueToKey(key));
    }

    const operation = async () => {
      const { btx } = this._confirmStartedBackendTransaction();
      return this._backend.deleteRecord(btx, this._name, keyRange);
    };

    return this._transaction._execRequestAsync({
      operation,
      source: this,
    });
  }

  public get(key?: BridgeIDBKeyRange | IDBValidKey) {
    if (BridgeIDBFactory.enableTracing) {
      console.log(`getting from object store ${this._name} key ${key}`);
    }

    if (arguments.length === 0) {
      throw new TypeError();
    }

    if (!this._transaction._active) {
      throw new TransactionInactiveError();
    }

    if (this._deleted) {
      throw new InvalidStateError(
        "tried to call 'delete' on a deleted object store",
      );
    }

    let keyRange: BridgeIDBKeyRange;

    if (key instanceof BridgeIDBKeyRange) {
      keyRange = key;
    } else {
      try {
        keyRange = BridgeIDBKeyRange.only(valueToKey(key));
      } catch (e) {
        throw new DataError(
          `invalid key (type ${typeof key}) for object store '${this._name}'`,
        );
      }
    }

    const recordRequest: RecordGetRequest = {
      objectStoreName: this._name,
      indexName: undefined,
      lastIndexPosition: undefined,
      lastObjectStorePosition: undefined,
      direction: "next",
      limit: 1,
      resultLevel: ResultLevel.Full,
      range: keyRange,
    };

    const operation = async () => {
      if (BridgeIDBFactory.enableTracing) {
        console.log("running get operation:", recordRequest);
      }
      const { btx } = this._confirmStartedBackendTransaction();
      const result = await this._backend.getRecords(btx, recordRequest);

      if (BridgeIDBFactory.enableTracing) {
        console.log("get operation result count:", result.count);
      }

      if (result.count === 0) {
        return undefined;
      }
      const values = result.values;
      if (!values) {
        throw Error("invariant violated");
      }
      if (values.length !== 1) {
        throw Error("invariant violated");
      }
      return values[0];
    };

    return this._transaction._execRequestAsync({
      operation,
      source: this,
    });
  }

  // http://w3c.github.io/IndexedDB/#dom-idbobjectstore-getall
  public getAll(
    query?: BridgeIDBKeyRange | IDBValidKey,
    count?: number,
  ): IDBRequest<any[]> {
    if (BridgeIDBFactory.enableTracing) {
      console.log(`getting from object store ${this._name} key ${query}`);
    }

    if (!this._transaction._active) {
      throw new TransactionInactiveError();
    }

    if (this._deleted) {
      throw new InvalidStateError(
        "tried to call 'delete' on a deleted object store",
      );
    }

    if (count === undefined) {
      count = -1;
    }

    let keyRange: BridgeIDBKeyRange | null = simplifyRange(query);

    const recordRequest: RecordGetRequest = {
      objectStoreName: this._name,
      indexName: undefined,
      lastIndexPosition: undefined,
      lastObjectStorePosition: undefined,
      direction: "next",
      limit: count,
      resultLevel: ResultLevel.Full,
      range: keyRange,
    };

    const operation = async () => {
      if (BridgeIDBFactory.enableTracing) {
        console.log("running getAll operation:", recordRequest);
      }
      const { btx } = this._confirmStartedBackendTransaction();
      const result = await this._backend.getRecords(btx, recordRequest);

      if (BridgeIDBFactory.enableTracing) {
        console.log("get operation result count:", result.count);
      }
      const values = result.values;
      if (!values) {
        throw Error("invariant violated");
      }
      return values;
    };

    return this._transaction._execRequestAsync({
      operation,
      source: this,
    });
  }

  // http://w3c.github.io/IndexedDB/#dom-idbobjectstore-getkey
  public getKey(
    query?: BridgeIDBKeyRange | IDBValidKey,
  ): IDBRequest<IDBValidKey | undefined> {
    if (arguments.length === 0) {
      throw new TypeError();
    }

    if (!this._transaction._active) {
      throw new TransactionInactiveError();
    }

    if (this._deleted) {
      throw new InvalidStateError(
        "tried to call 'delete' on a deleted object store",
      );
    }

    let keyRange: BridgeIDBKeyRange | null = simplifyRange(query);

    const recordRequest: RecordGetRequest = {
      objectStoreName: this._name,
      indexName: undefined,
      lastIndexPosition: undefined,
      lastObjectStorePosition: undefined,
      direction: "next",
      limit: 1,
      resultLevel: ResultLevel.OnlyKeys,
      range: keyRange,
    };

    const operation = async () => {
      if (BridgeIDBFactory.enableTracing) {
        console.log("running getKey operation:", recordRequest);
      }
      const { btx } = this._confirmStartedBackendTransaction();
      const result = await this._backend.getRecords(btx, recordRequest);

      if (BridgeIDBFactory.enableTracing) {
        console.log("getKey operation result count:", result.count);
      }

      if (result.count === 0) {
        return undefined;
      }
      const primaryKeys = result.primaryKeys;
      if (!primaryKeys) {
        throw Error("invariant violated");
      }
      if (primaryKeys.length !== 1) {
        throw Error("invariant violated");
      }
      return primaryKeys[0];
    };

    return this._transaction._execRequestAsync({
      operation,
      source: this,
    });
  }

  // http://w3c.github.io/IndexedDB/#dom-idbobjectstore-getallkeys
  public getAllKeys(
    query?: BridgeIDBKeyRange | IDBValidKey,
    count?: number,
  ): IDBRequest<any[]> {
    if (arguments.length === 0) {
      throw new TypeError();
    }

    if (!this._transaction._active) {
      throw new TransactionInactiveError();
    }

    if (this._deleted) {
      throw new InvalidStateError(
        "tried to call 'delete' on a deleted object store",
      );
    }

    if (count === undefined) {
      count = -1;
    }

    let keyRange: BridgeIDBKeyRange;

    if (query instanceof BridgeIDBKeyRange) {
      keyRange = query;
    } else {
      try {
        keyRange = BridgeIDBKeyRange.only(valueToKey(query));
      } catch (e) {
        throw new DataError(
          `invalid key (type ${typeof query}) for object store '${this._name}'`,
        );
      }
    }

    const recordRequest: RecordGetRequest = {
      objectStoreName: this._name,
      indexName: undefined,
      lastIndexPosition: undefined,
      lastObjectStorePosition: undefined,
      direction: "next",
      limit: count,
      resultLevel: ResultLevel.OnlyKeys,
      range: keyRange,
    };

    const operation = async () => {
      const { btx } = this._confirmStartedBackendTransaction();
      const result = await this._backend.getRecords(btx, recordRequest);

      const primaryKeys = result.primaryKeys;
      if (!primaryKeys) {
        throw Error("invariant violated");
      }
      return primaryKeys;
    };

    return this._transaction._execRequestAsync({
      operation,
      source: this,
    });
  }

  public clear(): IDBRequest {
    if (!this._transaction._active) {
      throw new TransactionInactiveError();
    }

    if (this._deleted) {
      throw new InvalidStateError(
        "tried to call 'delete' on a deleted object store",
      );
    }

    const operation = async () => {
      const { btx } = this._confirmStartedBackendTransaction();
      await this._backend.clearObjectStore(btx, this._name);
    };

    return this._transaction._execRequestAsync({
      operation,
      source: this,
    });
  }

  public openCursor(
    range?: IDBKeyRange | IDBValidKey,
    direction: IDBCursorDirection = "next",
  ) {
    if (this._deleted) {
      throw new InvalidStateError(
        "tried to call 'openCursor' on a deleted object store",
      );
    }
    if (range === null) {
      range = undefined;
    }
    if (range !== undefined && !(range instanceof BridgeIDBKeyRange)) {
      range = BridgeIDBKeyRange.only(valueToKey(range));
    }

    const request = new BridgeIDBRequest();
    request._source = this;
    request.transaction = this._transaction;

    const cursor = new BridgeIDBCursorWithValue(
      this,
      this._name,
      undefined,
      range,
      direction,
      request,
    );

    return this._transaction._execRequestAsync({
      operation: () => cursor._iterate(),
      request,
      source: this,
    });
  }

  public openKeyCursor(
    range?: BridgeIDBKeyRange | IDBValidKey,
    direction?: IDBCursorDirection,
  ) {
    if (this._deleted) {
      throw new InvalidStateError(
        "tried to call 'openKeyCursor' on a deleted object store",
      );
    }
    if (range === null) {
      range = undefined;
    }
    if (range !== undefined && !(range instanceof BridgeIDBKeyRange)) {
      range = BridgeIDBKeyRange.only(valueToKey(range));
    }

    if (!direction) {
      direction = "next";
    }

    const request = new BridgeIDBRequest();
    request._source = this;
    request.transaction = this._transaction;

    const cursor = new BridgeIDBCursor(
      this,
      this._name,
      undefined,
      range,
      direction,
      request,
      true,
    );

    return this._transaction._execRequestAsync({
      operation: cursor._iterate.bind(cursor),
      request,
      source: this,
    });
  }

  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBObjectStore-createIndex-IDBIndex-DOMString-name-DOMString-sequence-DOMString--keyPath-IDBIndexParameters-optionalParameters
  public createIndex(
    indexName: string,
    keyPath: IDBKeyPath,
    optionalParameters: { multiEntry?: boolean; unique?: boolean } = {},
  ) {
    if (arguments.length < 2) {
      throw new TypeError();
    }

    if (!this._transaction._db._upgradeTransaction) {
      throw new InvalidStateError();
    }

    const { btx } = this._confirmStartedBackendTransaction();

    const multiEntry =
      optionalParameters.multiEntry !== undefined
        ? optionalParameters.multiEntry
        : false;
    const unique =
      optionalParameters.unique !== undefined
        ? optionalParameters.unique
        : false;

    if (this._transaction.mode !== "versionchange") {
      throw new InvalidStateError();
    }

    if (this._indexNames.indexOf(indexName) >= 0) {
      throw new ConstraintError();
    }

    validateKeyPath(keyPath);

    if (Array.isArray(keyPath) && multiEntry) {
      throw new InvalidAccessError();
    }

    this._backend.createIndex(
      btx,
      indexName,
      this._name,
      normalizeKeyPath(keyPath),
      multiEntry,
      unique,
    );

    const idx = this.index(indexName);
    idx._justCreated = true;
    return idx;
  }

  // https://w3c.github.io/IndexedDB/#dom-idbobjectstore-index
  public index(name: string) {
    if (arguments.length === 0) {
      throw new TypeError();
    }

    if (this._transaction._finished) {
      throw new InvalidStateError();
    }

    const index = this._indexesCache.get(name);
    if (index !== undefined) {
      return index;
    }
    const newIndex = new BridgeIDBIndex(this, name);
    this._indexesCache.set(name, newIndex);
    this._transaction._usedIndexes.push(newIndex);
    return newIndex;
  }

  public deleteIndex(indexName: string) {
    if (arguments.length === 0) {
      throw new TypeError();
    }

    if (this._transaction.mode !== "versionchange") {
      throw new InvalidStateError();
    }

    if (!this._transaction._db._upgradeTransaction) {
      throw new InvalidStateError();
    }

    const { btx } = this._confirmStartedBackendTransaction();

    const index = this._indexesCache.get(indexName);
    if (index !== undefined) {
      index._deleted = true;
      this._indexesCache.delete(indexName);
    }

    this._backend.deleteIndex(btx, this._name, indexName);
  }

  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#widl-IDBObjectStore-count-IDBRequest-any-key
  public count(key?: IDBValidKey | BridgeIDBKeyRange) {
    if (key === null) {
      key = undefined;
    }
    if (key !== undefined && !(key instanceof BridgeIDBKeyRange)) {
      key = BridgeIDBKeyRange.only(valueToKey(key));
    }

    const recordGetRequest: RecordGetRequest = {
      direction: "next",
      indexName: undefined,
      lastIndexPosition: undefined,
      limit: -1,
      objectStoreName: this._name,
      lastObjectStorePosition: undefined,
      range: key,
      resultLevel: ResultLevel.OnlyCount,
    };

    const operation = async () => {
      const { btx } = this._confirmStartedBackendTransaction();
      const result = await this._backend.getRecords(btx, recordGetRequest);
      return result.count;
    };

    return this._transaction._execRequestAsync({ operation, source: this });
  }

  public toString() {
    return "[object IDBObjectStore]";
  }
}

/** @public */
export class BridgeIDBRequest extends FakeEventTarget implements IDBRequest {
  _result: any = null;
  _error: Error | null | undefined = null;
  get source(): IDBObjectStore | IDBIndex | IDBCursor {
    if (!this._source) {
      throw Error("internal invariant failed: source is null");
    }
    return this._source;
  }
  _source:
    | BridgeIDBCursor
    | BridgeIDBIndex
    | BridgeIDBObjectStore
    | null = null;
  transaction: BridgeIDBTransaction | null = null;
  readyState: "done" | "pending" = "pending";
  onsuccess: EventListener | null = null;
  onerror: EventListener | null = null;

  _debugName: string | undefined;

  get error() {
    if (this.readyState === "pending") {
      throw new InvalidStateError();
    }
    return this._error;
  }

  set error(value: any) {
    this._error = value;
  }

  get result() {
    if (this.readyState === "pending") {
      throw new InvalidStateError();
    }
    return this._result;
  }

  set result(value: any) {
    this._result = value;
  }

  toString() {
    return "[object IDBRequest]";
  }

  _finishWithError(err: Error) {
    this.result = undefined;
    this.readyState = "done";

    this.error = new Error(err.message);
    this.error.name = err.name;

    const event = new FakeEvent("error", {
      bubbles: true,
      cancelable: true,
    });
    event.eventPath = [];

    this.dispatchEvent(event);
  }

  _finishWithResult(result: any) {
    this.result = result;
    this.readyState = "done";

    const event = new FakeEvent("success");
    event.eventPath = [];
    this.dispatchEvent(event);
  }
}

/** @public */
export class BridgeIDBOpenDBRequest
  extends BridgeIDBRequest
  implements IDBOpenDBRequest {
  public onupgradeneeded: EventListener | null = null;
  public onblocked: EventListener | null = null;

  get source(): IDBObjectStore | IDBIndex | IDBCursor {
    // This is a type safety violation, but it is required by the
    // IndexedDB standard.
    // On the one hand, IDBOpenDBRequest implements IDBRequest.
    // But that's technically impossible, as the "source" of the
    // IDBOpenDB request may be null, while the one from IDBRequest
    // may not be null.
    return this._source as any;
  }

  constructor() {
    super();
    // https://www.w3.org/TR/IndexedDB/#open-requests
    this._source = null;
  }

  public toString() {
    return "[object IDBOpenDBRequest]";
  }
}

function waitMacroQueue(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let immCalled = false;
    let timeoutCalled = false;
    setImmediate(() => {
      immCalled = true;
      if (immCalled && timeoutCalled) {
        resolve();
      }
    });
    setTimeout(() => {
      timeoutCalled = true;
      if (immCalled && timeoutCalled) {
        resolve();
      }
    }, 0);
  });
}

// http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#transaction
/** @public */
export class BridgeIDBTransaction
  extends FakeEventTarget
  implements IDBTransaction {
  _committed: boolean = false;
  /**
   * A transaction is active as long as new operations can be
   * placed against it.
   */
  _active: boolean = false;
  _started: boolean = false;
  _aborted: boolean = false;
  _objectStoresCache: Map<string, BridgeIDBObjectStore> = new Map();

  /**
   * Object stores used during the transaction.
   */
  _usedObjectStores: BridgeIDBObjectStore[] = [];

  /**
   * Object stores used during the transaction.
   */
  _usedIndexes: BridgeIDBIndex[] = [];

  /**
   * Name that can be set to identify the transaction in logs.
   */
  _debugName: string | undefined = undefined;

  /**
   * https://www.w3.org/TR/IndexedDB-2/#transaction-lifetime-concept
   *
   * When a transaction is committed or aborted, it is said to be finished.
   */
  get _finished(): boolean {
    return this._committed || this._aborted;
  }

  _openRequest: BridgeIDBOpenDBRequest | null = null;

  _backendTransaction?: DatabaseTransaction;

  _cachedObjectStoreNames: DOMStringList | undefined;

  get objectStoreNames(): DOMStringList {
    if (!this._cachedObjectStoreNames) {
      if (this._openRequest) {
        this._cachedObjectStoreNames = this._db.objectStoreNames;
      } else {
        this._cachedObjectStoreNames = fakeDOMStringList(
          Array.from(this._scope).sort(),
        );
      }
    }
    return this._cachedObjectStoreNames;
  }
  mode: IDBTransactionMode;
  _db: BridgeIDBDatabase;

  get db(): IDBDatabase {
    return this._db;
  }

  _error: Error | null = null;

  get error(): DOMException {
    return this._error as DOMException;
  }

  public onabort: EventListener | null = null;
  public oncomplete: EventListener | null = null;
  public onerror: EventListener | null = null;

  private _waitPromise: Promise<void>;
  private _resolveWait: () => void;

  public _scope: Set<string>;
  private _requests: Array<{
    operation: () => Promise<void>;
    request: BridgeIDBRequest;
  }> = [];

  get _backend(): Backend {
    return this._db._backend;
  }

  constructor(
    storeNames: string[],
    mode: IDBTransactionMode,
    db: BridgeIDBDatabase,
    backendTransaction?: DatabaseTransaction,
    openRequest?: BridgeIDBOpenDBRequest,
  ) {
    super();

    const myOpenPromise = openPromise<void>();
    this._waitPromise = myOpenPromise.promise;
    this._resolveWait = myOpenPromise.resolve;

    this._scope = new Set(storeNames);
    this._backendTransaction = backendTransaction;
    this.mode = mode;
    this._db = db;

    this._db._transactions.push(this);

    this._openRequest = openRequest ?? null;
  }

  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-for-aborting-a-transaction
  async _abort(errName: string | null) {
    if (BridgeIDBFactory.enableTracing) {
      console.log("TRACE: aborting transaction");
    }

    if (this._aborted) {
      return;
    }

    this._aborted = true;
    this._active = false;

    if (errName !== null) {
      const e = new Error();
      e.name = errName;
      this._error = e;
    }

    if (BridgeIDBFactory.enableTracing) {
      console.log(`TRACE: aborting ${this._requests.length} requests`);
    }

    // Should this directly remove from _requests?
    for (const { request } of this._requests) {
      if (request.readyState !== "done") {
        // This will cancel execution of this request's operation
        request.readyState = "done";
        if (BridgeIDBFactory.enableTracing) {
          console.log("dispatching error event");
        }
        request.result = undefined;
        request.error = new AbortError();

        const event = new FakeEvent("error", {
          bubbles: true,
          cancelable: true,
        });
        event.eventPath = [this._db, this];
        request.dispatchEvent(event);
      }
    }

    // "Any object stores and indexes which were created during the
    // transaction are now considered deleted for the purposes of other
    // algorithms."
    if (this._db._upgradeTransaction) {
      for (const os of this._usedObjectStores) {
        if (os._justCreated) {
          os._deleted = true;
        }
      }
      for (const ind of this._usedIndexes) {
        if (ind._justCreated) {
          ind._deleted = true;
        }
      }
    }

    // ("abort a transaction", step 5.1)
    if (this._openRequest) {
      this._db._upgradeTransaction = null;
    }

    // All steps before happened synchronously.  Now
    // we asynchronously roll back the backend transaction,
    // if necessary/possible.

    const maybeBtx = this._backendTransaction;
    if (maybeBtx) {
      this._db._schema = this._backend.getInitialTransactionSchema(maybeBtx);
      // Only roll back if we actually executed the scheduled operations.
      await this._backend.rollback(maybeBtx);
      this._backendTransaction = undefined;
    } else {
      this._db._schema = this._backend.getSchema(this._db._backendConnection);
    }

    queueTask(() => {
      const event = new FakeEvent("abort", {
        bubbles: true,
        cancelable: false,
      });
      event.eventPath = [this._db];
      this.dispatchEvent(event);
    });

    if (this._openRequest) {
      this._openRequest.transaction = null;
      this._openRequest.result = undefined;
      this._openRequest.readyState = "pending";
    }
  }

  public abort() {
    if (this._finished) {
      throw new InvalidStateError();
    }
    this._abort(null);
  }

  // http://w3c.github.io/IndexedDB/#dom-idbtransaction-objectstore
  public objectStore(name: string): BridgeIDBObjectStore {
    if (!this._active) {
      throw new TransactionInactiveError();
    }

    if (!this._db._schema.objectStores[name]) {
      throw new NotFoundError();
    }

    if (!this._db._upgradeTransaction) {
      if (!this._scope.has(name)) {
        throw new NotFoundError();
      }
    }

    const objectStore = this._objectStoresCache.get(name);
    if (objectStore !== undefined) {
      return objectStore;
    }

    const newObjectStore = new BridgeIDBObjectStore(this, name);
    this._objectStoresCache.set(name, newObjectStore);
    this._usedObjectStores.push(newObjectStore);
    return newObjectStore;
  }

  // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-steps-for-asynchronously-executing-a-request
  public _execRequestAsync(obj: RequestObj) {
    const source = obj.source;
    const operation = obj.operation;
    let request = obj.hasOwnProperty("request") ? obj.request : null;

    if (!this._active) {
      throw new TransactionInactiveError();
    }

    // Request should only be passed for cursors
    if (!request) {
      if (!source) {
        // Special requests like indexes that just need to run some code
        request = new BridgeIDBRequest();
      } else {
        request = new BridgeIDBRequest();
        request._source = source;
        request.transaction = (source as any).transaction;
      }
    }

    this._requests.push({
      operation,
      request,
    });

    return request;
  }

  /**
   * Actually execute the scheduled work for this transaction.
   */
  public async _start() {
    if (BridgeIDBFactory.enableTracing) {
      console.log(
        `TRACE: IDBTransaction._start, ${this._requests.length} queued`,
      );
    }

    this._started = true;

    // Remove from request queue - cursor ones will be added back if necessary
    // by cursor.continue and such
    let operation;
    let request;
    while (this._requests.length > 0) {
      const r = this._requests.shift();

      // This should only be false if transaction was aborted
      if (r && r.request.readyState !== "done") {
        request = r.request;
        operation = r.operation;
        break;
      }
    }

    if (request && operation) {
      if (!this._backendTransaction && !this._aborted) {
        if (BridgeIDBFactory.enableTracing) {
          console.log("beginning backend transaction to process operation");
        }
        this._backendTransaction = await this._backend.beginTransaction(
          this._db._backendConnection,
          Array.from(this._scope),
          this.mode,
        );
        if (BridgeIDBFactory.enableTracing) {
          console.log(
            `started backend transaction (${this._backendTransaction.transactionCookie})`,
          );
        }
      }

      await waitMacroQueue();

      if (!request._source) {
        // Special requests like indexes that just need to run some code,
        // with error handling already built into operation
        await operation();
      } else {
        let event;
        try {
          BridgeIDBFactory.enableTracing &&
            console.log("TRACE: running operation in transaction");
          const result = await operation();
          // Wait until setTimeout/setImmediate tasks are run
          BridgeIDBFactory.enableTracing &&
            console.log(
              `TRACE: request (${
                request._debugName ?? "??"
              }) in transaction finished with success`,
            );
          request.readyState = "done";
          request.result = result;
          request.error = undefined;

          // https://www.w3.org/TR/IndexedDB-2/#fire-error-event
          this._active = true;
          event = new FakeEvent("success", {
            bubbles: false,
            cancelable: false,
          });

          queueTask(() => {
            this._active = false;
          });

          try {
            event.eventPath = [this._db, this];
            request.dispatchEvent(event);
          } catch (err) {
            if (BridgeIDBFactory.enableTracing) {
              console.log(
                "TRACING: caught error in transaction success event handler",
              );
            }
            this._abort("AbortError");
            this._active = false;
            throw err;
          }
        } catch (err: any) {
          if (BridgeIDBFactory.enableTracing) {
            console.log("TRACING: error during operation: ", err);
          }
          request.readyState = "done";
          request.result = undefined;
          request.error = err;

          // http://www.w3.org/TR/2015/REC-IndexedDB-20150108/#dfn-fire-an-error-event
          this._active = true;
          queueTask(() => {
            this._active = false;
          });
          event = new FakeEvent("error", {
            bubbles: true,
            cancelable: true,
          });

          try {
            event.eventPath = [this._db, this];
            request.dispatchEvent(event);
          } catch (err) {
            this._abort("AbortError");
            throw err;
          }
          if (!event.canceled) {
            this._abort(err.name);
          }
        }
      }

      // On to the next one
      if (this._requests.length > 0) {
        this._start();
      } else {
        // Give it another chance for new handlers to be set before finishing
        queueTask(() => this._start());
      }
      return;
    }

    if (!this._finished && !this._committed) {
      if (BridgeIDBFactory.enableTracing) {
        console.log(
          `setting transaction to inactive, db=${this._db._getReadableName()}`,
        );
      }

      this._active = false;

      // We only have a backend transaction if any requests were placed
      // against the transactions.
      if (this._backendTransaction) {
        await this._backend.commit(this._backendTransaction);
      }

      // We must exit the upgrade transaction here, so that the "complete"
      // event handler can already do other transactions.
      this._db._upgradeTransaction = null;

      this._committed = true;
      if (!this._error) {
        if (BridgeIDBFactory.enableTracing) {
          console.log(
            `dispatching 'complete' event on transaction (${
              this._debugName ?? "??"
            })`,
          );
        }
        const event = new FakeEvent("complete");
        event.eventPath = [this._db, this];
        this.dispatchEvent(event);
      }

      const idx = this._db._transactions.indexOf(this);
      if (idx < 0) {
        throw Error("invariant failed");
      }
      this._db._transactions.splice(idx, 1);

      this._resolveWait();
    }
    if (this._aborted) {
      this._resolveWait();
    }
  }

  public commit() {
    // The current spec doesn't even have an explicit commit method.
    // We still support it, effectively as a "no-operation" that
    // prevents new operations from being scheduled.
    if (!this._active) {
      throw new InvalidStateError();
    }
    this._active = false;
  }

  public toString() {
    return "[object IDBRequest]";
  }

  _waitDone(): Promise<void> {
    return this._waitPromise;
  }
}

export class BridgeIDBVersionChangeEvent extends FakeEvent {
  public newVersion: number | null;
  public oldVersion: number;

  constructor(
    type: "blocked" | "success" | "upgradeneeded" | "versionchange",
    parameters: { newVersion?: number | null; oldVersion?: number } = {},
  ) {
    super(type);

    this.newVersion =
      parameters.newVersion !== undefined ? parameters.newVersion : null;
    this.oldVersion =
      parameters.oldVersion !== undefined ? parameters.oldVersion : 0;
  }

  public toString() {
    return "[object IDBVersionChangeEvent]";
  }
}
