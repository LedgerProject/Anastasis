import test from "ava";
import { BridgeIDBCursor } from "..";
import { BridgeIDBCursorWithValue } from "../bridge-idb";
import { createdb } from "./wptsupport";

test.cb("WPT test idbcursor_continue_index.htm", (t) => {
  var db: any;
  let count = 0;
  const records = [
    { pKey: "primaryKey_0", iKey: "indexKey_0" },
    { pKey: "primaryKey_1", iKey: "indexKey_1" },
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
        t.deepEqual(count, records.length, "cursor run count");
        t.end();
        return;
      }

      var record = cursor.value;
      t.deepEqual(record.pKey, records[count].pKey, "primary key");
      t.deepEqual(record.iKey, records[count].iKey, "index key");

      cursor.continue();
      count++;
    };
  };
});

// IDBCursor.continue() - index - attempt to pass a key parameter that is not a valid key
test.cb("WPT idbcursor-continue-index2.htm", (t) => {
  var db: any;
  let records = [
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

      t.throws(
        () => {
          cursor.continue({ foo: "bar" });
        },
        { name: "DataError" },
      );

      t.true(cursor instanceof BridgeIDBCursorWithValue, "cursor");

      t.end();
    };
  };
});

// IDBCursor.continue() - index - attempt to iterate to the previous
// record when the direction is set for the next record
test.cb("WPT idbcursor-continue-index3.htm", (t) => {
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
    var count = 0;
    var cursor_rq = db
      .transaction("test")
      .objectStore("test")
      .index("index")
      .openCursor(undefined, "next"); // XXX: Fx has issue with "undefined"

    cursor_rq.onsuccess = function (e: any) {
      var cursor = e.target.result;
      if (!cursor) {
        t.deepEqual(count, 2, "ran number of times");
        t.end();
        return;
      }

      // First time checks key equal, second time checks key less than
      t.throws(
        () => {
          cursor.continue(records[0].iKey);
        },
        { name: "DataError" },
      );

      cursor.continue();

      count++;
    };
  };
});

// IDBCursor.continue() - index - attempt to iterate to the next
// record when the direction is set for the previous record
test.cb("WPT idbcursor-continue-index4.htm", (t) => {
  var db: any;
  const records = [
    { pKey: "primaryKey_0", iKey: "indexKey_0" },
    { pKey: "primaryKey_1", iKey: "indexKey_1" },
    { pKey: "primaryKey_2", iKey: "indexKey_2" },
  ];

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;
    var objStore = db.createObjectStore("test", { keyPath: "pKey" });

    objStore.createIndex("index", "iKey");

    for (var i = 0; i < records.length; i++) objStore.add(records[i]);
  };

  open_rq.onsuccess = function (e: any) {
    var count = 0,
      cursor_rq = db
        .transaction("test")
        .objectStore("test")
        .index("index")
        .openCursor(undefined, "prev"); // XXX Fx issues w undefined

    cursor_rq.onsuccess = function (e: any) {
      var cursor = e.target.result,
        record = cursor.value;

      switch (count) {
        case 0:
          t.deepEqual(record.pKey, records[2].pKey, "first pKey");
          t.deepEqual(record.iKey, records[2].iKey, "first iKey");
          cursor.continue();
          break;

        case 1:
          t.deepEqual(record.pKey, records[1].pKey, "second pKey");
          t.deepEqual(record.iKey, records[1].iKey, "second iKey");
          t.throws(
            () => {
              cursor.continue("indexKey_2");
            },
            { name: "DataError" },
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

// IDBCursor.continue() - index - iterate using 'prevunique'
test.cb("WPT idbcursor-continue-index5.htm", (t) => {
  var db: any;
  const records = [
    { pKey: "primaryKey_0", iKey: "indexKey_0" },
    { pKey: "primaryKey_1", iKey: "indexKey_1" },
    { pKey: "primaryKey_1-2", iKey: "indexKey_1" },
    { pKey: "primaryKey_2", iKey: "indexKey_2" },
  ];
  const expected = [
    { pKey: "primaryKey_2", iKey: "indexKey_2" },
    { pKey: "primaryKey_1", iKey: "indexKey_1" },
    { pKey: "primaryKey_0", iKey: "indexKey_0" },
  ];

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;
    var objStore = db.createObjectStore("test", { keyPath: "pKey" });

    objStore.createIndex("index", "iKey");

    for (var i = 0; i < records.length; i++) objStore.add(records[i]);
  };

  open_rq.onsuccess = function (e: any) {
    var count = 0,
      cursor_rq = db
        .transaction("test")
        .objectStore("test")
        .index("index")
        .openCursor(undefined, "prevunique");

    cursor_rq.onsuccess = function (e: any) {
      if (!e.target.result) {
        t.deepEqual(count, expected.length, "count");
        t.end();
        return;
      }
      const cursor = e.target.result;
      const record = cursor.value;
      t.deepEqual(record.pKey, expected[count].pKey, "pKey #" + count);
      t.deepEqual(record.iKey, expected[count].iKey, "iKey #" + count);

      t.deepEqual(cursor.key, expected[count].iKey, "cursor.key #" + count);
      t.deepEqual(
        cursor.primaryKey,
        expected[count].pKey,
        "cursor.primaryKey #" + count,
      );

      count++;
      cursor.continue(expected[count] ? expected[count].iKey : undefined);
    };
  };
});

// IDBCursor.continue() - index - iterate using nextunique
test.cb("WPT idbcursor-continue-index6.htm", (t) => {
  var db: any;
  const records = [
    { pKey: "primaryKey_0", iKey: "indexKey_0" },
    { pKey: "primaryKey_1", iKey: "indexKey_1" },
    { pKey: "primaryKey_1-2", iKey: "indexKey_1" },
    { pKey: "primaryKey_2", iKey: "indexKey_2" },
  ];
  const expected = [
    { pKey: "primaryKey_0", iKey: "indexKey_0" },
    { pKey: "primaryKey_1", iKey: "indexKey_1" },
    { pKey: "primaryKey_2", iKey: "indexKey_2" },
  ];

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;
    var objStore = db.createObjectStore("test", { keyPath: "pKey" });

    objStore.createIndex("index", "iKey");

    for (var i = 0; i < records.length; i++) objStore.add(records[i]);
  };

  open_rq.onsuccess = function (e: any) {
    var count = 0,
      cursor_rq = db
        .transaction("test")
        .objectStore("test")
        .index("index")
        .openCursor(undefined, "nextunique");

    cursor_rq.onsuccess = function (e: any) {
      if (!e.target.result) {
        t.deepEqual(count, expected.length, "count");
        t.end();
        return;
      }
      var cursor = e.target.result,
        record = cursor.value;

      t.deepEqual(record.pKey, expected[count].pKey, "pKey #" + count);
      t.deepEqual(record.iKey, expected[count].iKey, "iKey #" + count);

      t.deepEqual(cursor.key, expected[count].iKey, "cursor.key #" + count);
      t.deepEqual(
        cursor.primaryKey,
        expected[count].pKey,
        "cursor.primaryKey #" + count,
      );

      count++;
      cursor.continue(expected[count] ? expected[count].iKey : undefined);
    };
  };
});

// IDBCursor.continue() - index - throw TransactionInactiveError
test.cb("WPT idbcursor-continue-index7.htm", (t) => {
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
      t.true(cursor instanceof BridgeIDBCursor);

      event.target.transaction.abort();
      t.throws(
        () => {
          cursor.continue();
        },
        { name: "TransactionInactiveError" },
        "Calling continue() should throws an exception TransactionInactiveError when the transaction is not active.",
      );
      t.end();
    };
  };
});

// IDBCursor.continue() - index - throw InvalidStateError caused by object store been deleted
test.cb("WPT idbcursor-continue-index8.htm", (t) => {
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
      t.true(cursor instanceof BridgeIDBCursor);

      db.deleteObjectStore("store");

      t.throws(
        () => {
          cursor.continue();
        },
        { name: "InvalidStateError" },
        "If the cursor's source or effective object store has been deleted, the implementation MUST throw a DOMException of type InvalidStateError",
      );

      t.end();
    };
  };
});
