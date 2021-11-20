import test from "ava";
import { BridgeIDBRequest } from "..";
import {
  createdb,
  indexeddb_test,
  is_transaction_active,
  keep_alive,
} from "./wptsupport";

test("WPT test abort-in-initial-upgradeneeded.htm (subtest 1)", async (t) => {
  // Transactions are active during success handlers
  await indexeddb_test(
    t,
    (done, db, tx) => {
      db.createObjectStore("store");
    },
    (done, db) => {
      const tx = db.transaction("store");
      const release_tx = keep_alive(t, tx, "store");

      t.assert(
        is_transaction_active(t, tx, "store"),
        "Transaction should be active after creation",
      );

      const request = tx.objectStore("store").get(4242);
      (request as BridgeIDBRequest)._debugName = "req-main";
      request.onerror = () => t.fail("request should succeed");
      request.onsuccess = () => {
        t.true(
          is_transaction_active(t, tx, "store"),
          "Transaction should be active during success handler",
        );

        let saw_handler_promise = false;
        Promise.resolve().then(() => {
          saw_handler_promise = true;
          t.true(
            is_transaction_active(t, tx, "store"),
            "Transaction should be active in handler's microtasks",
          );
        });

        setTimeout(() => {
          t.true(saw_handler_promise);
          t.false(
            is_transaction_active(t, tx, "store"),
            "Transaction should be inactive in next task",
          );
          release_tx();
          done();
        }, 0);
      };
    },
  );
});

test("WPT test abort-in-initial-upgradeneeded.htm (subtest 2)", async (t) => {
  // Transactions are active during success listeners
  await indexeddb_test(
    t,
    (done, db, tx) => {
      db.createObjectStore("store");
    },
    (done, db) => {
      const tx = db.transaction("store");
      const release_tx = keep_alive(t, tx, "store");
      t.true(
        is_transaction_active(t, tx, "store"),
        "Transaction should be active after creation",
      );

      const request = tx.objectStore("store").get(0);
      request.onerror = () => t.fail("request should succeed");
      request.addEventListener("success", () => {
        t.true(
          is_transaction_active(t, tx, "store"),
          "Transaction should be active during success listener",
        );

        let saw_listener_promise = false;
        Promise.resolve().then(() => {
          saw_listener_promise = true;
          t.true(
            is_transaction_active(t, tx, "store"),
            "Transaction should be active in listener's microtasks",
          );
        });

        setTimeout(() => {
          t.true(saw_listener_promise);
          t.false(
            is_transaction_active(t, tx, "store"),
            "Transaction should be inactive in next task",
          );
          release_tx();
          done();
        }, 0);
      });
    },
  );
});

test("WPT test abort-in-initial-upgradeneeded.htm (subtest 3)", async (t) => {
  // Transactions are active during error handlers
  await indexeddb_test(
    t,
    (done, db, tx) => {
      db.createObjectStore("store");
    },
    (done, db) => {
      const tx = db.transaction("store", "readwrite");
      const release_tx = keep_alive(t, tx, "store");
      t.true(
        is_transaction_active(t, tx, "store"),
        "Transaction should be active after creation",
      );

      tx.objectStore("store").put(0, 0);
      const request = tx.objectStore("store").add(0, 0);
      request.onsuccess = () => t.fail("request should fail");
      request.onerror = (e: any) => {
        e.preventDefault();

        t.true(
          is_transaction_active(t, tx, "store"),
          "Transaction should be active during error handler",
        );

        let saw_handler_promise = false;
        Promise.resolve().then(() => {
          saw_handler_promise = true;
          t.true(
            is_transaction_active(t, tx, "store"),
            "Transaction should be active in handler's microtasks",
          );
        });

        setTimeout(() => {
          t.true(saw_handler_promise);
          t.false(
            is_transaction_active(t, tx, "store"),
            "Transaction should be inactive in next task",
          );
          release_tx();
          done();
        }, 0);
      };
    },
  );
});

test("WPT test abort-in-initial-upgradeneeded.htm (subtest 4)", async (t) => {
  // Transactions are active during error listeners
  await indexeddb_test(
    t,
    (done, db, tx) => {
      db.createObjectStore("store");
    },
    (done, db) => {
      const tx = db.transaction("store", "readwrite");
      const release_tx = keep_alive(t, tx, "store");
      t.true(
        is_transaction_active(t, tx, "store"),
        "Transaction should be active after creation",
      );

      tx.objectStore("store").put(0, 0);
      const request = tx.objectStore("store").add(0, 0);
      request.onsuccess = () => t.fail("request should fail");
      request.addEventListener("error", (e) => {
        e.preventDefault();

        t.true(
          is_transaction_active(t, tx, "store"),
          "Transaction should be active during error listener",
        );

        let saw_listener_promise = false;
        Promise.resolve().then(() => {
          saw_listener_promise = true;
          t.true(
            is_transaction_active(t, tx, "store"),
            "Transaction should be active in listener's microtasks",
          );
        });

        setTimeout(() => {
          t.true(saw_listener_promise);
          t.false(
            is_transaction_active(t, tx, "store"),
            "Transaction should be inactive in next task",
          );
          release_tx();
          done();
        }, 0);
      });
    },
  );
});
