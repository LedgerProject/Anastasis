import test from "ava";
import { BridgeIDBRequest } from "..";
import { IDBDatabase } from "../idbtypes";
import { createdb } from "./wptsupport";

// IDBObjectStore.add() - add with an inline key
test("WPT idbobjectstore_add.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: IDBDatabase | undefined;
    const record = { key: 1, property: "data" };

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;
      var objStore = db!.createObjectStore("store", { keyPath: "key" });

      objStore.add(record);
    };

    open_rq.onsuccess = function (e: any) {
      var rq = db!.transaction("store").objectStore("store").get(record.key);

      rq.onsuccess = function (e: any) {
        t.deepEqual(e.target.result.property, record.property);
        t.deepEqual(e.target.result.key, record.key);
        resolve();
      };
    };
  });
  t.pass();
});

// IDBObjectStore.add() - add with an out-of-line key
test("WPT idbobjectstore_add2.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;
    const key = 1;
    const record = { property: "data" };

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;
      var objStore = db.createObjectStore("store");

      objStore.add(record, key);
    };

    open_rq.onsuccess = function (e: any) {
      var rq = db.transaction("store").objectStore("store").get(key);

      rq.onsuccess = function (e: any) {
        t.deepEqual(e.target.result.property, record.property);
        resolve();
      };
    };
  });
  t.pass();
});

// IDBObjectStore.add() - record with same key already exists
test("WPT idbobjectstore_add3.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;
    const record = { key: 1, property: "data" };

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;
      var objStore = db.createObjectStore("store", { keyPath: "key" });
      objStore.add(record);

      var rq = objStore.add(record);
      rq.onsuccess = () => t.fail("success on adding duplicate record");

      rq.onerror = function (e: any) {
        t.deepEqual(e.target.error.name, "ConstraintError");
        t.deepEqual(rq.error.name, "ConstraintError");
        t.deepEqual(e.type, "error");
        e.preventDefault();
        e.stopPropagation();
      };
    };

    // Defer done, giving rq.onsuccess a chance to run
    open_rq.onsuccess = function (e: any) {
      resolve();
    };
  });
  t.pass();
});

// IDBObjectStore.add() - add where an index has unique:true specified
test("WPT idbobjectstore_add4.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    let db: any;
    let record = { key: 1, property: "data" };

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;
      var objStore = db.createObjectStore("store", { autoIncrement: true });
      objStore.createIndex("i1", "property", { unique: true });
      objStore.add(record);

      var rq = objStore.add(record);
      rq.onsuccess = () => t.fail("success on adding duplicate indexed record");

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
      resolve();
    };
  });
  t.pass();
});

// IDBObjectStore.add() - object store's key path is an object attribute
test("WPT idbobjectstore_add5.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;
    const record = { test: { obj: { key: 1 } }, property: "data" };

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;
      var objStore = db.createObjectStore("store", { keyPath: "test.obj.key" });
      objStore.add(record);
    };

    open_rq.onsuccess = function (e: any) {
      var rq = db
        .transaction("store")
        .objectStore("store")
        .get(record.test.obj.key);

      rq.onsuccess = function (e: any) {
        t.deepEqual(e.target.result.property, record.property);
        resolve();
      };
    };
  });
  t.pass();
});

// IDBObjectStore.add() - autoIncrement and inline keys
test("WPT idbobjectstore_add6.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;
    const record = { property: "data" };
    const expected_keys = [1, 2, 3, 4];

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;
      var objStore = db.createObjectStore("store", {
        keyPath: "key",
        autoIncrement: true,
      });

      objStore.add(record);
      objStore.add(record);
      objStore.add(record);
      objStore.add(record);
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
          resolve();
        }
      };
    };
  });
  t.pass();
});

// IDBObjectStore.add() - autoIncrement and out-of-line keys
test("WPT idbobjectstore_add7.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;
    const record = { property: "data" };
    const expected_keys = [1, 2, 3, 4];

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;
      var objStore = db.createObjectStore("store", { autoIncrement: true });

      objStore.add(record);
      objStore.add(record);
      objStore.add(record);
      objStore.add(record);
    };

    open_rq.onsuccess = function (e: any) {
      var actual_keys: any[] = [],
        rq = db.transaction("store").objectStore("store").openCursor();

      rq.onsuccess = function (e: any) {
        var cursor = e.target.result;

        if (cursor) {
          actual_keys.push(cursor.key);
          cursor.continue();
        } else {
          t.deepEqual(actual_keys, expected_keys);
          resolve();
        }
      };
    };
  });
  t.pass();
});

// IDBObjectStore.add() - object store has autoIncrement:true and the key path
// is an object attribute
test("WPT idbobjectstore_add8.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;
    const record = { property: "data" };
    const expected_keys = [1, 2, 3, 4];

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;
      var objStore = db.createObjectStore("store", {
        keyPath: "test.obj.key",
        autoIncrement: true,
      });

      objStore.add(record);
      objStore.add(record);
      objStore.add(record);
      objStore.add(record);
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
          resolve();
        }
      };
    };
  });
  t.pass();
});

// IDBObjectStore.add() - Attempt to add a record that does not meet the
// constraints of an object store's inline key requirements
test("WPT idbobjectstore_add9.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    const record = { key: 1, property: "data" };

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      var rq,
        db = e.target.result,
        objStore = db.createObjectStore("store", { keyPath: "key" });

      t.throws(
        function () {
          rq = objStore.add(record, 1);
        },
        { name: "DataError" },
      );
      t.deepEqual(rq, undefined);
      resolve();
    };
  });
  t.pass();
});

// IDBObjectStore.add() - Attempt to call 'add' without an key parameter when the
// object store uses out-of-line keys.
test("WPT idbobjectstore_add10.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;
    const record = { property: "data" };

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;

      var rq,
        objStore = db.createObjectStore("store");

      t.throws(
        function () {
          rq = objStore.add(record);
        },
        { name: "DataError" },
      );

      t.deepEqual(rq, undefined);
      resolve();
    };
  });
  t.pass();
});

// IDBObjectStore.add() - Attempt to add a record where the record's key
// does not meet the constraints of a valid key
test("WPT idbobjectstore_add11.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;
    const record = { key: { value: 1 }, property: "data" };

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;

      var rq,
        objStore = db.createObjectStore("store", { keyPath: "key" });

      t.throws(
        function () {
          rq = objStore.add(record);
        },
        { name: "DataError" },
      );

      t.deepEqual(rq, undefined);
      resolve();
    };
  });
  t.pass();
});

// IDBObjectStore.add() - Attempt to add a record where the
// record's in-line key is not defined
test("WPT idbobjectstore_add12.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;
    const record = { property: "data" };

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;

      var rq,
        objStore = db.createObjectStore("store", { keyPath: "key" });
      t.throws(
        function () {
          rq = objStore.add(record);
        },
        { name: "DataError" },
      );
      t.deepEqual(rq, undefined);
      resolve();
    };
  });
  t.pass();
});

// IDBObjectStore.add() - Attempt to add a record where the out of line
// key provided does not meet the constraints of a valid key
test("WPT idbobjectstore_add13.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;
    const record = { property: "data" };

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;

      var rq,
        objStore = db.createObjectStore("store");

      t.throws(
        function () {
          rq = objStore.add(record, { value: 1 });
        },
        { name: "DataError" },
      );

      t.deepEqual(rq, undefined);
      resolve();
    };
  });
  t.pass();
});

// IDBObjectStore.add() - Add a record where a value
// being indexed does not meet the constraints of a valid key
test("WPT idbobjectstore_add14.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;
    const record = { key: 1, indexedProperty: { property: "data" } };

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;

      var rq,
        objStore = db.createObjectStore("store", { keyPath: "key" });

      objStore.createIndex("index", "indexedProperty");

      rq = objStore.add(record);

      t.assert(rq instanceof BridgeIDBRequest);
      rq.onsuccess = function () {
        resolve();
      };
    };
  });
  t.pass();
});

// IDBObjectStore.add() - If the transaction this IDBObjectStore belongs
// to has its mode set to readonly, throw ReadOnlyError
test("WPT idbobjectstore_add15.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
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
          ostore.add({ pKey: "primaryKey_0" });
        },
        { name: "ReadOnlyError" },
      );
      resolve();
    };
  });
  t.pass();
});

// IDBObjectStore.add() - If the object store has been
// deleted, the implementation must throw a DOMException of type InvalidStateError
test("WPT idbobjectstore_add16.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;
    let ostore: any;

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (event: any) {
      db = event.target.result;
      ostore = db.createObjectStore("store", { keyPath: "pKey" });
      db.deleteObjectStore("store");

      t.throws(
        function () {
          ostore.add({ pKey: "primaryKey_0" });
        },
        { name: "InvalidStateError" },
      );
      resolve();
    };
  });
  t.pass();
});
