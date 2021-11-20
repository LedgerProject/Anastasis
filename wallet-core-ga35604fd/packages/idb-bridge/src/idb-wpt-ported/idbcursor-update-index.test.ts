import test from "ava";
import { BridgeIDBCursor, BridgeIDBKeyRange } from "..";
import { BridgeIDBCursorWithValue } from "../bridge-idb";
import { IDBDatabase } from "../idbtypes";
import {
  createDatabase,
  createdb,
  promiseForRequest,
  promiseForTransaction,
} from "./wptsupport";

// IDBCursor.update() - index - modify a record in the object store
test.cb("WPT test idbcursor_update_index.htm", (t) => {
  var db: any,
    count = 0,
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

    // XXX: Gecko doesn't like this
    //e.target.transaction.oncomplete = t.step_func(CursorUpdateRecord);
  };

  open_rq.onsuccess = CursorUpdateRecord;

  function CursorUpdateRecord(e: any) {
    var txn = db.transaction("test", "readwrite"),
      cursor_rq = txn.objectStore("test").index("index").openCursor();
    cursor_rq.onsuccess = function (e: any) {
      var cursor = e.target.result;

      cursor.value.iKey += "_updated";
      cursor.update(cursor.value);
    };

    txn.oncomplete = VerifyRecordWasUpdated;
  }

  function VerifyRecordWasUpdated(e: any) {
    var cursor_rq = db.transaction("test").objectStore("test").openCursor();

    cursor_rq.onsuccess = function (e: any) {
      var cursor = e.target.result;

      t.deepEqual(cursor.value.iKey, records[0].iKey + "_updated");
      t.end();
    };
  }
});

// IDBCursor.update() - index - attempt to modify a record in a read-only transaction
test.cb("WPT test idbcursor_update_index2.htm", (t) => {
  var db: any,
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

  open_rq.onsuccess = function (e: any) {
    var cursor_rq = db
      .transaction("test")
      .objectStore("test")
      .index("index")
      .openCursor();

    cursor_rq.onsuccess = function (e: any) {
      var cursor = e.target.result;
      t.throws(
        function () {
          cursor.update(cursor.value);
        },
        { name: "ReadOnlyError" },
      );
      t.end();
    };
  };
});

//IDBCursor.update() - index - attempt to modify a record in an inactive transaction
test.cb("WPT test idbcursor_update_index3.htm", (t) => {
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

    const window: any = {};

    cursor_rq.onsuccess = function (e: any) {
      var cursor = e.target.result;
      t.true(cursor instanceof BridgeIDBCursor, "cursor exist");
      window.cursor = cursor;
      window.record = cursor.value;
    };

    e.target.transaction.oncomplete = function (e: any) {
      t.throws(
        function () {
          window.cursor.update(window.record);
        },
        { name: "TransactionInactiveError" },
      );
      t.end();
    };
  };
});

// IDBCursor.update() - index - attempt to modify a record when object store been deleted
test.cb("WPT test idbcursor_update_index4.htm", (t) => {
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
      cursor.value.iKey += "_updated";
      t.throws(
        function () {
          cursor.update(cursor.value);
        },
        { name: "InvalidStateError" },
        "If the cursor's source or effective object store has been deleted, the implementation MUST throw a DOMException of type InvalidStateError",
      );

      t.end();
    };
  };
});

// IDBCursor.update() - index - throw DataCloneError
test.cb("WPT test idbcursor_update_index5.htm", (t) => {
  var db: any,
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

  open_rq.onsuccess = function (e: any) {
    var cursor_rq = db
      .transaction("test", "readwrite")
      .objectStore("test")
      .index("index")
      .openCursor();

    cursor_rq.onsuccess = function (e: any) {
      var cursor = e.target.result;
      t.true(cursor instanceof BridgeIDBCursor);

      var record = cursor.value;
      // Original test uses different uncloneable value
      record.data = { foo: () => {} };
      t.throws(
        function () {
          cursor.update(record);
        },
        { name: "DataCloneError" },
      );
      t.end();
    };
  };
});

// IDBCursor.update() - index - no argument
test.cb("WPT test idbcursor_update_index6.htm", (t) => {
  var db: any,
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

  open_rq.onsuccess = function (e: any) {
    var cursor_rq = db
      .transaction("test")
      .objectStore("test")
      .index("index")
      .openCursor();

    cursor_rq.onsuccess = function (e: any) {
      var cursor = e.target.result;
      t.true(cursor instanceof BridgeIDBCursor);

      t.throws(
        function () {
          cursor.update();
        },
        {
          instanceOf: TypeError,
        },
      );
      t.end();
    };
  };
});

// IDBCursor.update() - index - throw DataError
test.cb("WPT test idbcursor_update_index7.htm", (t) => {
  var db: any,
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

  open_rq.onsuccess = function (e: any) {
    var cursor_rq = db
      .transaction("test", "readwrite")
      .objectStore("test")
      .index("index")
      .openCursor();

    cursor_rq.onsuccess = function (e: any) {
      var cursor = e.target.result;
      t.true(cursor instanceof BridgeIDBCursor);

      t.throws(
        function () {
          cursor.update(null);
        },
        { name: "DataError" },
      );
      t.end();
    };
  };
});

// IDBCursor.update() - index - throw InvalidStateError when the cursor is being iterated
test.cb("WPT test idbcursor_update_index8.htm", (t) => {
  var db: any,
    records = [
      { pKey: "primaryKey_0", iKey: "indexKey_0" },
      { pKey: "primaryKey_1", iKey: "indexKey_1" },
    ];

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;

    var objStore = db.createObjectStore("store", { keyPath: "pKey" });
    objStore.createIndex("index", "iKey");

    for (var i = 0; i < records.length; i++) objStore.add(records[i]);
  };

  open_rq.onsuccess = function (e: any) {
    var cursor_rq = db
      .transaction("store", "readwrite")
      .objectStore("store")
      .index("index")
      .openCursor();

    cursor_rq.onsuccess = function (e: any) {
      var cursor = e.target.result;
      t.true(cursor instanceof BridgeIDBCursor, "cursor exists");

      cursor.continue();
      t.throws(
        function () {
          cursor.update({ pKey: "primaryKey_0", iKey: "indexKey_0_updated" });
        },
        {
          name: "InvalidStateError",
        },
      );

      t.end();
    };
  };
});

// Index cursor - indexed values updated during iteration
test("WPT test idbcursor_update_index9.any.js", async (t) => {
  const db = await createDatabase(t, (db) => {
    const store = db.createObjectStore("store");
    store.createIndex("index", "value");
    store.put({ value: 1 }, 1);
    store.put({ value: 2 }, 2);
    store.put({ value: 3 }, 3);
  });

  {
    // Iterate over all index entries until an upper bound is reached.
    // On each record found, increment the value used as the index
    // key, which will make it show again up later in the iteration.
    const tx = db.transaction("store", "readwrite");
    const range = BridgeIDBKeyRange.upperBound(9);
    const index = tx.objectStore("store").index("index");
    const request = index.openCursor(range);
    request.onsuccess = (e: any) => {
      const cursor = e.target.result;
      if (!cursor) return;

      const record = cursor.value;
      record.value += 1;
      cursor.update(record);

      cursor.continue();
    };

    await promiseForTransaction(t, tx);
  }

  {
    const tx = db.transaction("store", "readonly");
    const results = await promiseForRequest(
      t,
      tx.objectStore("store").getAll(),
    );
    t.deepEqual(
      results.map((record) => record.value),
      [10, 10, 10],
      "Values should all be incremented until bound reached",
    );
  }
});
