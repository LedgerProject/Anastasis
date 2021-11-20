import test from "ava";
import { BridgeIDBCursor } from "..";
import { IDBCursor } from "../idbtypes";
import { createdb, indexeddb_test } from "./wptsupport";

// IDBCursor.delete() - index - remove a record from the object store
test.cb("WPT idbcursor-delete-index.htm", (t) => {
  var db: any;
  let count = 0,
    records = [
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

  open_rq.onsuccess = CursorDeleteRecord;

  function CursorDeleteRecord(e: any) {
    var txn = db.transaction("test", "readwrite"),
      cursor_rq = txn.objectStore("test").index("index").openCursor();

    cursor_rq.onsuccess = function (e: any) {
      var cursor = e.target.result;

      t.true(cursor instanceof BridgeIDBCursor, "cursor exist");
      cursor.delete();
    };

    txn.oncomplete = VerifyRecordWasDeleted;
  }

  function VerifyRecordWasDeleted(e: any) {
    var cursor_rq = db.transaction("test").objectStore("test").openCursor();

    cursor_rq.onsuccess = function (e: any) {
      var cursor = e.target.result;

      if (!cursor) {
        t.deepEqual(count, 1, "count");
        t.end();
        return;
      }

      t.deepEqual(cursor.value.pKey, records[1].pKey);
      t.deepEqual(cursor.value.iKey, records[1].iKey);
      cursor.continue();
      count++;
    };
  }
});

// IDBCursor.delete() - object store - attempt to remove a record in a read-only transaction
test.cb("WPT idbcursor-delete-index2.htm", (t) => {
  var db: any,
    records = [
      { pKey: "primaryKey_0", iKey: "indexKey_0" },
      { pKey: "primaryKey_1", iKey: "indexKey_1" },
    ];

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;

    var objStore = db.createObjectStore("test", { keyPath: "pKey" });

    for (var i = 0; i < records.length; i++) objStore.add(records[i]);
  };

  open_rq.onsuccess = function (e: any) {
    var cursor_rq = db.transaction("test").objectStore("test").openCursor();

    cursor_rq.onsuccess = function (e: any) {
      var cursor = e.target.result;

      t.true(cursor != null, "cursor exist");
      t.throws(
        () => {
          cursor.delete();
        },
        {
          name: "ReadOnlyError",
        },
      );
      t.end();
    };
  };
});

// IDBCursor.delete() - index - attempt to remove a record in an inactive transaction
test.cb("WPT idbcursor-delete-index3.htm", (t) => {
  var db: any,
    records = [
      { pKey: "primaryKey_0", iKey: "indexKey_0" },
      { pKey: "primaryKey_1", iKey: "indexKey_1" },
    ];

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;
    var objStore = db.createObjectStore("test", { keyPath: "pKey" });
    var index = objStore.createIndex("index", "iKey");

    for (var i = 0; i < records.length; i++) objStore.add(records[i]);

    var cursor_rq = index.openCursor();

    let myCursor: IDBCursor | undefined;

    cursor_rq.onsuccess = function (e: any) {
      var cursor = e.target.result;
      t.true(cursor instanceof BridgeIDBCursor, "cursor exist");
      myCursor = cursor;
    };

    e.target.transaction.oncomplete = function (e: any) {
      t.throws(
        () => {
          myCursor!.delete();
        },
        { name: "TransactionInactiveError" },
      );
      t.end();
    };
  };
});

// IDBCursor.delete() - index - throw InvalidStateError caused by object store been deleted
test.cb("WPT idbcursor-delete-index4.htm", (t) => {
  var db: any,
    records = [
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
        function () {
          cursor.delete();
        },
        { name: "InvalidStateError" },
        "If the cursor's source or effective object store has been deleted, the implementation MUST throw a DOMException of type InvalidStateError",
      );

      t.end();
    };
  };
});

// IDBCursor.delete() - index - throw InvalidStateError when the cursor is being iterated
test.cb("WPT idbcursor-delete-index5.htm", (t) => {
  var db: any,
    records = [
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

      cursor.continue();
      t.throws(
        function () {
          cursor.delete();
        },
        { name: "InvalidStateError" },
      );

      t.end();
    };
  };
});
