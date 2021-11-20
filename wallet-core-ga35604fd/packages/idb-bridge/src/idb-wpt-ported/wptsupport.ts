import test, { ExecutionContext } from "ava";
import { BridgeIDBFactory, BridgeIDBRequest } from "..";
import {
  IDBDatabase,
  IDBIndex,
  IDBObjectStore,
  IDBOpenDBRequest,
  IDBRequest,
  IDBTransaction,
  IDBTransactionMode,
} from "../idbtypes";
import { MemoryBackend } from "../MemoryBackend";
import { compareKeys } from "../util/cmp";

BridgeIDBFactory.enableTracing = true;
const backend = new MemoryBackend();
backend.enableTracing = true;
export const idbFactory = new BridgeIDBFactory(backend);

const self = {
  indexedDB: idbFactory,
};

export function createdb(
  t: ExecutionContext<unknown>,
  dbname?: string,
  version?: number,
): IDBOpenDBRequest {
  var rq_open: IDBOpenDBRequest;
  dbname = dbname ? dbname : "testdb-" + new Date().getTime() + Math.random();
  if (version) rq_open = self.indexedDB.open(dbname, version);
  else rq_open = self.indexedDB.open(dbname);
  return rq_open;
}

export function assert_key_equals(
  actual: any,
  expected: any,
  description?: string,
) {
  if (0 != compareKeys(actual, expected)) {
    throw Error("expected keys to be the same");
  }
}

function makeDatabaseName(testCase: string): string {
  return "db-" + testCase;
}

// Promise that resolves with an IDBRequest's result.
//
// The promise only resolves if IDBRequest receives the "success" event. Any
// other event causes the promise to reject with an error. This is correct in
// most cases, but insufficient for indexedDB.open(), which issues
// "upgradeneded" events under normal operation.
export function promiseForRequest<T = any>(
  t: ExecutionContext,
  request: IDBRequest<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener("success", (evt: any) => {
      resolve(evt.target.result);
    });
    request.addEventListener("blocked", (evt: any) => reject(evt.target.error));
    request.addEventListener("error", (evt: any) => reject(evt.target.error));
    request.addEventListener("upgradeneeded", (evt: any) =>
      reject(evt.target.error),
    );
  });
}

// Promise that resolves when an IDBTransaction completes.
//
// The promise resolves with undefined if IDBTransaction receives the "complete"
// event, and rejects with an error for any other event.
export function promiseForTransaction(
  t: ExecutionContext,
  request: IDBTransaction,
) {
  return new Promise<any>((resolve, reject) => {
    request.addEventListener("complete", (evt: any) => {
      resolve(evt.target.result);
    });
    request.addEventListener("abort", (evt: any) => reject(evt.target.error));
    request.addEventListener("error", (evt: any) => reject(evt.target.error));
  });
}

type MigrationCallback = (
  db: IDBDatabase,
  tx: IDBTransaction,
  req: IDBOpenDBRequest,
) => void;

export async function migrateDatabase(
  t: ExecutionContext,
  newVersion: number,
  migrationCallback: MigrationCallback,
): Promise<IDBDatabase> {
  return migrateNamedDatabase(
    t,
    makeDatabaseName(t.title),
    newVersion,
    migrationCallback,
  );
}

export async function migrateNamedDatabase(
  t: ExecutionContext,
  databaseName: string,
  newVersion: number,
  migrationCallback: MigrationCallback,
): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = self.indexedDB.open(databaseName, newVersion);
    request.onupgradeneeded = (event: any) => {
      const database = event.target.result;
      const transaction = event.target.transaction;
      let shouldBeAborted = false;
      let requestEventPromise: any = null;

      // We wrap IDBTransaction.abort so we can set up the correct event
      // listeners and expectations if the test chooses to abort the
      // versionchange transaction.
      const transactionAbort = transaction.abort.bind(transaction);
      transaction.abort = () => {
        transaction._willBeAborted();
        transactionAbort();
      };
      transaction._willBeAborted = () => {
        requestEventPromise = new Promise((resolve, reject) => {
          request.onerror = (event: any) => {
            event.preventDefault();
            resolve(event.target.error);
          };
          request.onsuccess = () =>
            reject(
              new Error(
                "indexedDB.open should not succeed for an aborted " +
                  "versionchange transaction",
              ),
            );
        });
        shouldBeAborted = true;
      };

      // If migration callback returns a promise, we'll wait for it to resolve.
      // This simplifies some tests.
      const callbackResult = migrationCallback(database, transaction, request);
      if (!shouldBeAborted) {
        request.onerror = null;
        request.onsuccess = null;
        requestEventPromise = promiseForRequest(t, request);
      }

      // requestEventPromise needs to be the last promise in the chain, because
      // we want the event that it resolves to.
      resolve(Promise.resolve(callbackResult).then(() => requestEventPromise));
    };
    request.onerror = (event: any) => reject(event.target.error);
    request.onsuccess = () => {
      const database = request.result;
      t.teardown(() => database.close());
      reject(
        new Error(
          "indexedDB.open should not succeed without creating a " +
            "versionchange transaction",
        ),
      );
    };
  });
}

export async function createDatabase(
  t: ExecutionContext,
  setupCallback: MigrationCallback,
): Promise<IDBDatabase> {
  const databaseName = makeDatabaseName(t.title);
  const request = self.indexedDB.deleteDatabase(databaseName);
  return migrateNamedDatabase(t, databaseName, 1, setupCallback);
}

// The data in the 'books' object store records in the first example of the
// IndexedDB specification.
const BOOKS_RECORD_DATA = [
  { title: "Quarry Memories", author: "Fred", isbn: 123456 },
  { title: "Water Buffaloes", author: "Fred", isbn: 234567 },
  { title: "Bedrock Nights", author: "Barney", isbn: 345678 },
];

// Creates a 'books' object store whose contents closely resembles the first
// example in the IndexedDB specification.
export const createBooksStore = (
  testCase: ExecutionContext,
  database: IDBDatabase,
) => {
  const store = database.createObjectStore("books", {
    keyPath: "isbn",
    autoIncrement: true,
  });
  store.createIndex("by_author", "author");
  store.createIndex("by_title", "title", { unique: true });
  for (const record of BOOKS_RECORD_DATA) store.put(record);
  return store;
};

// Verifies that an object store's contents matches the contents used to create
// the books store in the test database's version 1.
//
// The errorMessage is used if the assertions fail. It can state that the
// IndexedDB implementation being tested is incorrect, or that the testing code
// is using it incorrectly.
export async function checkStoreContents(
  testCase: ExecutionContext,
  store: IDBObjectStore,
  errorMessage: string,
) {
  const request = store.get(123456);
  const result = await promiseForRequest(testCase, request);
  testCase.deepEqual(result.isbn, BOOKS_RECORD_DATA[0].isbn, errorMessage);
  testCase.deepEqual(result.author, BOOKS_RECORD_DATA[0].author, errorMessage);
  testCase.deepEqual(result.title, BOOKS_RECORD_DATA[0].title, errorMessage);
}

// Verifies that an object store's indexes match the indexes used to create the
// books store in the test database's version 1.
//
// The errorMessage is used if the assertions fail. It can state that the
// IndexedDB implementation being tested is incorrect, or that the testing code
// is using it incorrectly.
export function checkStoreIndexes(
  testCase: ExecutionContext,
  store: IDBObjectStore,
  errorMessage: string,
) {
  testCase.deepEqual(
    store.indexNames as any,
    ["by_author", "by_title"],
    errorMessage,
  );
  const authorIndex = store.index("by_author");
  const titleIndex = store.index("by_title");
  return Promise.all([
    checkAuthorIndexContents(testCase, authorIndex, errorMessage),
    checkTitleIndexContents(testCase, titleIndex, errorMessage),
  ]);
}

// Verifies that index matches the 'by_author' index used to create the
// by_author books store in the test database's version 1.
//
// The errorMessage is used if the assertions fail. It can state that the
// IndexedDB implementation being tested is incorrect, or that the testing code
// is using it incorrectly.
async function checkAuthorIndexContents(
  testCase: ExecutionContext,
  index: IDBIndex,
  errorMessage: string,
) {
  const request = index.get(BOOKS_RECORD_DATA[2].author);
  const result = await promiseForRequest(testCase, request);
  testCase.deepEqual(result.isbn, BOOKS_RECORD_DATA[2].isbn, errorMessage);
  testCase.deepEqual(result.title, BOOKS_RECORD_DATA[2].title, errorMessage);
}

// Verifies that an index matches the 'by_title' index used to create the books
// store in the test database's version 1.
//
// The errorMessage is used if the assertions fail. It can state that the
// IndexedDB implementation being tested is incorrect, or that the testing code
// is using it incorrectly.
async function checkTitleIndexContents(
  testCase: ExecutionContext,
  index: IDBIndex,
  errorMessage: string,
) {
  const request = index.get(BOOKS_RECORD_DATA[2].title);
  const result = await promiseForRequest(testCase, request);
  testCase.deepEqual(result.isbn, BOOKS_RECORD_DATA[2].isbn, errorMessage);
  testCase.deepEqual(result.author, BOOKS_RECORD_DATA[2].author, errorMessage);
}

// Verifies that an object store's key generator is in the same state as the
// key generator created for the books store in the test database's version 1.
//
// The errorMessage is used if the assertions fail. It can state that the
// IndexedDB implementation being tested is incorrect, or that the testing code
// is using it incorrectly.
export function checkStoreGenerator(
  testCase: ExecutionContext,
  store: IDBObjectStore,
  expectedKey: any,
  errorMessage: string,
) {
  const request = store.put({
    title: "Bedrock Nights " + expectedKey,
    author: "Barney",
  });
  return promiseForRequest(testCase, request).then((result) => {
    testCase.deepEqual(result, expectedKey, errorMessage);
  });
}

// Creates a 'not_books' object store used to test renaming into existing or
// deleted store names.
export function createNotBooksStore(
  testCase: ExecutionContext,
  database: IDBDatabase,
) {
  const store = database.createObjectStore("not_books");
  store.createIndex("not_by_author", "author");
  store.createIndex("not_by_title", "title", { unique: true });
  return store;
}

/*
 * Return a string truncated to the given length, with ... added at the end
 * if it was longer.
 */
function truncate(s: string, len: number): string {
  if (s.length > len) {
    return s.substring(0, len - 3) + "...";
  }
  return s;
}

var replacements = {
  "0": "0",
  "1": "x01",
  "2": "x02",
  "3": "x03",
  "4": "x04",
  "5": "x05",
  "6": "x06",
  "7": "x07",
  "8": "b",
  "9": "t",
  "10": "n",
  "11": "v",
  "12": "f",
  "13": "r",
  "14": "x0e",
  "15": "x0f",
  "16": "x10",
  "17": "x11",
  "18": "x12",
  "19": "x13",
  "20": "x14",
  "21": "x15",
  "22": "x16",
  "23": "x17",
  "24": "x18",
  "25": "x19",
  "26": "x1a",
  "27": "x1b",
  "28": "x1c",
  "29": "x1d",
  "30": "x1e",
  "31": "x1f",
  "0xfffd": "ufffd",
  "0xfffe": "ufffe",
  "0xffff": "uffff",
};

/*
 * Convert a value to a nice, human-readable string
 */
export function format_value(val: any, seen?: any): string {
  if (!seen) {
    seen = [];
  }
  if (typeof val === "object" && val !== null) {
    if (seen.indexOf(val) >= 0) {
      return "[...]";
    }
    seen.push(val);
  }
  if (Array.isArray(val)) {
    let output = "[";
    // @ts-ignore
    if (val.beginEllipsis !== undefined) {
      output += "…, ";
    }
    output += val
      .map(function (x) {
        return format_value(x, seen);
      })
      .join(", ");
    // @ts-ignore
    if (val.endEllipsis !== undefined) {
      output += ", …";
    }
    return output + "]";
  }

  switch (typeof val) {
    case "string":
      val = val.replace(/\\/g, "\\\\");
      for (var p in replacements) {
        // @ts-ignore
        var replace = "\\" + replacements[p];
        // @ts-ignore
        val = val.replace(RegExp(String.fromCharCode(p), "g"), replace);
      }
      return '"' + val.replace(/"/g, '\\"') + '"';
    case "boolean":
    case "undefined":
      return String(val);
    case "number":
      // In JavaScript, -0 === 0 and String(-0) == "0", so we have to
      // special-case.
      if (val === -0 && 1 / val === -Infinity) {
        return "-0";
      }
      return String(val);
    case "object":
      if (val === null) {
        return "null";
      }

    /* falls through */
    default:
      try {
        return typeof val + ' "' + truncate(String(val), 1000) + '"';
      } catch (e) {
        return (
          "[stringifying object threw " +
          String(e) +
          " with type " +
          String(typeof e) +
          "]"
        );
      }
  }
}

// Usage:
//   indexeddb_test(
//     (test_object, db_connection, upgrade_tx, open_request) => {
//        // Database creation logic.
//     },
//     (test_object, db_connection, open_request) => {
//        // Test logic.
//        test_object.end();
//     },
//     'Test case description');
export function indexeddb_test(
  t: ExecutionContext,
  upgrade_func: (
    done: () => void,
    db: IDBDatabase,
    tx: IDBTransaction,
    open: IDBOpenDBRequest,
  ) => void,
  open_func: (
    done: () => void,
    db: IDBDatabase,
    open: IDBOpenDBRequest,
  ) => void,
  dbsuffix?: string,
  options?: any,
): Promise<void> {
  return new Promise((resolve, reject) => {
    options = Object.assign({ upgrade_will_abort: false }, options);
    const dbname =
      "testdb-" + new Date().getTime() + Math.random() + (dbsuffix ?? "");
    var del = self.indexedDB.deleteDatabase(dbname);
    del.onerror = () => t.fail("deleteDatabase should succeed");
    var open = self.indexedDB.open(dbname, 1);
    open.onupgradeneeded = function () {
      var db = open.result;
      t.teardown(function () {
        // If open didn't succeed already, ignore the error.
        open.onerror = function (e: any) {
          e.preventDefault();
        };
        db.close();
        self.indexedDB.deleteDatabase(db.name);
      });
      var tx = open.transaction!;
      upgrade_func(resolve, db, tx, open);
    };
    if (options.upgrade_will_abort) {
      open.onsuccess = () => t.fail("open should not succeed");
    } else {
      open.onerror = () => t.fail("open should succeed");
      open.onsuccess = function () {
        var db = open.result;
        if (open_func) open_func(resolve, db, open);
      };
    }
  });
}

/**
 * Keeps the passed transaction alive indefinitely (by making requests
 * against the named store). Returns a function that asserts that the
 * transaction has not already completed and then ends the request loop so that
 * the transaction may autocommit and complete.
 */
export function keep_alive(
  t: ExecutionContext,
  tx: IDBTransaction,
  store_name: string,
) {
  let completed = false;
  tx.addEventListener("complete", () => {
    completed = true;
  });

  let keepSpinning = true;
  let spinCount = 0;

  function spin() {
    console.log("spinning");
    if (!keepSpinning) return;
    const request = tx.objectStore(store_name).get(0);
    (request as BridgeIDBRequest)._debugName = `req-spin-${spinCount}`;
    spinCount++;
    request.onsuccess = spin;
  }
  spin();

  return () => {
    t.log("stopping spin");
    t.false(completed, "Transaction completed while kept alive");
    keepSpinning = false;
  };
}

// Checks to see if the passed transaction is active (by making
// requests against the named store).
export function is_transaction_active(
  t: ExecutionContext,
  tx: IDBTransaction,
  store_name: string,
) {
  try {
    const request = tx.objectStore(store_name).get(0);
    request.onerror = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    return true;
  } catch (ex: any) {
    console.log(ex.stack);
    t.deepEqual(
      ex.name,
      "TransactionInactiveError",
      "Active check should either not throw anything, or throw " +
        "TransactionInactiveError",
    );
    return false;
  }
}
