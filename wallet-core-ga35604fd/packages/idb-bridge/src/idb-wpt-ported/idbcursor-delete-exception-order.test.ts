import test from "ava";
import { createdb, indexeddb_test } from "./wptsupport";

test("WPT idbcursor-delete-exception-order.htm", async (t) => {
  // 'IDBCursor.delete exception order: TransactionInactiveError vs. ReadOnlyError'
  await indexeddb_test(
    t,
    (done, db) => {
      const s = db.createObjectStore("s");
      s.put("value", "key");
    },
    (done, db) => {
      const s = db.transaction("s", "readonly").objectStore("s");
      const r = s.openCursor();
      r.onsuccess = () => {
        r.onsuccess = null;
        setTimeout(() => {
          const cursor = r.result;
          t.assert(!!cursor);
          t.throws(
            () => {
              cursor!.delete();
            },
            { name: "TransactionInactiveError" },
            '"Transaction inactive" check (TransactionInactivError) ' +
              'should precede "read only" check (ReadOnlyError)',
          );
          done();
        }, 0);
      };
    },
  );

  indexeddb_test(
    t,
    (done, db) => {
      const s = db.createObjectStore("s");
      s.put("value", "key");
    },
    (done, db) => {
      const s = db.transaction("s", "readonly").objectStore("s");
      const r = s.openCursor();
      r.onsuccess = () => {
        r.onsuccess = null;
        const cursor = r.result!;
        t.assert(cursor);
        cursor.continue();
        t.throws(
          () => {
            cursor.delete();
          },
          { name: "ReadOnlyError" },
          '"Read only" check (ReadOnlyError) should precede ' +
            '"got value flag" (InvalidStateError) check',
        );

        done();
      };
    },
    "IDBCursor.delete exception order: ReadOnlyError vs. InvalidStateError #1",
  );

  indexeddb_test(
    t,
    (done, db) => {
      const s = db.createObjectStore("s");
      s.put("value", "key");
    },
    (done, db) => {
      const s = db.transaction("s", "readonly").objectStore("s");
      const r = s.openKeyCursor();
      r.onsuccess = () => {
        r.onsuccess = null;
        const cursor = r.result;
        t.throws(
          () => {
            cursor!.delete();
          },
          { name: "ReadOnlyError" },
          '"Read only" check (ReadOnlyError) should precede ' +
            '"key only flag" (InvalidStateError) check',
        );
        done();
      };
    },
    "IDBCursor.delete exception order: ReadOnlyError vs. InvalidStateError #2",
  );
});
