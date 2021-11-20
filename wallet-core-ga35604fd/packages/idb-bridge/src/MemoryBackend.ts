/*
 Copyright 2019 Florian Dold

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
  Schema,
  RecordStoreRequest,
  IndexProperties,
  RecordGetRequest,
  RecordGetResponse,
  ResultLevel,
  StoreLevel,
  RecordStoreResponse,
} from "./backend-interface";
import {
  structuredClone,
  structuredEncapsulate,
  structuredRevive,
} from "./util/structuredClone";
import { ConstraintError, DataError } from "./util/errors";
import BTree, { ISortedMapF } from "./tree/b+tree";
import { compareKeys } from "./util/cmp";
import { StoreKeyResult, makeStoreKeyValue } from "./util/makeStoreKeyValue";
import { getIndexKeys } from "./util/getIndexKeys";
import { openPromise } from "./util/openPromise";
import { IDBKeyRange, IDBTransactionMode, IDBValidKey } from "./idbtypes";
import { BridgeIDBKeyRange } from "./bridge-idb";

type Key = IDBValidKey;
type Value = unknown;

enum TransactionLevel {
  None = 0,
  Read = 1,
  Write = 2,
  VersionChange = 3,
}

interface ObjectStore {
  originalName: string;
  modifiedName: string | undefined;
  originalData: ISortedMapF<Key, ObjectStoreRecord>;
  modifiedData: ISortedMapF<Key, ObjectStoreRecord> | undefined;
  deleted: boolean;
  originalKeyGenerator: number;
  modifiedKeyGenerator: number | undefined;
  committedIndexes: { [name: string]: Index };
  modifiedIndexes: { [name: string]: Index };
}

interface Index {
  originalName: string;
  modifiedName: string | undefined;
  originalData: ISortedMapF<Key, IndexRecord>;
  modifiedData: ISortedMapF<Key, IndexRecord> | undefined;
  deleted: boolean;
}

interface Database {
  committedObjectStores: { [name: string]: ObjectStore };
  committedSchema: Schema;
  /**
   * Was the transaction deleted during the running transaction?
   */
  deleted: boolean;

  txLevel: TransactionLevel;

  txOwnerConnectionCookie?: string;
  txOwnerTransactionCookie?: string;

  /**
   * Object stores that the transaction is allowed to access.
   */
  txRestrictObjectStores: string[] | undefined;

  /**
   * Connection cookies of current connections.
   */
  connectionCookies: string[];
}

/** @public */
export interface IndexDump {
  name: string;
  records: IndexRecord[];
}

/** @public */
export interface ObjectStoreDump {
  name: string;
  keyGenerator: number;
  records: ObjectStoreRecord[];
  indexes: { [name: string]: IndexDump };
}

/** @public */
export interface DatabaseDump {
  schema: Schema;
  objectStores: { [name: string]: ObjectStoreDump };
}

/** @public */
export interface MemoryBackendDump {
  databases: { [name: string]: DatabaseDump };
}

interface ObjectStoreMapEntry {
  store: ObjectStore;
  indexMap: { [currentName: string]: Index };
}

interface Connection {
  dbName: string;

  modifiedSchema: Schema;

  /**
   * Map from the effective name of an object store during
   * the transaction to the real name.
   */
  objectStoreMap: { [currentName: string]: ObjectStoreMapEntry };
}

/** @public */
export interface IndexRecord {
  indexKey: Key;
  primaryKeys: Key[];
}

/** @public */
export interface ObjectStoreRecord {
  primaryKey: Key;
  value: Value;
}

class AsyncCondition {
  _waitPromise: Promise<void>;
  _resolveWaitPromise: () => void;
  constructor() {
    const op = openPromise<void>();
    this._waitPromise = op.promise;
    this._resolveWaitPromise = op.resolve;
  }

  wait(): Promise<void> {
    return this._waitPromise;
  }

  trigger(): void {
    this._resolveWaitPromise();
    const op = openPromise<void>();
    this._waitPromise = op.promise;
    this._resolveWaitPromise = op.resolve;
  }
}

function nextStoreKey<T>(
  forward: boolean,
  data: ISortedMapF<Key, ObjectStoreRecord>,
  k: Key | undefined,
) {
  if (k === undefined || k === null) {
    return undefined;
  }
  const res = forward ? data.nextHigherPair(k) : data.nextLowerPair(k);
  if (!res) {
    return undefined;
  }
  return res[1].primaryKey;
}

function furthestKey(
  forward: boolean,
  key1: Key | undefined,
  key2: Key | undefined,
) {
  if (key1 === undefined) {
    return key2;
  }
  if (key2 === undefined) {
    return key1;
  }
  const cmpResult = compareKeys(key1, key2);
  if (cmpResult === 0) {
    // Same result
    return key1;
  }
  if (forward && cmpResult === 1) {
    return key1;
  }
  if (forward && cmpResult === -1) {
    return key2;
  }
  if (!forward && cmpResult === 1) {
    return key2;
  }
  if (!forward && cmpResult === -1) {
    return key1;
  }
}

/**
 * Primitive in-memory backend.
 *
 * @public
 */
export class MemoryBackend implements Backend {
  private databases: { [name: string]: Database } = {};

  private connectionIdCounter = 1;

  private transactionIdCounter = 1;

  /**
   * Connections by connection cookie.
   */
  private connections: { [name: string]: Connection } = {};

  /**
   * Connections by transaction (!!) cookie.  In this implementation,
   * at most one transaction can run at the same time per connection.
   */
  private connectionsByTransaction: { [tx: string]: Connection } = {};

  /**
   * Condition that is triggered whenever a client disconnects.
   */
  private disconnectCond: AsyncCondition = new AsyncCondition();

  /**
   * Condition that is triggered whenever a transaction finishes.
   */
  private transactionDoneCond: AsyncCondition = new AsyncCondition();

  afterCommitCallback?: () => Promise<void>;

  enableTracing: boolean = false;

  /**
   * Load the data in this IndexedDB backend from a dump in JSON format.
   *
   * Must be called before any connections to the database backend have
   * been made.
   */
  importDump(data: any) {
    if (this.enableTracing) {
      console.log("importing dump (a)");
    }
    if (this.transactionIdCounter != 1 || this.connectionIdCounter != 1) {
      throw Error(
        "data must be imported before first transaction or connection",
      );
    }

    if (typeof data !== "object") {
      throw Error("db dump corrupt");
    }

    data = structuredRevive(data);

    this.databases = {};

    for (const dbName of Object.keys(data.databases)) {
      const schema = data.databases[dbName].schema;
      if (typeof schema !== "object") {
        throw Error("DB dump corrupt");
      }
      const objectStores: { [name: string]: ObjectStore } = {};
      for (const objectStoreName of Object.keys(
        data.databases[dbName].objectStores,
      )) {
        const dumpedObjectStore =
          data.databases[dbName].objectStores[objectStoreName];

        const indexes: { [name: string]: Index } = {};
        for (const indexName of Object.keys(dumpedObjectStore.indexes)) {
          const dumpedIndex = dumpedObjectStore.indexes[indexName];
          const pairs = dumpedIndex.records.map((r: any) => {
            return structuredClone([r.indexKey, r]);
          });
          const indexData: ISortedMapF<Key, IndexRecord> = new BTree(
            pairs,
            compareKeys,
          );
          const index: Index = {
            deleted: false,
            modifiedData: undefined,
            modifiedName: undefined,
            originalName: indexName,
            originalData: indexData,
          };
          indexes[indexName] = index;
        }

        const pairs = dumpedObjectStore.records.map((r: any) => {
          return structuredClone([r.primaryKey, r]);
        });
        const objectStoreData: ISortedMapF<Key, ObjectStoreRecord> = new BTree(
          pairs,
          compareKeys,
        );
        const objectStore: ObjectStore = {
          deleted: false,
          modifiedData: undefined,
          modifiedName: undefined,
          modifiedKeyGenerator: undefined,
          originalData: objectStoreData,
          originalName: objectStoreName,
          originalKeyGenerator: dumpedObjectStore.keyGenerator,
          committedIndexes: indexes,
          modifiedIndexes: {},
        };
        objectStores[objectStoreName] = objectStore;
      }
      const db: Database = {
        deleted: false,
        committedObjectStores: objectStores,
        committedSchema: structuredClone(schema),
        connectionCookies: [],
        txLevel: TransactionLevel.None,
        txRestrictObjectStores: undefined,
      };
      this.databases[dbName] = db;
    }
  }

  private makeObjectStoreMap(
    database: Database,
  ): { [currentName: string]: ObjectStoreMapEntry } {
    let map: { [currentName: string]: ObjectStoreMapEntry } = {};
    for (let objectStoreName in database.committedObjectStores) {
      const store = database.committedObjectStores[objectStoreName];
      const entry: ObjectStoreMapEntry = {
        store,
        indexMap: Object.assign({}, store.committedIndexes),
      };
      map[objectStoreName] = entry;
    }
    return map;
  }

  /**
   * Export the contents of the database to JSON.
   *
   * Only exports data that has been committed.
   */
  exportDump(): MemoryBackendDump {
    this.enableTracing && console.log("exporting dump");
    const dbDumps: { [name: string]: DatabaseDump } = {};
    for (const dbName of Object.keys(this.databases)) {
      const db = this.databases[dbName];
      const objectStores: { [name: string]: ObjectStoreDump } = {};
      for (const objectStoreName of Object.keys(db.committedObjectStores)) {
        const objectStore = db.committedObjectStores[objectStoreName];

        const indexes: { [name: string]: IndexDump } = {};
        for (const indexName of Object.keys(objectStore.committedIndexes)) {
          const index = objectStore.committedIndexes[indexName];
          const indexRecords: IndexRecord[] = [];
          index.originalData.forEach((v: IndexRecord) => {
            indexRecords.push(structuredClone(v));
          });
          indexes[indexName] = { name: indexName, records: indexRecords };
        }
        const objectStoreRecords: ObjectStoreRecord[] = [];
        objectStore.originalData.forEach((v: ObjectStoreRecord) => {
          objectStoreRecords.push(structuredClone(v));
        });
        objectStores[objectStoreName] = {
          name: objectStoreName,
          records: objectStoreRecords,
          keyGenerator: objectStore.originalKeyGenerator,
          indexes: indexes,
        };
      }
      const dbDump: DatabaseDump = {
        objectStores,
        schema: structuredClone(this.databases[dbName].committedSchema),
      };
      dbDumps[dbName] = dbDump;
    }
    return structuredEncapsulate({ databases: dbDumps });
  }

  async getDatabases(): Promise<{ name: string; version: number }[]> {
    if (this.enableTracing) {
      console.log("TRACING: getDatabase");
    }
    const dbList = [];
    for (const name in this.databases) {
      dbList.push({
        name,
        version: this.databases[name].committedSchema.databaseVersion,
      });
    }
    return dbList;
  }

  async deleteDatabase(name: string): Promise<void> {
    if (this.enableTracing) {
      console.log(`TRACING: deleteDatabase(${name})`);
    }
    const myDb = this.databases[name];
    if (!myDb) {
      throw Error("db not found");
    }
    if (myDb.committedSchema.databaseName !== name) {
      throw Error("name does not match");
    }

    while (myDb.txLevel !== TransactionLevel.None) {
      await this.transactionDoneCond.wait();
    }

    myDb.deleted = true;
    delete this.databases[name];
  }

  async connectDatabase(name: string): Promise<DatabaseConnection> {
    if (this.enableTracing) {
      console.log(`TRACING: connectDatabase(${name})`);
    }
    const connectionId = this.connectionIdCounter++;
    const connectionCookie = `connection-${connectionId}`;

    let database = this.databases[name];
    if (!database) {
      const schema: Schema = {
        databaseName: name,
        databaseVersion: 0,
        objectStores: {},
      };
      database = {
        committedSchema: schema,
        deleted: false,
        committedObjectStores: {},
        txLevel: TransactionLevel.None,
        connectionCookies: [],
        txRestrictObjectStores: undefined,
      };
      this.databases[name] = database;
    }

    if (database.connectionCookies.includes(connectionCookie)) {
      throw Error("already connected");
    }

    database.connectionCookies.push(connectionCookie);

    const myConn: Connection = {
      dbName: name,
      objectStoreMap: this.makeObjectStoreMap(database),
      modifiedSchema: structuredClone(database.committedSchema),
    };

    this.connections[connectionCookie] = myConn;

    return { connectionCookie };
  }

  async beginTransaction(
    conn: DatabaseConnection,
    objectStores: string[],
    mode: IDBTransactionMode,
  ): Promise<DatabaseTransaction> {
    const transactionCookie = `tx-${this.transactionIdCounter++}`;
    if (this.enableTracing) {
      console.log(`TRACING: beginTransaction ${transactionCookie}`);
    }
    const myConn = this.connections[conn.connectionCookie];
    if (!myConn) {
      throw Error("connection not found");
    }
    const myDb = this.databases[myConn.dbName];
    if (!myDb) {
      throw Error("db not found");
    }

    while (myDb.txLevel !== TransactionLevel.None) {
      if (this.enableTracing) {
        console.log(`TRACING: beginTransaction -- waiting for others to close`);
      }
      await this.transactionDoneCond.wait();
    }

    if (mode === "readonly") {
      myDb.txLevel = TransactionLevel.Read;
    } else if (mode === "readwrite") {
      myDb.txLevel = TransactionLevel.Write;
    } else {
      throw Error("unsupported transaction mode");
    }

    myDb.txRestrictObjectStores = [...objectStores];

    this.connectionsByTransaction[transactionCookie] = myConn;

    return { transactionCookie };
  }

  async enterVersionChange(
    conn: DatabaseConnection,
    newVersion: number,
  ): Promise<DatabaseTransaction> {
    if (this.enableTracing) {
      console.log(`TRACING: enterVersionChange`);
    }
    const transactionCookie = `tx-vc-${this.transactionIdCounter++}`;
    const myConn = this.connections[conn.connectionCookie];
    if (!myConn) {
      throw Error("connection not found");
    }
    const myDb = this.databases[myConn.dbName];
    if (!myDb) {
      throw Error("db not found");
    }

    while (myDb.txLevel !== TransactionLevel.None) {
      await this.transactionDoneCond.wait();
    }

    myDb.txLevel = TransactionLevel.VersionChange;
    myDb.txOwnerConnectionCookie = conn.connectionCookie;
    myDb.txOwnerTransactionCookie = transactionCookie;
    myDb.txRestrictObjectStores = undefined;

    this.connectionsByTransaction[transactionCookie] = myConn;

    myConn.modifiedSchema.databaseVersion = newVersion;

    return { transactionCookie };
  }

  async close(conn: DatabaseConnection): Promise<void> {
    if (this.enableTracing) {
      console.log(`TRACING: close (${conn.connectionCookie})`);
    }
    const myConn = this.connections[conn.connectionCookie];
    if (!myConn) {
      throw Error("connection not found - already closed?");
    }
    const myDb = this.databases[myConn.dbName];
    // FIXME: what if we're still in a transaction?
    myDb.connectionCookies = myDb.connectionCookies.filter(
      (x) => x != conn.connectionCookie,
    );
    delete this.connections[conn.connectionCookie];
    this.disconnectCond.trigger();
  }

  private requireConnection(dbConn: DatabaseConnection): Connection {
    const myConn = this.connections[dbConn.connectionCookie];
    if (!myConn) {
      throw Error(`unknown connection (${dbConn.connectionCookie})`);
    }
    return myConn;
  }

  private requireConnectionFromTransaction(
    btx: DatabaseTransaction,
  ): Connection {
    const myConn = this.connectionsByTransaction[btx.transactionCookie];
    if (!myConn) {
      throw Error(`unknown transaction (${btx.transactionCookie})`);
    }
    return myConn;
  }

  getSchema(dbConn: DatabaseConnection): Schema {
    if (this.enableTracing) {
      console.log(`TRACING: getSchema`);
    }
    const myConn = this.requireConnection(dbConn);
    const db = this.databases[myConn.dbName];
    if (!db) {
      throw Error("db not found");
    }
    return db.committedSchema;
  }

  getCurrentTransactionSchema(btx: DatabaseTransaction): Schema {
    const myConn = this.requireConnectionFromTransaction(btx);
    const db = this.databases[myConn.dbName];
    if (!db) {
      throw Error("db not found");
    }
    return myConn.modifiedSchema;
  }

  getInitialTransactionSchema(btx: DatabaseTransaction): Schema {
    const myConn = this.requireConnectionFromTransaction(btx);
    const db = this.databases[myConn.dbName];
    if (!db) {
      throw Error("db not found");
    }
    return db.committedSchema;
  }

  renameIndex(
    btx: DatabaseTransaction,
    objectStoreName: string,
    oldName: string,
    newName: string,
  ): void {
    if (this.enableTracing) {
      console.log(`TRACING: renameIndex(?, ${oldName}, ${newName})`);
    }
    const myConn = this.requireConnectionFromTransaction(btx);
    const db = this.databases[myConn.dbName];
    if (!db) {
      throw Error("db not found");
    }
    if (db.txLevel < TransactionLevel.VersionChange) {
      throw Error("only allowed in versionchange transaction");
    }
    let schema = myConn.modifiedSchema;
    if (!schema) {
      throw Error();
    }
    const indexesSchema = schema.objectStores[objectStoreName].indexes;
    if (indexesSchema[newName]) {
      throw new Error("new index name already used");
    }
    if (!indexesSchema) {
      throw new Error("new index name already used");
    }
    const index: Index =
      myConn.objectStoreMap[objectStoreName].indexMap[oldName];
    if (!index) {
      throw Error("old index missing in connection's index map");
    }
    indexesSchema[newName] = indexesSchema[newName];
    delete indexesSchema[oldName];
    myConn.objectStoreMap[objectStoreName].indexMap[newName] = index;
    delete myConn.objectStoreMap[objectStoreName].indexMap[oldName];
    index.modifiedName = newName;
  }

  deleteIndex(
    btx: DatabaseTransaction,
    objectStoreName: string,
    indexName: string,
  ): void {
    if (this.enableTracing) {
      console.log(`TRACING: deleteIndex(${indexName})`);
    }
    const myConn = this.requireConnectionFromTransaction(btx);
    const db = this.databases[myConn.dbName];
    if (!db) {
      throw Error("db not found");
    }
    if (db.txLevel < TransactionLevel.VersionChange) {
      throw Error("only allowed in versionchange transaction");
    }
    let schema = myConn.modifiedSchema;
    if (!schema) {
      throw Error();
    }
    if (!schema.objectStores[objectStoreName].indexes[indexName]) {
      throw new Error("index does not exist");
    }
    const index: Index =
      myConn.objectStoreMap[objectStoreName].indexMap[indexName];
    if (!index) {
      throw Error("old index missing in connection's index map");
    }
    index.deleted = true;
    delete schema.objectStores[objectStoreName].indexes[indexName];
    delete myConn.objectStoreMap[objectStoreName].indexMap[indexName];
  }

  deleteObjectStore(btx: DatabaseTransaction, name: string): void {
    if (this.enableTracing) {
      console.log(
        `TRACING: deleteObjectStore(${name}) in ${btx.transactionCookie}`,
      );
    }
    const myConn = this.requireConnectionFromTransaction(btx);
    const db = this.databases[myConn.dbName];
    if (!db) {
      throw Error("db not found");
    }
    if (db.txLevel < TransactionLevel.VersionChange) {
      throw Error("only allowed in versionchange transaction");
    }
    const schema = myConn.modifiedSchema;
    if (!schema) {
      throw Error();
    }
    const objectStoreProperties = schema.objectStores[name];
    if (!objectStoreProperties) {
      throw Error("object store not found");
    }
    const objectStoreMapEntry = myConn.objectStoreMap[name];
    if (!objectStoreMapEntry) {
      throw Error("object store not found in map");
    }
    const indexNames = Object.keys(objectStoreProperties.indexes);
    for (const indexName of indexNames) {
      this.deleteIndex(btx, name, indexName);
    }

    objectStoreMapEntry.store.deleted = true;
    delete myConn.objectStoreMap[name];
    delete schema.objectStores[name];
  }

  renameObjectStore(
    btx: DatabaseTransaction,
    oldName: string,
    newName: string,
  ): void {
    if (this.enableTracing) {
      console.log(`TRACING: renameObjectStore(?, ${oldName}, ${newName})`);
    }

    const myConn = this.requireConnectionFromTransaction(btx);
    const db = this.databases[myConn.dbName];
    if (!db) {
      throw Error("db not found");
    }
    if (db.txLevel < TransactionLevel.VersionChange) {
      throw Error("only allowed in versionchange transaction");
    }
    const schema = myConn.modifiedSchema;
    if (!schema) {
      throw Error();
    }
    if (!schema.objectStores[oldName]) {
      throw Error("object store not found");
    }
    if (schema.objectStores[newName]) {
      throw Error("new object store already exists");
    }
    const objectStoreMapEntry = myConn.objectStoreMap[oldName];
    if (!objectStoreMapEntry) {
      throw Error("object store not found in map");
    }
    objectStoreMapEntry.store.modifiedName = newName;
    schema.objectStores[newName] = schema.objectStores[oldName];
    delete schema.objectStores[oldName];
    delete myConn.objectStoreMap[oldName];
    myConn.objectStoreMap[newName] = objectStoreMapEntry;
  }

  createObjectStore(
    btx: DatabaseTransaction,
    name: string,
    keyPath: string[] | null,
    autoIncrement: boolean,
  ): void {
    if (this.enableTracing) {
      console.log(
        `TRACING: createObjectStore(${btx.transactionCookie}, ${name})`,
      );
    }
    const myConn = this.requireConnectionFromTransaction(btx);
    const db = this.databases[myConn.dbName];
    if (!db) {
      throw Error("db not found");
    }
    if (db.txLevel < TransactionLevel.VersionChange) {
      throw Error("only allowed in versionchange transaction");
    }
    const newObjectStore: ObjectStore = {
      deleted: false,
      modifiedName: undefined,
      originalName: name,
      modifiedData: undefined,
      originalData: new BTree([], compareKeys),
      modifiedKeyGenerator: undefined,
      originalKeyGenerator: 1,
      committedIndexes: {},
      modifiedIndexes: {},
    };
    const schema = myConn.modifiedSchema;
    if (!schema) {
      throw Error("no schema for versionchange tx");
    }
    schema.objectStores[name] = {
      autoIncrement,
      keyPath,
      indexes: {},
    };
    myConn.objectStoreMap[name] = { store: newObjectStore, indexMap: {} };
  }

  createIndex(
    btx: DatabaseTransaction,
    indexName: string,
    objectStoreName: string,
    keyPath: string[],
    multiEntry: boolean,
    unique: boolean,
  ): void {
    if (this.enableTracing) {
      console.log(`TRACING: createIndex(${indexName})`);
    }
    const myConn = this.requireConnectionFromTransaction(btx);
    const db = this.databases[myConn.dbName];
    if (!db) {
      throw Error("db not found");
    }
    if (db.txLevel < TransactionLevel.VersionChange) {
      throw Error("only allowed in versionchange transaction");
    }
    const indexProperties: IndexProperties = {
      keyPath,
      multiEntry,
      unique,
    };
    const newIndex: Index = {
      deleted: false,
      modifiedData: undefined,
      modifiedName: undefined,
      originalData: new BTree([], compareKeys),
      originalName: indexName,
    };
    myConn.objectStoreMap[objectStoreName].indexMap[indexName] = newIndex;
    const schema = myConn.modifiedSchema;
    if (!schema) {
      throw Error("no schema in versionchange tx");
    }
    const objectStoreProperties = schema.objectStores[objectStoreName];
    if (!objectStoreProperties) {
      throw Error("object store not found");
    }
    objectStoreProperties.indexes[indexName] = indexProperties;

    const objectStoreMapEntry = myConn.objectStoreMap[objectStoreName];
    if (!objectStoreMapEntry) {
      throw Error("object store does not exist");
    }

    const storeData =
      objectStoreMapEntry.store.modifiedData ||
      objectStoreMapEntry.store.originalData;

    storeData.forEach((v, k) => {
      try {
        this.insertIntoIndex(newIndex, k, v.value, indexProperties);
      } catch (e) {
        if (e instanceof DataError) {
          // We don't propagate this error here.
          return;
        }
        throw e;
      }
    });
  }

  async clearObjectStore(
    btx: DatabaseTransaction,
    objectStoreName: string,
  ): Promise<void> {
    const myConn = this.requireConnectionFromTransaction(btx);
    const db = this.databases[myConn.dbName];
    if (!db) {
      throw Error("db not found");
    }
    if (db.txLevel < TransactionLevel.Write) {
      throw Error("only allowed in write transaction");
    }
    if (
      db.txRestrictObjectStores &&
      !db.txRestrictObjectStores.includes(objectStoreName)
    ) {
      throw Error(
        `Not allowed to access store '${objectStoreName}', transaction is over ${JSON.stringify(
          db.txRestrictObjectStores,
        )}`,
      );
    }

    const schema = myConn.modifiedSchema;
    const objectStoreMapEntry = myConn.objectStoreMap[objectStoreName];

    objectStoreMapEntry.store.modifiedData = new BTree([], compareKeys);

    for (const indexName of Object.keys(
      schema.objectStores[objectStoreName].indexes,
    )) {
      const index = myConn.objectStoreMap[objectStoreName].indexMap[indexName];
      if (!index) {
        throw Error("index referenced by object store does not exist");
      }
      index.modifiedData = new BTree([], compareKeys);
    }
  }

  async deleteRecord(
    btx: DatabaseTransaction,
    objectStoreName: string,
    range: IDBKeyRange,
  ): Promise<void> {
    if (this.enableTracing) {
      console.log(`TRACING: deleteRecord from store ${objectStoreName}`);
    }
    const myConn = this.requireConnectionFromTransaction(btx);
    const db = this.databases[myConn.dbName];
    if (!db) {
      throw Error("db not found");
    }
    if (db.txLevel < TransactionLevel.Write) {
      throw Error("only allowed in write transaction");
    }
    if (
      db.txRestrictObjectStores &&
      !db.txRestrictObjectStores.includes(objectStoreName)
    ) {
      throw Error(
        `Not allowed to access store '${objectStoreName}', transaction is over ${JSON.stringify(
          db.txRestrictObjectStores,
        )}`,
      );
    }
    if (typeof range !== "object") {
      throw Error("deleteRecord got invalid range (must be object)");
    }
    if (!("lowerOpen" in range)) {
      throw Error(
        "deleteRecord got invalid range (sanity check failed, 'lowerOpen' missing)",
      );
    }

    const schema = myConn.modifiedSchema;
    const objectStoreMapEntry = myConn.objectStoreMap[objectStoreName];

    if (!objectStoreMapEntry.store.modifiedData) {
      objectStoreMapEntry.store.modifiedData =
        objectStoreMapEntry.store.originalData;
    }

    let modifiedData = objectStoreMapEntry.store.modifiedData;
    let currKey: Key | undefined;

    if (range.lower === undefined || range.lower === null) {
      currKey = modifiedData.minKey();
    } else {
      currKey = range.lower;
      // We have a range with an lowerOpen lower bound, so don't start
      // deleting the lower bound.  Instead start with the next higher key.
      if (range.lowerOpen && currKey !== undefined) {
        currKey = modifiedData.nextHigherKey(currKey);
      }
    }

    if (currKey === undefined) {
      throw Error("invariant violated");
    }

    // make sure that currKey is either undefined or pointing to an
    // existing object.
    let firstValue = modifiedData.get(currKey);
    if (!firstValue) {
      if (currKey !== undefined) {
        currKey = modifiedData.nextHigherKey(currKey);
      }
    }

    // loop invariant: (currKey is undefined) or (currKey is a valid key)
    while (true) {
      if (currKey === undefined) {
        // nothing more to delete!
        break;
      }
      if (range.upper !== null && range.upper !== undefined) {
        if (range.upperOpen && compareKeys(currKey, range.upper) === 0) {
          // We have a range that's upperOpen, so stop before we delete the upper bound.
          break;
        }
        if (!range.upperOpen && compareKeys(currKey, range.upper) > 0) {
          // The upper range is inclusive, only stop if we're after the upper range.
          break;
        }
      }

      const storeEntry = modifiedData.get(currKey);
      if (!storeEntry) {
        throw Error("assertion failed");
      }

      for (const indexName of Object.keys(
        schema.objectStores[objectStoreName].indexes,
      )) {
        const index =
          myConn.objectStoreMap[objectStoreName].indexMap[indexName];
        if (!index) {
          throw Error("index referenced by object store does not exist");
        }
        this.enableTracing &&
          console.log(
            `deleting from index ${indexName} for object store ${objectStoreName}`,
          );
        const indexProperties =
          schema.objectStores[objectStoreName].indexes[indexName];
        this.deleteFromIndex(
          index,
          storeEntry.primaryKey,
          storeEntry.value,
          indexProperties,
        );
      }

      modifiedData = modifiedData.without(currKey);

      currKey = modifiedData.nextHigherKey(currKey);
    }

    objectStoreMapEntry.store.modifiedData = modifiedData;
  }

  private deleteFromIndex(
    index: Index,
    primaryKey: Key,
    value: Value,
    indexProperties: IndexProperties,
  ): void {
    if (this.enableTracing) {
      console.log(
        `deleteFromIndex(${index.modifiedName || index.originalName})`,
      );
    }
    if (value === undefined || value === null) {
      throw Error("cannot delete null/undefined value from index");
    }
    let indexData = index.modifiedData || index.originalData;
    const indexKeys = getIndexKeys(
      value,
      indexProperties.keyPath,
      indexProperties.multiEntry,
    );
    for (const indexKey of indexKeys) {
      const existingRecord = indexData.get(indexKey);
      if (!existingRecord) {
        throw Error("db inconsistent: expected index entry missing");
      }
      const newPrimaryKeys = existingRecord.primaryKeys.filter(
        (x) => compareKeys(x, primaryKey) !== 0,
      );
      if (newPrimaryKeys.length === 0) {
        index.modifiedData = indexData.without(indexKey);
      } else {
        const newIndexRecord = {
          indexKey,
          primaryKeys: newPrimaryKeys,
        };
        index.modifiedData = indexData.with(indexKey, newIndexRecord, true);
      }
    }
  }

  async getRecords(
    btx: DatabaseTransaction,
    req: RecordGetRequest,
  ): Promise<RecordGetResponse> {
    if (this.enableTracing) {
      console.log(`TRACING: getRecords`);
      console.log("query", req);
    }
    const myConn = this.requireConnectionFromTransaction(btx);
    const db = this.databases[myConn.dbName];
    if (!db) {
      throw Error("db not found");
    }
    if (db.txLevel < TransactionLevel.Read) {
      throw Error("only allowed while running a transaction");
    }
    if (
      db.txRestrictObjectStores &&
      !db.txRestrictObjectStores.includes(req.objectStoreName)
    ) {
      throw Error(
        `Not allowed to access store '${
          req.objectStoreName
        }', transaction is over ${JSON.stringify(db.txRestrictObjectStores)}`,
      );
    }
    const objectStoreMapEntry = myConn.objectStoreMap[req.objectStoreName];
    if (!objectStoreMapEntry) {
      throw Error("object store not found");
    }

    let range;
    if (req.range == null || req.range === undefined) {
      range = new BridgeIDBKeyRange(undefined, undefined, true, true);
    } else {
      range = req.range;
    }

    if (typeof range !== "object") {
      throw Error(
        "getRecords was given an invalid range (sanity check failed, not an object)",
      );
    }

    if (!("lowerOpen" in range)) {
      throw Error(
        "getRecords was given an invalid range (sanity check failed, lowerOpen missing)",
      );
    }

    let numResults = 0;
    let indexKeys: Key[] = [];
    let primaryKeys: Key[] = [];
    let values: Value[] = [];

    const forward: boolean =
      req.direction === "next" || req.direction === "nextunique";
    const unique: boolean =
      req.direction === "prevunique" || req.direction === "nextunique";

    const storeData =
      objectStoreMapEntry.store.modifiedData ||
      objectStoreMapEntry.store.originalData;

    const haveIndex = req.indexName !== undefined;

    if (haveIndex) {
      const index =
        myConn.objectStoreMap[req.objectStoreName].indexMap[req.indexName!];
      const indexData = index.modifiedData || index.originalData;
      let indexPos = req.lastIndexPosition;

      if (indexPos === undefined) {
        // First time we iterate!  So start at the beginning (lower/upper)
        // of our allowed range.
        indexPos = forward ? range.lower : range.upper;
      }

      let primaryPos = req.lastObjectStorePosition;

      // We might have to advance the index key further!
      if (req.advanceIndexKey !== undefined) {
        const compareResult = compareKeys(req.advanceIndexKey, indexPos);
        if ((forward && compareResult > 0) || (!forward && compareResult > 0)) {
          indexPos = req.advanceIndexKey;
        } else if (compareResult == 0 && req.advancePrimaryKey !== undefined) {
          // index keys are the same, so advance the primary key
          if (primaryPos === undefined) {
            primaryPos = req.advancePrimaryKey;
          } else {
            const primCompareResult = compareKeys(
              req.advancePrimaryKey,
              primaryPos,
            );
            if (
              (forward && primCompareResult > 0) ||
              (!forward && primCompareResult < 0)
            ) {
              primaryPos = req.advancePrimaryKey;
            }
          }
        }
      }

      if (indexPos === undefined || indexPos === null) {
        indexPos = forward ? indexData.minKey() : indexData.maxKey();
      }

      if (indexPos === undefined) {
        throw Error("invariant violated");
      }

      let indexEntry: IndexRecord | undefined;
      indexEntry = indexData.get(indexPos);
      if (!indexEntry) {
        const res = forward
          ? indexData.nextHigherPair(indexPos)
          : indexData.nextLowerPair(indexPos);
        if (res) {
          indexEntry = res[1];
          indexPos = indexEntry.indexKey;
        }
      }

      if (unique) {
        while (1) {
          if (req.limit != 0 && numResults == req.limit) {
            break;
          }
          if (indexPos === undefined) {
            break;
          }
          if (!range.includes(indexPos)) {
            break;
          }
          if (indexEntry === undefined) {
            break;
          }

          if (
            req.lastIndexPosition === null ||
            req.lastIndexPosition === undefined ||
            compareKeys(indexEntry.indexKey, req.lastIndexPosition) !== 0
          ) {
            indexKeys.push(indexEntry.indexKey);
            primaryKeys.push(indexEntry.primaryKeys[0]);
            numResults++;
          }

          const res: any = forward
            ? indexData.nextHigherPair(indexPos)
            : indexData.nextLowerPair(indexPos);
          if (res) {
            indexPos = res[1].indexKey;
            indexEntry = res[1] as IndexRecord;
          } else {
            break;
          }
        }
      } else {
        let primkeySubPos = 0;

        // Sort out the case where the index key is the same, so we have
        // to get the prev/next primary key
        if (
          indexEntry !== undefined &&
          req.lastIndexPosition !== undefined &&
          compareKeys(indexEntry.indexKey, req.lastIndexPosition) === 0
        ) {
          let pos = forward ? 0 : indexEntry.primaryKeys.length - 1;
          this.enableTracing &&
            console.log(
              "number of primary keys",
              indexEntry.primaryKeys.length,
            );
          this.enableTracing && console.log("start pos is", pos);
          // Advance past the lastObjectStorePosition
          do {
            const cmpResult = compareKeys(
              req.lastObjectStorePosition,
              indexEntry.primaryKeys[pos],
            );
            this.enableTracing && console.log("cmp result is", cmpResult);
            if ((forward && cmpResult < 0) || (!forward && cmpResult > 0)) {
              break;
            }
            pos += forward ? 1 : -1;
            this.enableTracing && console.log("now pos is", pos);
          } while (pos >= 0 && pos < indexEntry.primaryKeys.length);

          // Make sure we're at least at advancedPrimaryPos
          while (
            primaryPos !== undefined &&
            pos >= 0 &&
            pos < indexEntry.primaryKeys.length
          ) {
            const cmpResult = compareKeys(
              primaryPos,
              indexEntry.primaryKeys[pos],
            );
            if ((forward && cmpResult <= 0) || (!forward && cmpResult >= 0)) {
              break;
            }
            pos += forward ? 1 : -1;
          }
          primkeySubPos = pos;
        } else if (indexEntry !== undefined) {
          primkeySubPos = forward ? 0 : indexEntry.primaryKeys.length - 1;
        }

        if (this.enableTracing) {
          console.log("subPos=", primkeySubPos);
          console.log("indexPos=", indexPos);
        }

        while (1) {
          if (req.limit != 0 && numResults == req.limit) {
            break;
          }
          if (indexPos === undefined) {
            break;
          }
          if (!range.includes(indexPos)) {
            break;
          }
          if (indexEntry === undefined) {
            break;
          }
          if (
            primkeySubPos < 0 ||
            primkeySubPos >= indexEntry.primaryKeys.length
          ) {
            const res: any = forward
              ? indexData.nextHigherPair(indexPos)
              : indexData.nextLowerPair(indexPos);
            if (res) {
              indexPos = res[1].indexKey;
              indexEntry = res[1];
              primkeySubPos = forward ? 0 : indexEntry!.primaryKeys.length - 1;
              continue;
            } else {
              break;
            }
          }
          indexKeys.push(indexEntry.indexKey);
          primaryKeys.push(indexEntry.primaryKeys[primkeySubPos]);
          numResults++;
          primkeySubPos += forward ? 1 : -1;
        }
      }

      // Now we can collect the values based on the primary keys,
      // if requested.
      if (req.resultLevel === ResultLevel.Full) {
        for (let i = 0; i < numResults; i++) {
          const result = storeData.get(primaryKeys[i]);
          if (!result) {
            console.error("invariant violated during read");
            console.error("request was", req);
            throw Error("invariant violated during read");
          }
          values.push(result.value);
        }
      }
    } else {
      // only based on object store, no index involved, phew!
      let storePos = req.lastObjectStorePosition;
      if (storePos === undefined) {
        storePos = forward ? range.lower : range.upper;
      }

      if (req.advanceIndexKey !== undefined) {
        throw Error("unsupported request");
      }

      storePos = furthestKey(forward, req.advancePrimaryKey, storePos);

      if (storePos !== null && storePos !== undefined) {
        // Advance store position if we are either still at the last returned
        // store key, or if we are currently not on a key.
        const storeEntry = storeData.get(storePos);
        if (this.enableTracing) {
          console.log("store entry:", storeEntry);
        }
        if (
          !storeEntry ||
          (req.lastObjectStorePosition !== undefined &&
            compareKeys(req.lastObjectStorePosition, storePos) === 0)
        ) {
          storePos = storeData.nextHigherKey(storePos);
        }
      } else {
        storePos = forward ? storeData.minKey() : storeData.maxKey();
        if (this.enableTracing) {
          console.log("setting starting store pos to", storePos);
        }
      }

      while (1) {
        if (req.limit != 0 && numResults == req.limit) {
          break;
        }
        if (storePos === null || storePos === undefined) {
          break;
        }
        if (!range.includes(storePos)) {
          break;
        }

        const res = storeData.get(storePos);

        if (res === undefined) {
          break;
        }

        if (req.resultLevel >= ResultLevel.OnlyKeys) {
          primaryKeys.push(structuredClone(storePos));
        }

        if (req.resultLevel >= ResultLevel.Full) {
          values.push(structuredClone(res.value));
        }

        numResults++;
        storePos = nextStoreKey(forward, storeData, storePos);
      }
    }
    if (this.enableTracing) {
      console.log(`TRACING: getRecords got ${numResults} results`);
    }
    return {
      count: numResults,
      indexKeys:
        req.resultLevel >= ResultLevel.OnlyKeys && haveIndex
          ? indexKeys
          : undefined,
      primaryKeys:
        req.resultLevel >= ResultLevel.OnlyKeys ? primaryKeys : undefined,
      values: req.resultLevel >= ResultLevel.Full ? values : undefined,
    };
  }

  async storeRecord(
    btx: DatabaseTransaction,
    storeReq: RecordStoreRequest,
  ): Promise<RecordStoreResponse> {
    if (this.enableTracing) {
      console.log(`TRACING: storeRecord`);
    }
    const myConn = this.requireConnectionFromTransaction(btx);
    const db = this.databases[myConn.dbName];
    if (!db) {
      throw Error("db not found");
    }
    if (db.txLevel < TransactionLevel.Write) {
      throw Error("store operation only allowed while running a transaction");
    }
    if (
      db.txRestrictObjectStores &&
      !db.txRestrictObjectStores.includes(storeReq.objectStoreName)
    ) {
      throw Error(
        `Not allowed to access store '${
          storeReq.objectStoreName
        }', transaction is over ${JSON.stringify(db.txRestrictObjectStores)}`,
      );
    }
    const schema = myConn.modifiedSchema;
    const objectStoreMapEntry = myConn.objectStoreMap[storeReq.objectStoreName];

    if (!objectStoreMapEntry.store.modifiedData) {
      objectStoreMapEntry.store.modifiedData =
        objectStoreMapEntry.store.originalData;
    }
    const modifiedData = objectStoreMapEntry.store.modifiedData;

    let key;
    let value;

    if (storeReq.storeLevel === StoreLevel.UpdateExisting) {
      if (storeReq.key === null || storeReq.key === undefined) {
        throw Error("invalid update request (key not given)");
      }

      if (!objectStoreMapEntry.store.modifiedData.has(storeReq.key)) {
        throw Error("invalid update request (record does not exist)");
      }
      key = storeReq.key;
      value = storeReq.value;
    } else {
      const keygen =
        objectStoreMapEntry.store.modifiedKeyGenerator ||
        objectStoreMapEntry.store.originalKeyGenerator;
      const autoIncrement =
        schema.objectStores[storeReq.objectStoreName].autoIncrement;
      const keyPath = schema.objectStores[storeReq.objectStoreName].keyPath;

      if (
        keyPath !== null &&
        keyPath !== undefined &&
        storeReq.key !== undefined
      ) {
        // If in-line keys are used, a key can't be explicitly specified.
        throw new DataError();
      }

      let storeKeyResult: StoreKeyResult;
      try {
        storeKeyResult = makeStoreKeyValue(
          storeReq.value,
          storeReq.key,
          keygen,
          autoIncrement,
          keyPath,
        );
      } catch (e) {
        if (e instanceof DataError) {
          const kp = JSON.stringify(keyPath);
          const n = storeReq.objectStoreName;
          const m = `Could not extract key from value, objectStore=${n}, keyPath=${kp}, value=${JSON.stringify(
            storeReq.value,
          )}`;
          if (this.enableTracing) {
            console.error(e);
            console.error("value was:", storeReq.value);
            console.error("key was:", storeReq.key);
          }
          throw new DataError(m);
        } else {
          throw e;
        }
      }
      key = storeKeyResult.key;
      value = storeKeyResult.value;
      objectStoreMapEntry.store.modifiedKeyGenerator =
        storeKeyResult.updatedKeyGenerator;
      const hasKey = modifiedData.has(key);

      if (hasKey && storeReq.storeLevel !== StoreLevel.AllowOverwrite) {
        throw new ConstraintError("refusing to overwrite");
      }
    }

    const objectStoreRecord: ObjectStoreRecord = {
      // FIXME: We should serialize the key here, not just clone it.
      primaryKey: structuredClone(key),
      value: structuredClone(value),
    };

    objectStoreMapEntry.store.modifiedData = modifiedData.with(
      key,
      objectStoreRecord,
      true,
    );

    for (const indexName of Object.keys(
      schema.objectStores[storeReq.objectStoreName].indexes,
    )) {
      const index =
        myConn.objectStoreMap[storeReq.objectStoreName].indexMap[indexName];
      if (!index) {
        throw Error("index referenced by object store does not exist");
      }
      const indexProperties =
        schema.objectStores[storeReq.objectStoreName].indexes[indexName];
      try {
        this.insertIntoIndex(index, key, value, indexProperties);
      } catch (e) {
        if (e instanceof DataError) {
          // https://www.w3.org/TR/IndexedDB-2/#object-store-storage-operation
          // Do nothing
        } else {
          throw e;
        }
      }
    }

    return { key };
  }

  private insertIntoIndex(
    index: Index,
    primaryKey: Key,
    value: Value,
    indexProperties: IndexProperties,
  ): void {
    if (this.enableTracing) {
      console.log(
        `insertIntoIndex(${index.modifiedName || index.originalName})`,
      );
    }
    let indexData = index.modifiedData || index.originalData;
    let indexKeys;
    try {
      indexKeys = getIndexKeys(
        value,
        indexProperties.keyPath,
        indexProperties.multiEntry,
      );
    } catch (e) {
      if (e instanceof DataError) {
        const n = index.modifiedName || index.originalName;
        const p = JSON.stringify(indexProperties.keyPath);
        const m = `Failed to extract index keys from index ${n} for keyPath ${p}.`;
        if (this.enableTracing) {
          console.error(m);
          console.error("value was", value);
        }
        throw new DataError(m);
      } else {
        throw e;
      }
    }
    for (const indexKey of indexKeys) {
      const existingRecord = indexData.get(indexKey);
      if (existingRecord) {
        if (indexProperties.unique) {
          throw new ConstraintError();
        } else {
          const pred = (x: Key) => compareKeys(x, primaryKey) === 0;
          if (existingRecord.primaryKeys.findIndex(pred) === -1) {
            const newIndexRecord = {
              indexKey: indexKey,
              primaryKeys: [...existingRecord.primaryKeys, primaryKey].sort(
                compareKeys,
              ),
            };
            index.modifiedData = indexData.with(indexKey, newIndexRecord, true);
          }
        }
      } else {
        const newIndexRecord: IndexRecord = {
          indexKey: indexKey,
          primaryKeys: [primaryKey],
        };
        index.modifiedData = indexData.with(indexKey, newIndexRecord, true);
      }
    }
  }

  async rollback(btx: DatabaseTransaction): Promise<void> {
    if (this.enableTracing) {
      console.log(`TRACING: rollback`);
    }
    const myConn = this.connectionsByTransaction[btx.transactionCookie];
    if (!myConn) {
      throw Error("unknown transaction");
    }
    const db = this.databases[myConn.dbName];
    if (!db) {
      throw Error("db not found");
    }
    if (db.txLevel < TransactionLevel.Read) {
      throw Error("rollback is only allowed while running a transaction");
    }
    db.txLevel = TransactionLevel.None;
    db.txRestrictObjectStores = undefined;
    myConn.modifiedSchema = structuredClone(db.committedSchema);
    myConn.objectStoreMap = this.makeObjectStoreMap(db);
    for (const objectStoreName in db.committedObjectStores) {
      const objectStore = db.committedObjectStores[objectStoreName];
      objectStore.deleted = false;
      objectStore.modifiedData = undefined;
      objectStore.modifiedName = undefined;
      objectStore.modifiedKeyGenerator = undefined;
      objectStore.modifiedIndexes = {};

      for (const indexName of Object.keys(
        db.committedSchema.objectStores[objectStoreName].indexes,
      )) {
        const index = objectStore.committedIndexes[indexName];
        index.deleted = false;
        index.modifiedData = undefined;
        index.modifiedName = undefined;
      }
    }
    delete this.connectionsByTransaction[btx.transactionCookie];
    this.transactionDoneCond.trigger();
  }

  async commit(btx: DatabaseTransaction): Promise<void> {
    if (this.enableTracing) {
      console.log(`TRACING: commit`);
    }
    const myConn = this.requireConnectionFromTransaction(btx);
    const db = this.databases[myConn.dbName];
    if (!db) {
      throw Error("db not found");
    }
    const txLevel = db.txLevel;
    if (txLevel < TransactionLevel.Read) {
      throw Error("only allowed while running a transaction");
    }

    db.committedSchema = structuredClone(myConn.modifiedSchema);
    db.txLevel = TransactionLevel.None;
    db.txRestrictObjectStores = undefined;

    db.committedObjectStores = {};
    db.committedObjectStores = {};

    for (const objectStoreName in myConn.objectStoreMap) {
      const objectStoreMapEntry = myConn.objectStoreMap[objectStoreName];
      const store = objectStoreMapEntry.store;
      store.deleted = false;
      store.originalData = store.modifiedData || store.originalData;
      store.originalName = store.modifiedName || store.originalName;
      store.modifiedIndexes = {};
      if (store.modifiedKeyGenerator !== undefined) {
        store.originalKeyGenerator = store.modifiedKeyGenerator;
      }
      db.committedObjectStores[objectStoreName] = store;

      for (const indexName in objectStoreMapEntry.indexMap) {
        const index = objectStoreMapEntry.indexMap[indexName];
        index.deleted = false;
        index.originalData = index.modifiedData || index.originalData;
        index.originalName = index.modifiedName || index.originalName;
        store.committedIndexes[indexName] = index;
      }
    }

    myConn.objectStoreMap = this.makeObjectStoreMap(db);

    delete this.connectionsByTransaction[btx.transactionCookie];
    this.transactionDoneCond.trigger();

    if (this.afterCommitCallback && txLevel >= TransactionLevel.Write) {
      await this.afterCommitCallback();
    }
  }
}
