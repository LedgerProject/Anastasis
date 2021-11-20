import test from "ava";
import { createdb } from "./wptsupport";

// IDBTransaction - complete event
test("WPT idbtransaction-oncomplete.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;
    var store: any;
    let open_rq = createdb(t);
    let stages: any[] = [];

    open_rq.onupgradeneeded = function (e: any) {
      stages.push("upgradeneeded");

      db = e.target.result;
      store = db.createObjectStore("store");

      e.target.transaction.oncomplete = function () {
        stages.push("complete");
      };
    };

    open_rq.onsuccess = function (e: any) {
      stages.push("success");

      // Making a totally new transaction to check
      db
        .transaction("store")
        .objectStore("store")
        .count().onsuccess = function (e: any) {
        t.deepEqual(stages, ["upgradeneeded", "complete", "success"]);
        resolve();
      };
      // XXX: Make one with real transactions, not only open() versionchange one

      /*db.transaction.objectStore('store').openCursor().onsuccess = function(e) {
          stages.push("opencursor1");
      }
      store.openCursor().onsuccess = function(e) {
          stages.push("opencursor2");
      }
      e.target.transaction.objectStore('store').openCursor().onsuccess = function(e) {
          stages.push("opencursor3");
      }
      */
    };
  });
  t.pass();
});
