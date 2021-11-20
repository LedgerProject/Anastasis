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

import { BridgeIDBDatabaseInfo, BridgeIDBKeyRange } from "./bridge-idb";
import {
  IDBCursorDirection,
  IDBTransactionMode,
  IDBValidKey,
} from "./idbtypes";

/** @public */
export interface ObjectStoreProperties {
  keyPath: string[] | null;
  autoIncrement: boolean;
  indexes: { [nameame: string]: IndexProperties };
}

/** @public */
export interface IndexProperties {
  keyPath: string[];
  multiEntry: boolean;
  unique: boolean;
}

/** @public */
export interface Schema {
  databaseName: string;
  databaseVersion: number;
  objectStores: { [name: string]: ObjectStoreProperties };
}

/** @public */
export interface DatabaseConnection {
  connectionCookie: string;
}

/** @public */
export interface DatabaseTransaction {
  transactionCookie: string;
}

/** @public */
export enum ResultLevel {
  OnlyCount,
  OnlyKeys,
  Full,
}

/** @public */
export enum StoreLevel {
  NoOverwrite,
  AllowOverwrite,
  UpdateExisting,
}

/** @public */
export interface RecordGetRequest {
  direction: IDBCursorDirection;
  objectStoreName: string;
  indexName: string | undefined;
  /**
   * The range of keys to return.
   * If indexName is defined, the range refers to the index keys.
   * Otherwise it refers to the object store keys.
   */
  range: BridgeIDBKeyRange | undefined | null;
  /**
   * Last cursor position in terms of the index key.
   * Can only be specified if indexName is defined and
   * lastObjectStorePosition is defined.
   *
   * Must either be undefined or within range.
   */
  lastIndexPosition?: IDBValidKey;
  /**
   * Last position in terms of the object store key.
   */
  lastObjectStorePosition?: IDBValidKey;
  /**
   * If specified, the index key of the results must be
   * greater or equal to advanceIndexKey.
   *
   * Only applicable if indexName is specified.
   */
  advanceIndexKey?: IDBValidKey;
  /**
   * If specified, the primary key of the results must be greater
   * or equal to advancePrimaryKey.
   */
  advancePrimaryKey?: IDBValidKey;
  /**
   * Maximum number of results to return.
   * If -1, return all available results
   */
  limit: number;
  resultLevel: ResultLevel;
}

/** @public */
export interface RecordGetResponse {
  values: any[] | undefined;
  indexKeys: IDBValidKey[] | undefined;
  primaryKeys: IDBValidKey[] | undefined;
  count: number;
}

/** @public */
export interface RecordStoreRequest {
  objectStoreName: string;
  value: any;
  key: IDBValidKey | undefined;
  storeLevel: StoreLevel;
}

/** @public */
export interface RecordStoreResponse {
  /**
   * Key that the record was stored under in the object store.
   */
  key: IDBValidKey;
}

/** @public */
export interface Backend {
  getDatabases(): Promise<BridgeIDBDatabaseInfo[]>;

  connectDatabase(name: string): Promise<DatabaseConnection>;

  beginTransaction(
    conn: DatabaseConnection,
    objectStores: string[],
    mode: IDBTransactionMode,
  ): Promise<DatabaseTransaction>;

  enterVersionChange(
    conn: DatabaseConnection,
    newVersion: number,
  ): Promise<DatabaseTransaction>;

  deleteDatabase(name: string): Promise<void>;

  close(db: DatabaseConnection): Promise<void>;

  getSchema(db: DatabaseConnection): Schema;

  getCurrentTransactionSchema(btx: DatabaseTransaction): Schema;

  getInitialTransactionSchema(btx: DatabaseTransaction): Schema;

  renameIndex(
    btx: DatabaseTransaction,
    objectStoreName: string,
    oldName: string,
    newName: string,
  ): void;

  deleteIndex(
    btx: DatabaseTransaction,
    objectStoreName: string,
    indexName: string,
  ): void;

  rollback(btx: DatabaseTransaction): Promise<void>;

  commit(btx: DatabaseTransaction): Promise<void>;

  deleteObjectStore(btx: DatabaseTransaction, name: string): void;

  createObjectStore(
    btx: DatabaseTransaction,
    name: string,
    keyPath: string | string[] | null,
    autoIncrement: boolean,
  ): void;

  renameObjectStore(
    btx: DatabaseTransaction,
    oldName: string,
    newName: string,
  ): void;

  createIndex(
    btx: DatabaseTransaction,
    indexName: string,
    objectStoreName: string,
    keyPath: string | string[],
    multiEntry: boolean,
    unique: boolean,
  ): void;

  deleteRecord(
    btx: DatabaseTransaction,
    objectStoreName: string,
    range: BridgeIDBKeyRange,
  ): Promise<void>;

  getRecords(
    btx: DatabaseTransaction,
    req: RecordGetRequest,
  ): Promise<RecordGetResponse>;

  storeRecord(
    btx: DatabaseTransaction,
    storeReq: RecordStoreRequest,
  ): Promise<RecordStoreResponse>;

  clearObjectStore(
    btx: DatabaseTransaction,
    objectStoreName: string,
  ): Promise<void>;
}
