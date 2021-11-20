import test from "ava";
import { BridgeIDBKeyRange, BridgeIDBRequest } from "..";
import { IDBDatabase } from "../idbtypes";
import { createdb } from "./wptsupport";

// IDBIndex.get() - returns the record
test("WPT idbindex_get.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any, index: any;
    const record = { key: 1, indexedProperty: "data" };

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;
      var objStore = db.createObjectStore("store", { keyPath: "key" });
      index = objStore.createIndex("index", "indexedProperty");

      objStore.add(record);
    };

    open_rq.onsuccess = function (e: any) {
      var rq = db
        .transaction("store")
        .objectStore("store")
        .index("index")
        .get(record.indexedProperty);

      rq.onsuccess = function (e: any) {
        t.deepEqual(e.target.result.key, record.key);
        resolve();
      };
    };
  });
  t.pass();
});

// IDBIndex.get() - returns the record where the index contains duplicate values
test("WPT idbindex_get2.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;
    const records = [
      { key: 1, indexedProperty: "data" },
      { key: 2, indexedProperty: "data" },
      { key: 3, indexedProperty: "data" },
    ];

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;
      var objStore = db.createObjectStore("test", { keyPath: "key" });
      objStore.createIndex("index", "indexedProperty");

      for (var i = 0; i < records.length; i++) objStore.add(records[i]);
    };

    open_rq.onsuccess = function (e: any) {
      var rq = db
        .transaction("test")
        .objectStore("test")
        .index("index")
        .get("data");

      rq.onsuccess = function (e: any) {
        t.deepEqual(e.target.result.key, records[0].key);
        resolve();
      };
    };
  });
  t.pass();
});

// IDBIndex.get() - attempt to retrieve a record that doesn't exist
test("WPT idbindex_get3.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;
    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;
      var rq = db
        .createObjectStore("test", { keyPath: "key" })
        .createIndex("index", "indexedProperty")
        .get(1);

      rq.onsuccess = function (e: any) {
        t.deepEqual(e.target.result, undefined);
        resolve();
      };
    };
  });
  t.pass();
});

// IDBIndex.get() - returns the record with the first key in the range
test("WPT idbindex_get4.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;

    var open_rq = createdb(t);

    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;
      var store = db.createObjectStore("store", { keyPath: "key" });
      store.createIndex("index", "indexedProperty");

      for (var i = 0; i < 10; i++) {
        store.add({ key: i, indexedProperty: "data" + i });
      }
    };

    open_rq.onsuccess = function (e: any) {
      var rq = db
        .transaction("store")
        .objectStore("store")
        .index("index")
        .get(BridgeIDBKeyRange.bound("data4", "data7"));

      rq.onsuccess = function (e: any) {
        t.deepEqual(e.target.result.key, 4);
        t.deepEqual(e.target.result.indexedProperty, "data4");
        setTimeout(function () {
          resolve();
        }, 4);
      };
    };
  });
  t.pass();
});

// IDBIndex.get() - throw DataError when using invalid key
test("WPT idbindex_get5.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;

      var index = db
        .createObjectStore("test", { keyPath: "key" })
        .createIndex("index", "indexedProperty");
      t.throws(
        function () {
          index.get(NaN);
        },
        { name: "DataError" },
      );
      resolve();
    };
  });
  t.pass();
});

// IDBIndex.get() - throw InvalidStateError when the index is deleted
test("WPT idbindex_get6.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;
      var store = db.createObjectStore("store", { keyPath: "key" });
      var index = store.createIndex("index", "indexedProperty");

      store.add({ key: 1, indexedProperty: "data" });
      store.deleteIndex("index");

      t.throws(
        function () {
          index.get("data");
        },
        { name: "InvalidStateError" },
      );
      resolve();
    };
  });
  t.pass();
});

// IDBIndex.get() - throw TransactionInactiveError on aborted transaction
test("WPT idbindex_get7.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      const db = e.target.result as IDBDatabase;
      var store = db.createObjectStore("store", { keyPath: "key" });
      var index = store.createIndex("index", "indexedProperty");
      store.add({ key: 1, indexedProperty: "data" });
    };
    open_rq.onsuccess = function (e: any) {
      const db = e.target.result as IDBDatabase;
      var tx = db.transaction("store");
      var index = tx.objectStore("store").index("index");
      tx.abort();

      t.throws(
        function () {
          index.get("data");
        },
        { name: "TransactionInactiveError" },
      );
      resolve();
    };
  });
  t.pass();
});

// IDBIndex.get() - throw InvalidStateError on index deleted by aborted upgrade
test("WPT idbindex_get8.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;
      var store = db.createObjectStore("store", { keyPath: "key" });
      var index = store.createIndex("index", "indexedProperty");
      store.add({ key: 1, indexedProperty: "data" });

      e.target.transaction.abort();

      t.throws(
        function () {
          index.get("data");
        },
        { name: "InvalidStateError" },
      );
      resolve();
    };
  });
  t.pass();
});
