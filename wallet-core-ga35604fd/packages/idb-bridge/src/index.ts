import {
  DatabaseTransaction,
  RecordGetResponse,
  RecordGetRequest,
  Schema,
  Backend,
  RecordStoreRequest,
  RecordStoreResponse,
  DatabaseConnection,
  ObjectStoreProperties,
  StoreLevel,
  ResultLevel,
  IndexProperties,
} from "./backend-interface";
import { Listener } from "./util/FakeEventTarget";
import {
  DatabaseDump,
  ObjectStoreDump,
  IndexDump,
  IndexRecord,
  ObjectStoreRecord,
  MemoryBackendDump,
} from "./MemoryBackend";
import { Event } from "./idbtypes";
import {
  BridgeIDBCursor,
  BridgeIDBDatabase,
  BridgeIDBFactory,
  BridgeIDBIndex,
  BridgeIDBKeyRange,
  BridgeIDBObjectStore,
  BridgeIDBOpenDBRequest,
  BridgeIDBRequest,
  BridgeIDBTransaction,
  BridgeIDBVersionChangeEvent,
  DatabaseList,
  RequestObj,
} from "./bridge-idb";

export {
  BridgeIDBCursor,
  BridgeIDBDatabase,
  BridgeIDBFactory,
  BridgeIDBIndex,
  BridgeIDBKeyRange,
  BridgeIDBObjectStore,
  BridgeIDBOpenDBRequest,
  BridgeIDBRequest,
  BridgeIDBTransaction,
  StoreLevel,
  ResultLevel,
};
export type {
  DatabaseTransaction,
  RecordGetRequest,
  RecordGetResponse,
  Schema,
  Backend,
  DatabaseList,
  RecordStoreRequest,
  RecordStoreResponse,
  DatabaseConnection,
  ObjectStoreProperties,
  RequestObj,
  DatabaseDump,
  ObjectStoreDump,
  IndexDump,
  IndexRecord,
  ObjectStoreRecord,
  IndexProperties,
  MemoryBackendDump,
  Event,
  Listener,
};

export { MemoryBackend } from "./MemoryBackend";

// globalThis polyfill, see https://mathiasbynens.be/notes/globalthis
(function () {
  if (typeof globalThis === "object") return;
  Object.defineProperty(Object.prototype, "__magic__", {
    get: function () {
      return this;
    },
    configurable: true, // This makes it possible to `delete` the getter later.
  });
  // @ts-ignore: polyfill magic
  __magic__.globalThis = __magic__; // lolwat
  // @ts-ignore: polyfill magic
  delete Object.prototype.__magic__;
})();

/**
 * Populate the global name space such that the given IndexedDB factory is made
 * available globally.
 *
 * @public
 */
export function shimIndexedDB(factory: BridgeIDBFactory): void {
  // @ts-ignore: shimming
  const g = globalThis as any;

  g.indexedDB = factory;
  g.IDBCursor = BridgeIDBCursor;
  g.IDBKeyRange = BridgeIDBKeyRange;
  g.IDBDatabase = BridgeIDBDatabase;
  g.IDBFactory = BridgeIDBFactory;
  g.IDBIndex = BridgeIDBIndex;
  g.IDBKeyRange = BridgeIDBKeyRange;
  g.IDBObjectStore = BridgeIDBObjectStore;
  g.IDBOpenDBRequest = BridgeIDBOpenDBRequest;
  g.IDBRequest = BridgeIDBRequest;
  g.IDBTransaction = BridgeIDBTransaction;
  g.IDBVersionChangeEvent = BridgeIDBVersionChangeEvent;
}

export * from "./idbtypes";

export * from "./util/structuredClone";
