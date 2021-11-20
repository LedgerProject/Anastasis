import test from "ava";
import { BridgeIDBKeyRange, BridgeIDBRequest } from "..";
import { IDBDatabase } from "../idbtypes";
import { createdb } from "./wptsupport";

// IDBObjectStore.put() - put with an inline key
test.cb("WPT idbobjectstore_put.htm", (t) => {
  var db: any,
    record = { key: 1, property: "data" };

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;
    var objStore = db.createObjectStore("store", { keyPath: "key" });

    objStore.put(record);
  };

  open_rq.onsuccess = function (e: any) {
    var rq = db.transaction("store").objectStore("store").get(record.key);

    rq.onsuccess = function (e: any) {
      t.deepEqual(e.target.result.property, record.property);
      t.deepEqual(e.target.result.key, record.key);
      t.end();
    };
  };
});

// IDBObjectStore.put() - put with an out-of-line key
test.cb("WPT idbobjectstore_put2.htm", (t) => {
  var db: any,
    key = 1,
    record = { property: "data" };

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;
    var objStore = db.createObjectStore("store");

    objStore.put(record, key);
  };

  open_rq.onsuccess = function (e: any) {
    var rq = db.transaction("store").objectStore("store").get(key);

    rq.onsuccess = function (e: any) {
      t.deepEqual(e.target.result.property, record.property);

      t.end();
    };
  };
});

// IDBObjectStore.put() - put with an out-of-line key
test.cb("WPT idbobjectstore_put3.htm", (t) => {
  var db: any,
    success_event: any,
    record = { key: 1, property: "data" },
    record_put = { key: 1, property: "changed", more: ["stuff", 2] };

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;
    var objStore = db.createObjectStore("store", { keyPath: "key" });
    objStore.put(record);

    var rq = objStore.put(record_put);
    rq.onerror = () => t.fail("error on put");

    rq.onsuccess = function (e: any) {
      success_event = true;
    };
  };

  open_rq.onsuccess = function (e: any) {
    t.true(success_event);

    var rq = db.transaction("store").objectStore("store").get(1);

    rq.onsuccess = function (e: any) {
      var rec = e.target.result;

      t.deepEqual(rec.key, record_put.key);
      t.deepEqual(rec.property, record_put.property);
      t.deepEqual(rec.more, record_put.more);

      t.end();
    };
  };
});

// IDBObjectStore.put() - put where an index has unique:true specified
test.cb("WPT idbobjectstore_put4.htm", (t) => {
  var db: any,
    record = { key: 1, property: "data" };

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;
    var objStore = db.createObjectStore("store", { autoIncrement: true });
    objStore.createIndex("i1", "property", { unique: true });
    objStore.put(record);

    var rq = objStore.put(record);
    rq.onsuccess = () => t.fail("success on putting duplicate indexed record");

    rq.onerror = function (e: any) {
      t.deepEqual(rq.error.name, "ConstraintError");
      t.deepEqual(e.target.error.name, "ConstraintError");

      t.deepEqual(e.type, "error");

      e.preventDefault();
      e.stopPropagation();
    };
  };

  // Defer done, giving a spurious rq.onsuccess a chance to run
  open_rq.onsuccess = function (e: any) {
    t.end();
  };
});

// IDBObjectStore.put() - object store's key path is an object attribute
test.cb("WPT idbobjectstore_put5.htm", (t) => {
  var db: any,
    record = { test: { obj: { key: 1 } }, property: "data" };

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;
    var objStore = db.createObjectStore("store", { keyPath: "test.obj.key" });
    objStore.put(record);
  };

  open_rq.onsuccess = function (e: any) {
    var rq = db
      .transaction("store")
      .objectStore("store")
      .get(record.test.obj.key);

    rq.onsuccess = function (e: any) {
      t.deepEqual(e.target.result.property, record.property);

      t.end();
    };
  };
});

// IDBObjectStore.put() - autoIncrement and inline keys
test.cb("WPT idbobjectstore_put6.htm", (t) => {
  var db: any,
    record = { property: "data" },
    expected_keys = [1, 2, 3, 4];

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;
    var objStore = db.createObjectStore("store", {
      keyPath: "key",
      autoIncrement: true,
    });

    objStore.put(record);
    objStore.put(record);
    objStore.put(record);
    objStore.put(record);
  };

  open_rq.onsuccess = function (e: any) {
    var actual_keys: any[] = [],
      rq = db.transaction("store").objectStore("store").openCursor();

    rq.onsuccess = function (e: any) {
      var cursor = e.target.result;

      if (cursor) {
        actual_keys.push(cursor.value.key);
        cursor.continue();
      } else {
        t.deepEqual(actual_keys, expected_keys);
        t.end();
      }
    };
  };
});

// IDBObjectStore.put() - autoIncrement and out-of-line keys
test.cb("WPT idbobjectstore_put7.htm", (t) => {
  var db: any,
    record = { property: "data" },
    expected_keys = [1, 2, 3, 4];

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;
    var objStore = db.createObjectStore("store", { autoIncrement: true });

    objStore.put(record);
    objStore.put(record);
    objStore.put(record);
    objStore.put(record);
  };

  open_rq.onsuccess = function (e) {
    var actual_keys: any[] = [],
      rq = db.transaction("store").objectStore("store").openCursor();

    rq.onsuccess = function (e: any) {
      var cursor = e.target.result;

      if (cursor) {
        actual_keys.push(cursor.key);
        cursor.continue();
      } else {
        t.deepEqual(actual_keys, expected_keys);
        t.end();
      }
    };
  };
});

// IDBObjectStore.put() - object store has autoIncrement:true and the key path is an object attribute
test.cb("WPT idbobjectstore_put8.htm", (t) => {
  var db: any,
    record = { property: "data" },
    expected_keys = [1, 2, 3, 4];

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;
    var objStore = db.createObjectStore("store", {
      keyPath: "test.obj.key",
      autoIncrement: true,
    });

    objStore.put(record);
    objStore.put(record);
    objStore.put(record);
    objStore.put(record);
  };

  open_rq.onsuccess = function (e: any) {
    var actual_keys: any[] = [],
      rq = db.transaction("store").objectStore("store").openCursor();

    rq.onsuccess = function (e: any) {
      var cursor = e.target.result;

      if (cursor) {
        actual_keys.push(cursor.value.test.obj.key);
        cursor.continue();
      } else {
        t.deepEqual(actual_keys, expected_keys);
        t.end();
      }
    };
  };
});

//IDBObjectStore.put() - Attempt to put a record that does not meet the constraints of an object store's inline key requirements
test.cb("WPT idbobjectstore_put9.htm", (t) => {
  var record = { key: 1, property: "data" };

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    var rq,
      db = e.target.result,
      objStore = db.createObjectStore("store", { keyPath: "key" });

    t.throws(
      function () {
        rq = objStore.put(record, 1);
      },
      { name: "DataError" },
    );

    t.deepEqual(rq, undefined);
    t.end();
  };
});

//IDBObjectStore.put() - Attempt to call 'put' without an key parameter when the object store uses out-of-line keys
test.cb("WPT idbobjectstore_put10.htm", (t) => {
  var db: any,
    record = { property: "data" };

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;

    var rq,
      objStore = db.createObjectStore("store", { keyPath: "key" });

    t.throws(
      function () {
        rq = objStore.put(record);
      },
      { name: "DataError" },
    );

    t.deepEqual(rq, undefined);
    t.end();
  };
});

// IDBObjectStore.put() - Attempt to put a record where the record's key does not meet the constraints of a valid key
test.cb("WPT idbobjectstore_put11.htm", (t) => {
  var db: any,
    record = { key: { value: 1 }, property: "data" };

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;

    var rq,
      objStore = db.createObjectStore("store", { keyPath: "key" });

    t.throws(
      function () {
        rq = objStore.put(record);
      },
      { name: "DataError" },
    );

    t.deepEqual(rq, undefined);
    t.end();
  };
});

// IDBObjectStore.put() - Attempt to put a record where the record's in-line key is not defined
test.cb("WPT idbobjectstore_put12.htm", (t) => {
  var db: any,
    record = { property: "data" };

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;

    var rq,
      objStore = db.createObjectStore("store", { keyPath: "key" });

    t.throws(
      function () {
        rq = objStore.put(record);
      },
      { name: "DataError" },
    );

    t.deepEqual(rq, undefined);
    t.end();
  };
});

// IDBObjectStore.put() - Attempt to put a record where the out of line key provided does not meet the constraints of a valid key
test.cb("WPT idbobjectstore_put13.htm", (t) => {
  var db: any,
    record = { property: "data" };

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;

    var rq,
      objStore = db.createObjectStore("store");

    t.throws(
      function () {
        rq = objStore.put(record, { value: 1 });
      },
      {
        name: "DataError",
      },
    );

    t.deepEqual(rq, undefined);
    t.end();
  };
});

// IDBObjectStore.put() - Put a record where a value being indexed does not meet the constraints of a valid key
test.cb("WPT idbobjectstore_put14.htm", (t) => {
  var db: any,
    record = { key: 1, indexedProperty: { property: "data" } };

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (e: any) {
    db = e.target.result;

    var rq,
      objStore = db.createObjectStore("store", { keyPath: "key" });

    objStore.createIndex("index", "indexedProperty");

    rq = objStore.put(record);

    t.true(rq instanceof BridgeIDBRequest);
    rq.onsuccess = function () {
      t.end();
    };
  };
});

// IDBObjectStore.put() - If the transaction this IDBObjectStore belongs to has its mode set to readonly, throw ReadOnlyError
test.cb("WPT idbobjectstore_put15.htm", (t) => {
  var db: any;

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (event: any) {
    db = event.target.result;
    db.createObjectStore("store", { keyPath: "pKey" });
  };

  open_rq.onsuccess = function (event: any) {
    var txn = db.transaction("store");
    var ostore = txn.objectStore("store");
    t.throws(
      function () {
        ostore.put({ pKey: "primaryKey_0" });
      },
      {
        name: "ReadOnlyError",
      },
    );
    t.end();
  };
});

// IDBObjectStore.put() - If the object store has been deleted, the implementation must throw a DOMException of type InvalidStateError
test.cb("WPT idbobjectstore_put16.htm", (t) => {
  var db: any, ostore: any;

  var open_rq = createdb(t);
  open_rq.onupgradeneeded = function (event: any) {
    db = event.target.result;
    ostore = db.createObjectStore("store", { keyPath: "pKey" });
    db.deleteObjectStore("store");
    t.throws(
      function () {
        ostore.put({ pKey: "primaryKey_0" });
      },
      {
        name: "InvalidStateError",
      },
    );
    t.end();
  };
});
