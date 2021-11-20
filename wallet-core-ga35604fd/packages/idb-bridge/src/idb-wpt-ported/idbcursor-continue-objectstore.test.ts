import test from "ava";
import { BridgeIDBCursor } from "..";
import { BridgeIDBCursorWithValue } from "../bridge-idb";
import { IDBDatabase } from "../idbtypes";
import { createdb } from "./wptsupport";

// IDBCursor.continue() - object store - iterate to the next record
test.cb("WPT test idbcursor_continue_objectstore.htm", (t) => {
  var db: any;
  let count = 0;
  const records = [{ pKey: "primaryKey_0" }, { pKey: "primaryKey_1" }];

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;
    var objStore = db.createObjectStore("test", {
      autoIncrement: true,
      keyPath: "pKey",
    });

    for (var i = 0; i < records.length; i++) objStore.add(records[i]);
  };

  open_rq.onsuccess = function (e: any) {
    var store = db.transaction("test").objectStore("test");

    var cursor_rq = store.openCursor();
    cursor_rq.onsuccess = function (e: any) {
      var cursor = e.target.result;
      if (!cursor) {
        t.deepEqual(count, records.length, "cursor run count");
        t.end();
      }

      var record = cursor.value;
      t.deepEqual(record.pKey, records[count].pKey, "primary key");

      cursor.continue();
      count++;
    };
  };
});

// IDBCursor.continue() - index - attempt to pass a
// key parameter that is not a valid key
test.cb("WPT test idbcursor_continue_objectstore2.htm", (t) => {
  var db: any;
  const records = [{ pKey: "primaryKey_0" }, { pKey: "primaryKey_1" }];

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

      t.true(cursor instanceof BridgeIDBCursor, "cursor exists");
      t.throws(
        () => {
          cursor.continue({ foo: "42" });
        },
        { name: "DataError" },
      );

      t.end();
    };
  };
});

// IDBCursor.continue() - object store - attempt to iterate to the
// previous record when the direction is set for the next record
test.cb("WPT test idbcursor_continue_objectstore3.htm", (t) => {
  var db: IDBDatabase;
  const records = [{ pKey: "primaryKey_0" }, { pKey: "primaryKey_1" }];

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;
    var objStore = db.createObjectStore("test", { keyPath: "pKey" });

    for (var i = 0; i < records.length; i++) objStore.add(records[i]);
  };

  open_rq.onsuccess = function (e: any) {
    var cursor_rq = db
      .transaction("test")
      .objectStore("test")
      .openCursor(undefined, "next");

    cursor_rq.onsuccess = function (e: any) {
      var cursor = e.target.result;

      t.true(cursor instanceof BridgeIDBCursor, "cursor exist");
      t.throws(
        () => {
          cursor.continue(records[0].pKey);
        },
        {
          name: "DataError",
        },
      );

      t.end();
    };
  };
});

// IDBCursor.continue() - object store - attempt to iterate to the
// next record when the direction is set for the previous record
test.cb("WPT test idbcursor_continue_objectstore4.htm", (t) => {
  var db: any;
  const records = [
    { pKey: "primaryKey_0" },
    { pKey: "primaryKey_1" },
    { pKey: "primaryKey_2" },
  ];

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;
    var objStore = db.createObjectStore("test", { keyPath: "pKey" });

    for (var i = 0; i < records.length; i++) objStore.add(records[i]);
  };

  open_rq.onsuccess = function (e: any) {
    var count = 0,
      cursor_rq = db
        .transaction("test")
        .objectStore("test")
        .openCursor(null, "prev");

    cursor_rq.onsuccess = function (e: any) {
      var cursor = e.target.result;

      t.true(cursor != null, "cursor exist");

      switch (count) {
        case 0:
          t.deepEqual(cursor.value.pKey, records[2].pKey, "first cursor pkey");
          cursor.continue(records[1].pKey);
          break;

        case 1:
          t.deepEqual(cursor.value.pKey, records[1].pKey, "second cursor pkey");
          t.throws(
            () => {
              console.log("**** continuing cursor");
              cursor.continue(records[2].pKey);
              console.log("**** this should not happen");
            },
            {
              name: "DataError",
            },
          );
          t.end();
          break;

        default:
          t.fail("Unexpected count value: " + count);
      }

      count++;
    };
  };
});

// IDBCursor.continue() - object store - throw TransactionInactiveError
test.cb("WPT test idbcursor_continue_objectstore5.htm", (t) => {
  var db: any;
  const records = [{ pKey: "primaryKey_0" }, { pKey: "primaryKey_1" }];

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
      t.true(cursor instanceof BridgeIDBCursor, "cursor exists");

      e.target.transaction.abort();
      t.throws(
        () => {
          cursor.continue();
        },
        {
          name: "TransactionInactiveError",
        },
        "Calling continue() should throw an exception TransactionInactiveError when the transaction is not active.",
      );

      t.end();
    };
  };
});

// IDBCursor.continue() - object store - throw InvalidStateError caused by object store been deleted
test.cb("WPT test idbcursor_continue_objectstore6.htm", (t) => {
  var db: any;
  const records = [{ pKey: "primaryKey_0" }, { pKey: "primaryKey_1" }];

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;
    var objStore = db.createObjectStore("test", { keyPath: "pKey" });

    for (var i = 0; i < records.length; i++) objStore.add(records[i]);

    var cursor_rq = objStore.openCursor();

    cursor_rq.onsuccess = function (e: any) {
      var cursor = e.target.result;
      t.true(cursor instanceof BridgeIDBCursor, "cursor exists");

      db.deleteObjectStore("test");
      t.throws(
        () => {
          cursor.continue();
        },
        {
          name: "InvalidStateError",
        },
        "If the cursor's source or effective object store has been deleted, the implementation MUST throw a DOMException of type InvalidStateError",
      );

      t.end();
    };
  };
});
