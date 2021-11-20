import test from "ava";
import { createdb } from "./wptsupport";

test("WPT test abort-in-initial-upgradeneeded.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var db: any;
    var open_rq = createdb(t, undefined, 2);

    open_rq.onupgradeneeded = function (e: any) {
      const tgt = e.target as any;
      db = tgt.result;
      t.deepEqual(db.version, 2);
      var transaction = tgt.transaction;
      transaction.oncomplete = () => t.fail("unexpected transaction.complete");
      transaction.onabort = function (e: any) {
        console.log(`version: ${e.target.db.version}`);
        t.deepEqual(e.target.db.version, 0);
      };
      db.onabort = function () {};
      transaction.abort();
    };

    open_rq.onerror = function (e: any) {
      const tgt = e.target as any;
      t.deepEqual(open_rq, e.target);
      t.deepEqual(tgt.result, undefined);
      t.deepEqual(tgt.error.name, "AbortError");
      console.log(`version (onerror): ${db.version}`);
      t.deepEqual(db.version, 0);
      t.deepEqual(open_rq.transaction, null);
      resolve();
    };
  });
});
