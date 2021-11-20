import test from "ava";
import { BridgeIDBKeyRange, BridgeIDBRequest } from "..";
import { IDBDatabase } from "../idbtypes";
import { createdb } from "./wptsupport";

// IDBObjectStore.get() - key is a number
test.cb("WPT idbobjectstore_get.htm", (t) => {
  var db: any,
    record = { key: 3.14159265, property: "data" };

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;
    db.createObjectStore("store", { keyPath: "key" }).add(record);
  };

  open_rq.onsuccess = function (e: any) {
    var rq = db.transaction("store").objectStore("store").get(record.key);

    rq.onsuccess = function (e: any) {
      t.deepEqual(e.target.result.key, record.key);
      t.deepEqual(e.target.result.property, record.property);
      t.end();
    };
  };
});

// IDBObjectStore.get() - key is a string
test.cb("WPT idbobjectstore_get2.htm", (t) => {
  var db: any,
    record = { key: "this is a key that's a string", property: "data" };

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;
    db.createObjectStore("store", { keyPath: "key" }).add(record);
  };

  open_rq.onsuccess = function (e: any) {
    var rq = db.transaction("store").objectStore("store").get(record.key);

    rq.onsuccess = function (e: any) {
      t.deepEqual(e.target.result.key, record.key);
      t.deepEqual(e.target.result.property, record.property);
      t.end();
    };
  };
});

// IDBObjectStore.get() - key is a date
test.cb("WPT idbobjectstore_get3.htm", (t) => {
  var db: any;
  const record = { key: new Date(), property: "data" };

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;
    db.createObjectStore("store", { keyPath: "key" }).add(record);
  };

  open_rq.onsuccess = function (e: any) {
    var rq = db.transaction("store").objectStore("store").get(record.key);

    rq.onsuccess = function (e: any) {
      t.deepEqual(e.target.result.key.valueOf(), record.key.valueOf());
      t.deepEqual(e.target.result.property, record.property);
      t.end();
    };
  };
});

// IDBObjectStore.get() - attempt to retrieve a record that doesn't exist
test.cb("WPT idbobjectstore_get4.htm", (t) => {
  var db: any;

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;
    var rq = db.createObjectStore("store", { keyPath: "key" }).get(1);
    rq.onsuccess = function (e: any) {
      t.deepEqual(e.target.results, undefined);
      setTimeout(function () {
        t.end();
      }, 10);
    };
  };

  open_rq.onsuccess = function () {};
});

// IDBObjectStore.get() - returns the record with the first key in the range
test.cb("WPT idbobjectstore_get5.htm", (t) => {
  var db: any;
  var open_rq = createdb(t);

  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;
    var os = db.createObjectStore("store");

    for (var i = 0; i < 10; i++) os.add("data" + i, i);
  };

  open_rq.onsuccess = function (e: any) {
    db
      .transaction("store")
      .objectStore("store")
      .get(BridgeIDBKeyRange.bound(3, 6)).onsuccess = function (e: any) {
      t.deepEqual(e.target.result, "data3", "get(3-6)");
      t.end();
    };
  };
});

// IDBObjectStore.get() - throw TransactionInactiveError on aborted transaction
test.cb("WPT idbobjectstore_get6.htm", (t) => {
  var db: any;

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;
    db.createObjectStore("store", { keyPath: "key" });
  };

  open_rq.onsuccess = function (e: any) {
    var store = db.transaction("store").objectStore("store");
    store.transaction.abort();
    t.throws(
      function () {
        store.get(1);
      },
      { name: "TransactionInactiveError" },
      "throw TransactionInactiveError on aborted transaction.",
    );
    t.end();
  };
});

// IDBObjectStore.get() - throw DataError when using invalid key
test.cb("WPT idbobjectstore_get7.htm", (t) => {
  var db: any;

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;
    db.createObjectStore("store", { keyPath: "key" });
  };

  open_rq.onsuccess = function (e: any) {
    var store = db.transaction("store").objectStore("store");
    t.throws(
      function () {
        store.get(null);
      },
      { name: "DataError" },
      "throw DataError when using invalid key.",
    );
    t.end();
  };
});
