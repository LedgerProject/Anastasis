import test, { ExecutionContext } from "ava";
import { BridgeIDBCursor } from "..";
import { BridgeIDBRequest } from "../bridge-idb";
import { InvalidStateError } from "../util/errors";
import { createdb, indexeddb_test } from "./wptsupport";

async function t1(t: ExecutionContext, method: string): Promise<void> {
  await indexeddb_test(
    t,
    (done, db) => {
      const store = db.createObjectStore("s");
      const store2 = db.createObjectStore("s2");

      db.deleteObjectStore("s2");

      setTimeout(() => {
        t.throws(
          () => {
            (store2 as any)[method]("key", "value");
          },
          { name: "InvalidStateError" },
          '"has been deleted" check (InvalidStateError) should precede ' +
            '"not active" check (TransactionInactiveError)',
        );
        done();
      }, 0);
    },
    (done, db) => {},
    "t1",
  );
}

/**
 * IDBObjectStore.${method} exception order: 'TransactionInactiveError vs. ReadOnlyError'
 */
async function t2(t: ExecutionContext, method: string): Promise<void> {
  await indexeddb_test(
    t,
    (done, db) => {
      const store = db.createObjectStore("s");
    },
    (done, db) => {
      const tx = db.transaction("s", "readonly");
      const store = tx.objectStore("s");

      setTimeout(() => {
        t.throws(
          () => {
            console.log(`calling ${method}`);
            (store as any)[method]("key", "value");
          },
          {
            name: "TransactionInactiveError",
          },
          '"not active" check (TransactionInactiveError) should precede ' +
            '"read only" check (ReadOnlyError)',
        );

        done();
      }, 0);

      console.log(`queued task for ${method}`);
    },
    "t2",
  );
}

/**
 * IDBObjectStore.${method} exception order: 'ReadOnlyError vs. DataError'
 */
async function t3(t: ExecutionContext, method: string): Promise<void> {
  await indexeddb_test(
    t,
    (done, db) => {
      const store = db.createObjectStore("s");
    },
    (done, db) => {
      const tx = db.transaction("s", "readonly");
      const store = tx.objectStore("s");

      t.throws(
        () => {
          (store as any)[method]({}, "value");
        },
        { name: "ReadOnlyError" },
        '"read only" check (ReadOnlyError) should precede ' +
          "key/data check (DataError)",
      );

      done();
    },
    "t3",
  );
}

test("WPT idbobjectstore-add-put-exception-order.html (add, t1)", t1, "add");
test("WPT idbobjectstore-add-put-exception-order.html (put, t1)", t1, "put");

test("WPT idbobjectstore-add-put-exception-order.html (add, t2)", t2, "add");
test("WPT idbobjectstore-add-put-exception-order.html (put, t2)", t2, "put");

test("WPT idbobjectstore-add-put-exception-order.html (add, t3)", t3, "add");
test("WPT idbobjectstore-add-put-exception-order.html (put, t3)", t3, "put");
