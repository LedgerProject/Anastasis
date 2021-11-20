import test from "ava";
import { BridgeIDBCursor } from "..";
import { BridgeIDBRequest } from "../bridge-idb";
import { InvalidStateError } from "../util/errors";
import { createdb } from "./wptsupport";

test("WPT test idbcursor_advance_index.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    let db: any;
    let count = 0;
    const records = [
      { pKey: "primaryKey_0", iKey: "indexKey_0" },
      { pKey: "primaryKey_1", iKey: "indexKey_1" },
      { pKey: "primaryKey_2", iKey: "indexKey_2" },
      { pKey: "primaryKey_3", iKey: "indexKey_3" },
    ];

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;
      var store = db.createObjectStore("test", { keyPath: "pKey" });
      store.createIndex("idx", "iKey");

      for (var i = 0; i < records.length; i++) {
        store.add(records[i]);
      }
    };

    open_rq.onsuccess = function (e: any) {
      var cursor_rq = db
        .transaction("test")
        .objectStore("test")
        .index("idx")
        .openCursor();

      cursor_rq.onsuccess = function (e: any) {
        var cursor = e.target.result;
        t.log(cursor);
        t.true(e.target instanceof BridgeIDBRequest);
        t.true(cursor instanceof BridgeIDBCursor);

        switch (count) {
          case 0:
            count += 3;
            cursor.advance(3);
            break;
          case 3:
            var record = cursor.value;
            t.deepEqual(record.pKey, records[count].pKey, "record.pKey");
            t.deepEqual(record.iKey, records[count].iKey, "record.iKey");
            resolve();
            break;
          default:
            t.fail("unexpected count");
            break;
        }
      };
    };
  });
});

// IDBCursor.advance() - attempt to pass a count parameter that is not a number
test("WPT test idbcursor_advance_index2.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;

    const records = [
      { pKey: "primaryKey_0", iKey: "indexKey_0" },
      { pKey: "primaryKey_1", iKey: "indexKey_1" },
    ];

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;
      var objStore = db.createObjectStore("test", { keyPath: "pKey" });

      objStore.createIndex("index", "iKey");

      for (var i = 0; i < records.length; i++) objStore.add(records[i]);
    };

    open_rq.onsuccess = function (e: any) {
      var cursor_rq = db
        .transaction("test")
        .objectStore("test")
        .index("index")
        .openCursor();

      cursor_rq.onsuccess = function (e: any) {
        var cursor = e.target.result;

        t.true(cursor != null, "cursor exist");
        t.throws(
          () => {
            // Original test uses "document".
            cursor.advance({ foo: 42 });
          },
          { instanceOf: TypeError },
        );
        resolve();
      };
    };
  });
});

// IDBCursor.advance() - index - attempt to advance backwards
test("WPT test idbcursor_advance_index3.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;

    const records = [
      { pKey: "primaryKey_0", iKey: "indexKey_0" },
      { pKey: "primaryKey_1", iKey: "indexKey_1" },
    ];

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;
      var objStore = db.createObjectStore("test", { keyPath: "pKey" });

      objStore.createIndex("index", "iKey");

      for (var i = 0; i < records.length; i++) objStore.add(records[i]);
    };

    open_rq.onsuccess = function (e: any) {
      var cursor_rq = db
        .transaction("test")
        .objectStore("test")
        .index("index")
        .openCursor();

      cursor_rq.onsuccess = function (e: any) {
        var cursor = e.target.result;

        t.true(cursor != null, "cursor exist");
        t.throws(
          () => {
            cursor.advance(-1);
          },
          { instanceOf: TypeError },
        );
        resolve();
      };
    };
  });
});

// IDBCursor.advance() - index - iterate to the next record
test("WPT test idbcursor_advance_index5.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;
    let count = 0;
    const records = [
        { pKey: "primaryKey_0", iKey: "indexKey_0" },
        { pKey: "primaryKey_1", iKey: "indexKey_1" },
        { pKey: "primaryKey_1-2", iKey: "indexKey_1" },
      ],
      expected = [
        { pKey: "primaryKey_0", iKey: "indexKey_0" },
        { pKey: "primaryKey_1-2", iKey: "indexKey_1" },
      ];

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;
      var objStore = db.createObjectStore("test", { keyPath: "pKey" });

      objStore.createIndex("index", "iKey");

      for (var i = 0; i < records.length; i++) objStore.add(records[i]);
    };

    open_rq.onsuccess = function (e: any) {
      var cursor_rq = db
        .transaction("test")
        .objectStore("test")
        .index("index")
        .openCursor();

      cursor_rq.onsuccess = function (e: any) {
        var cursor = e.target.result;
        if (!cursor) {
          t.deepEqual(count, expected.length, "cursor run count");
          resolve();
        }

        var record = cursor.value;
        t.deepEqual(record.pKey, expected[count].pKey, "primary key");
        t.deepEqual(record.iKey, expected[count].iKey, "index key");

        cursor.advance(2);
        count++;
      };
    };
  });
});

// IDBCursor.advance() - index - throw TransactionInactiveError
test("WPT test idbcursor_advance_index7.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;
    const records = [
      { pKey: "primaryKey_0", iKey: "indexKey_0" },
      { pKey: "primaryKey_1", iKey: "indexKey_1" },
    ];

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (event: any) {
      db = event.target.result;
      var objStore = db.createObjectStore("store", { keyPath: "pKey" });
      objStore.createIndex("index", "iKey");
      for (var i = 0; i < records.length; i++) {
        objStore.add(records[i]);
      }
      var rq = objStore.index("index").openCursor();
      rq.onsuccess = function (event: any) {
        var cursor = event.target.result;
        t.true(cursor instanceof BridgeIDBCursor);

        event.target.transaction.abort();
        t.throws(
          () => {
            cursor.advance(1);
          },
          { name: "TransactionInactiveError" },
          "Calling advance() should throws an exception TransactionInactiveError when the transaction is not active.",
        );
        resolve();
      };
    };
  });
});

// IDBCursor.advance() - index - throw InvalidStateError
test("WPT test idbcursor_advance_index8.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;
    const records = [
      { pKey: "primaryKey_0", iKey: "indexKey_0" },
      { pKey: "primaryKey_1", iKey: "indexKey_1" },
    ];

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (event: any) {
      db = event.target.result;
      var objStore = db.createObjectStore("store", { keyPath: "pKey" });
      objStore.createIndex("index", "iKey");
      for (var i = 0; i < records.length; i++) {
        objStore.add(records[i]);
      }
      var rq = objStore.index("index").openCursor();
      let called = false;
      rq.onsuccess = function (event: any) {
        if (called) {
          return;
        }
        called = true;
        var cursor = event.target.result;
        t.true(cursor instanceof BridgeIDBCursor);

        cursor.advance(1);
        t.throws(
          () => {
            cursor.advance(1);
          },
          { name: "InvalidStateError" },
          "Calling advance() should throw DOMException when the cursor is currently being iterated.",
        );
        t.pass();
        resolve();
      };
    };
  });
});

// IDBCursor.advance() - index - throw InvalidStateError caused by object store been deleted
test("WPT test idbcursor_advance_index9.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;
    const records = [
      { pKey: "primaryKey_0", iKey: "indexKey_0" },
      { pKey: "primaryKey_1", iKey: "indexKey_1" },
    ];

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (event: any) {
      db = event.target.result;
      var objStore = db.createObjectStore("store", { keyPath: "pKey" });
      objStore.createIndex("index", "iKey");
      for (var i = 0; i < records.length; i++) {
        objStore.add(records[i]);
      }
      var rq = objStore.index("index").openCursor();
      rq.onsuccess = function (event: any) {
        var cursor = event.target.result;
        t.true(cursor instanceof BridgeIDBCursor, "cursor exist");

        db.deleteObjectStore("store");
        t.throws(
          () => {
            cursor.advance(1);
          },
          { name: "InvalidStateError" },
          "If the cursor's source or effective object store has been deleted, the implementation MUST throw a DOMException of type InvalidStateError",
        );

        resolve();
      };
    };
  });
});
