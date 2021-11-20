import test from "ava";
import { createdb } from "./wptsupport";

test("WPT idbcursor-reused.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;
    var open_rq = createdb(t);

    open_rq.onupgradeneeded = function (e: any) {
      db = e.target.result;
      var os = db.createObjectStore("test");

      os.add("data", "k");
      os.add("data2", "k2");
    };

    open_rq.onsuccess = function (e: any) {
      var cursor: any;
      var count = 0;
      var rq = db.transaction("test").objectStore("test").openCursor();

      rq.onsuccess = function (e: any) {
        switch (count) {
          case 0:
            cursor = e.target.result;

            t.deepEqual(cursor.value, "data", "prequisite cursor.value");
            cursor.custom_cursor_value = 1;
            e.target.custom_request_value = 2;

            cursor.continue();
            break;

          case 1:
            t.deepEqual(cursor.value, "data2", "prequisite cursor.value");
            t.deepEqual(cursor.custom_cursor_value, 1, "custom cursor value");
            t.deepEqual(
              e.target.custom_request_value,
              2,
              "custom request value",
            );

            cursor.advance(1);
            break;

          case 2:
            t.false(!!e.target.result, "got cursor");
            t.deepEqual(cursor.custom_cursor_value, 1, "custom cursor value");
            t.deepEqual(
              e.target.custom_request_value,
              2,
              "custom request value",
            );
            break;
        }
        count++;
      };

      rq.transaction.oncomplete = function () {
        t.deepEqual(count, 3, "cursor callback runs");
        t.deepEqual(
          rq.custom_request_value,
          2,
          "variable placed on old IDBRequest",
        );
        t.deepEqual(
          cursor.custom_cursor_value,
          1,
          "custom cursor value (transaction.complete)",
        );
        resolve();
      };
    };
  });
  t.pass();
});
