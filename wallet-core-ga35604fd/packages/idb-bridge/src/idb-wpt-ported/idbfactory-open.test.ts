import test from "ava";
import { BridgeIDBVersionChangeEvent } from "../bridge-idb";
import FakeEvent from "../util/FakeEvent";
import { createdb, format_value, idbFactory } from "./wptsupport";

// IDBFactory.open() - request has no source
test("WPT idbfactory-open.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var open_rq = createdb(t, undefined, 9);

    open_rq.onupgradeneeded = function (e: any) {};
    open_rq.onsuccess = function (e: any) {
      t.deepEqual(e.target.source, null, "source");
      resolve();
    };
  });
  t.pass();
});

// IDBFactory.open() - database 'name' and 'version' are correctly set
test("WPT idbfactory-open2.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var database_name = t.title + "-database_name";
    var open_rq = createdb(t, database_name, 13);

    open_rq.onupgradeneeded = function (e: any) {};
    open_rq.onsuccess = function (e: any) {
      var db = e.target.result;
      t.deepEqual(db.name, database_name, "db.name");
      t.deepEqual(db.version, 13, "db.version");
      resolve();
    };
  });
  t.pass();
});

// IDBFactory.open() - no version opens current database
test("WPT idbfactory-open3.htm", async (t) => {
  const indexedDB = idbFactory;
  await new Promise<void>((resolve, reject) => {
    var open_rq = createdb(t, undefined, 13);
    var did_upgrade = false;

    open_rq.onupgradeneeded = function () {};
    open_rq.onsuccess = function (e: any) {
      var db = e.target.result;
      db.close();

      var open_rq2 = indexedDB.open(db.name);
      open_rq2.onsuccess = function (e: any) {
        t.deepEqual(e.target.result.version, 13, "db.version");
        e.target.result.close();
        resolve();
      };
      open_rq2.onupgradeneeded = () => t.fail("Unexpected upgradeneeded");
      open_rq2.onerror = () => t.fail("Unexpected error");
    };
  });
  t.pass();
});

// IDBFactory.open() - new database has default version
test("WPT idbfactory-open4.htm", async (t) => {
  const indexedDB = idbFactory;
  await new Promise<void>((resolve, reject) => {
    var open_rq = createdb(t, t.title + "-database_name");

    open_rq.onupgradeneeded = function (e: any) {
      t.deepEqual(e.target.result.version, 1, "db.version");
    };
    open_rq.onsuccess = function (e: any) {
      t.deepEqual(e.target.result.version, 1, "db.version");
      resolve();
    };
  });
  t.pass();
});

// IDBFactory.open() - new database is empty
test("WPT idbfactory-open5.htm", async (t) => {
  const indexedDB = idbFactory;
  await new Promise<void>((resolve, reject) => {
    var open_rq = createdb(t, t.title + "-database_name");

    open_rq.onupgradeneeded = function () {};
    open_rq.onsuccess = function (e: any) {
      t.deepEqual(
        e.target.result.objectStoreNames.length,
        0,
        "objectStoreNames.length",
      );
      resolve();
    };
  });
  t.pass();
});

// IDBFactory.open() - open database with a lower version than current
test("WPT idbfactory-open6.htm", async (t) => {
  const indexedDB = idbFactory;
  await new Promise<void>((resolve, reject) => {
    var open_rq = createdb(t, undefined, 13);
    var open_rq2: any;

    open_rq.onupgradeneeded = function () {};
    open_rq.onsuccess = function (e: any) {
      var db = e.target.result;
      db.close();

      open_rq2 = indexedDB.open(db.name, 14);
      open_rq2.onupgradeneeded = function () {};
      open_rq2.onsuccess = open_previous_db;
      open_rq2.onerror = () => t.fail("Unexpected error");
    };

    function open_previous_db(e: any) {
      t.log("opening previous DB");
      var open_rq3 = indexedDB.open(e.target.result.name, 13);
      open_rq3.onerror = function (e: any) {
        t.log("got open error");
        t.deepEqual(e.target.error.name, "VersionError", "e.target.error.name");
        open_rq2.result.close();
        resolve();
      };
      open_rq3.onupgradeneeded = () => t.fail("Unexpected upgradeneeded");
      open_rq3.onsuccess = () => t.fail("Unexpected success");
    }
  });
  t.pass();
});

// IDBFactory.open() - open database with a higher version than current
test("WPT idbfactory-open7.htm", async (t) => {
  const indexedDB = idbFactory;
  await new Promise<void>((resolve, reject) => {
    var open_rq = createdb(t, undefined, 13);
    var did_upgrade = false;
    var open_rq2: any;

    open_rq.onupgradeneeded = function () {};
    open_rq.onsuccess = function (e: any) {
      var db = e.target.result;
      db.close();

      open_rq2 = indexedDB.open(db.name, 14);
      open_rq2.onupgradeneeded = function () {
        did_upgrade = true;
      };
      open_rq2.onsuccess = open_current_db;
      open_rq2.onerror = () => t.fail("Unexpected error");
    };

    function open_current_db(e: any) {
      var open_rq3 = indexedDB.open(e.target.result.name);
      open_rq3.onsuccess = function (e: any) {
        t.deepEqual(e.target.result.version, 14, "db.version");
        open_rq2.result.close();
        open_rq3.result.close();
        resolve();
      };
      open_rq3.onupgradeneeded = () => t.fail("Unexpected upgradeneeded");
      open_rq3.onerror = () => t.fail("Unexpected error");

      t.true(did_upgrade, "did upgrade");
    }
  });
  t.pass();
});

// IDBFactory.open() - error in version change transaction aborts open
test("WPT idbfactory-open8.htm", async (t) => {
  const indexedDB = idbFactory;
  await new Promise<void>((resolve, reject) => {
    var open_rq = createdb(t, undefined, 13);
    var did_upgrade = false;
    var did_db_abort = false;

    open_rq.onupgradeneeded = function (e: any) {
      did_upgrade = true;
      e.target.result.onabort = function () {
        did_db_abort = true;
      };
      e.target.transaction.abort();
    };
    open_rq.onerror = function (e: any) {
      t.true(did_upgrade);
      t.deepEqual(e.target.error.name, "AbortError", "target.error");
      resolve();
    };
  });
  t.pass();
});

// IDBFactory.open() - errors in version argument
test("WPT idbfactory-open9.htm", async (t) => {
  const indexedDB = idbFactory;
  function should_throw(val: any, name?: string) {
    if (!name) {
      name = typeof val == "object" && val ? "object" : format_value(val);
    }
    t.throws(
      () => {
        indexedDB.open("test", val);
      },
      { instanceOf: TypeError },
      "Calling open() with version argument " +
        name +
        " should throw TypeError.",
    );
  }

  should_throw(-1);
  should_throw(-0.5);
  should_throw(0);
  should_throw(0.5);
  should_throw(0.8);
  should_throw(0x20000000000000); // Number.MAX_SAFE_INTEGER + 1
  should_throw(NaN);
  should_throw(Infinity);
  should_throw(-Infinity);
  should_throw("foo");
  should_throw(null);
  should_throw(false);

  should_throw({
    toString: function () {
      t.fail("toString should not be called for ToPrimitive [Number]");
    },
    valueOf: function () {
      return 0;
    },
  });
  should_throw(
    {
      toString: function () {
        return 0;
      },
      valueOf: function () {
        return {};
      },
    },
    "object (second)",
  );
  should_throw(
    {
      toString: function () {
        return {};
      },
      valueOf: function () {
        return {};
      },
    },
    "object (third)",
  );

  /* Valid */

  async function should_work(val: any, expected_version: number) {
    var name = format_value(val);
    var dbname = "test-db-does-not-exist";

    await t.notThrowsAsync(async () => {
      return new Promise<void>((resolve, reject) => {
        indexedDB.deleteDatabase(dbname);
        var rq = indexedDB.open(dbname, val);
        rq.onupgradeneeded = function () {
          var db = rq.result;
          t.deepEqual(db.version, expected_version, "version");
          rq!.transaction!.abort();
        };
        rq.onsuccess = () => t.fail("open should fail");
        rq.onerror = () => resolve();
      });
    }, "Calling open() with version argument " + name + " should not throw.");
  }

  await should_work(1.5, 1);
  await should_work(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER); // 0x20000000000000 - 1
  await should_work(undefined, 1);
});

// IDBFactory.open() - error in version change transaction aborts open
test("WPT idbfactory-open10.htm", async (t) => {
  const indexedDB = idbFactory;
  await new Promise<void>((resolve, reject) => {
    var db: any, db2: any;
    var open_rq = createdb(t, undefined, 9);

    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;

      var st = db.createObjectStore("store");
      st.createIndex("index", "i");

      t.deepEqual(db.version, 9, "first db.version");
      t.true(
        db.objectStoreNames.contains("store"),
        "objectStoreNames contains store",
      );
      t.true(st.indexNames.contains("index"), "indexNames contains index");

      st.add({ i: "Joshua" }, 1);
      st.add({ i: "Jonas" }, 2);
    };
    open_rq.onsuccess = function (e: any) {
      db.close();
      var open_rq2 = indexedDB.open(db.name, 10);
      open_rq2.onupgradeneeded = function (e: any) {
        db2 = e.target.result;

        db2.createObjectStore("store2");

        var store = open_rq2.transaction!.objectStore("store");
        store.createIndex("index2", "i");

        t.deepEqual(db2.version, 10, "db2.version");

        t.true(
          db2.objectStoreNames.contains("store"),
          "second objectStoreNames contains store",
        );
        t.true(
          db2.objectStoreNames.contains("store2"),
          "second objectStoreNames contains store2",
        );
        t.true(
          store.indexNames.contains("index"),
          "second indexNames contains index",
        );
        t.true(
          store.indexNames.contains("index2"),
          "second indexNames contains index2",
        );

        store.add({ i: "Odin" }, 3);
        store.put({ i: "Sicking" }, 2);

        open_rq2.transaction!.abort();
      };
      open_rq2.onerror = function () {
        t.deepEqual(db2.version, 9, "db2.version after error");
        t.true(
          db2.objectStoreNames.contains("store"),
          "objectStoreNames contains store after error",
        );
        t.false(
          db2.objectStoreNames.contains("store2"),
          "objectStoreNames not contains store2 after error",
        );

        var open_rq3 = indexedDB.open(db.name);
        open_rq3.onsuccess = function (e: any) {
          var db3 = e.target.result;

          t.true(
            db3.objectStoreNames.contains("store"),
            "third objectStoreNames contains store",
          );
          t.false(
            db3.objectStoreNames.contains("store2"),
            "third objectStoreNames contains store2",
          );

          var st = db3.transaction("store").objectStore("store");

          t.deepEqual(db3.version, 9, "db3.version");

          t.true(
            st.indexNames.contains("index"),
            "third indexNames contains index",
          );
          t.false(
            st.indexNames.contains("index2"),
            "third indexNames contains index2",
          );

          st.openCursor(null, "prev").onsuccess = function (e: any) {
            t.deepEqual(e.target.result.key, 2, "opencursor(prev) key");
            t.deepEqual(
              e.target.result.value.i,
              "Jonas",
              "opencursor(prev) value",
            );
          };
          st.get(3).onsuccess = function (e: any) {
            t.deepEqual(e.target.result, undefined, "get(3)");
          };

          var idx = st.index("index");
          idx.getKey("Jonas").onsuccess = function (e: any) {
            t.deepEqual(e.target.result, 2, "getKey(Jonas)");
          };
          idx.getKey("Odin").onsuccess = function (e: any) {
            t.deepEqual(e.target.result, undefined, "getKey(Odin)");
          };
          idx.getKey("Sicking").onsuccess = function (e: any) {
            t.deepEqual(e.target.result, undefined, "getKey(Sicking)");
            db3.close();
            resolve();
          };
        };
      };
    };
  });
  t.pass();
});

// IDBFactory.open() - second open's transaction is available to get objectStores
test("WPT idbfactory-open11.htm", async (t) => {
  const indexedDB = idbFactory;
  await new Promise<void>((resolve, reject) => {
    var db: any;
    var count_done = 0;
    var open_rq = createdb(t);

    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;

      db.createObjectStore("store");
      t.true(
        db.objectStoreNames.contains("store"),
        "objectStoreNames contains store",
      );

      var store = e.target.transaction.objectStore("store");
      t.deepEqual(store.name, "store", "store.name");

      store.add("data", 1);

      store.count().onsuccess = function (e: any) {
        t.deepEqual(e.target.result, 1, "count()");
        count_done++;
      };

      store.add("data2", 2);
    };
    open_rq.onsuccess = function (e: any) {
      var store = db.transaction("store").objectStore("store");
      t.deepEqual(store.name, "store", "store.name");
      store.count().onsuccess = function (e: any) {
        t.deepEqual(e.target.result, 2, "count()");
        count_done++;
      };
      db.close();

      var open_rq2 = indexedDB.open(db.name, 10);
      open_rq2.onupgradeneeded = function (e: any) {
        var db2 = e.target.result;
        t.true(
          db2.objectStoreNames.contains("store"),
          "objectStoreNames contains store",
        );
        var store = open_rq2.transaction!.objectStore("store");
        t.deepEqual(store.name, "store", "store.name");

        store.add("data3", 3);

        store.count().onsuccess = function (e: any) {
          t.deepEqual(e.target.result, 3, "count()");
          count_done++;

          t.deepEqual(count_done, 3, "count_done");

          db2.close();
          resolve();
        };
      };
    };
  });
  t.pass();
});

// IDBFactory.open() - upgradeneeded gets VersionChangeEvent
test("WPT idbfactory-open12.htm", async (t) => {
  const indexedDB = idbFactory;

  var db: any;
  var open_rq = createdb(t, undefined, 9);

  await new Promise<void>((resolve, reject) => {
    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;

      t.true(
        e instanceof BridgeIDBVersionChangeEvent,
        "e instanceof IDBVersionChangeEvent",
      );
      t.deepEqual(e.oldVersion, 0, "oldVersion");
      t.deepEqual(e.newVersion, 9, "newVersion");
      t.deepEqual(e.type, "upgradeneeded", "event type");

      t.deepEqual(db.version, 9, "db.version");
    };
    open_rq.onsuccess = function (e: any) {
      t.true(e instanceof FakeEvent, "e instanceof Event");
      t.false(
        e instanceof BridgeIDBVersionChangeEvent,
        "e not instanceof IDBVersionChangeEvent",
      );
      t.deepEqual(e.type, "success", "event type");
      resolve();
    };
  });

  await new Promise<void>((resolve, reject) => {
    /**
     * Second test
     */
    db.onversionchange = function () {
      t.log("onversionchange called");
      db.close();
    };

    var open_rq2 = createdb(t, db.name, 10);
    open_rq2.onupgradeneeded = function (e: any) {
      var db2 = e.target.result;
      t.true(
        e instanceof BridgeIDBVersionChangeEvent,
        "e instanceof IDBVersionChangeEvent",
      );
      t.deepEqual(e.oldVersion, 9, "oldVersion");
      t.deepEqual(e.newVersion, 10, "newVersion");
      t.deepEqual(e.type, "upgradeneeded", "event type");

      t.deepEqual(db2.version, 10, "new db.version");

      resolve();
    };
  });
  t.pass();
});
