import test from "ava";
import { BridgeIDBCursor, BridgeIDBKeyRange } from "..";
import { BridgeIDBCursorWithValue } from "../bridge-idb";
import { IDBRequest } from "../idbtypes";
import { createdb } from "./wptsupport";

const IDBKeyRange = BridgeIDBKeyRange;

// Validate the overloads of IDBObjectStore.openCursor(),
// IDBIndex.openCursor() and IDBIndex.openKeyCursor()
test.cb("WPT test cursor-overloads.htm", (t) => {
  var db: any, store: any, index: any;

  var request = createdb(t);
  request.onupgradeneeded = function (e: any) {
    db = request.result;
    store = db.createObjectStore("store");
    index = store.createIndex("index", "value");
    store.put({ value: 0 }, 0);
    const trans = request.transaction!;
    trans.oncomplete = verifyOverloads;
  };

  async function verifyOverloads() {
    const trans = db.transaction("store");
    store = trans.objectStore("store");
    index = store.index("index");

    await checkCursorDirection(store.openCursor(), "next");
    await checkCursorDirection(store.openCursor(0), "next");
    await checkCursorDirection(store.openCursor(0, "next"), "next");
    await checkCursorDirection(store.openCursor(0, "nextunique"), "nextunique");
    await checkCursorDirection(store.openCursor(0, "prev"), "prev");
    await checkCursorDirection(store.openCursor(0, "prevunique"), "prevunique");

    await checkCursorDirection(store.openCursor(IDBKeyRange.only(0)), "next");
    await checkCursorDirection(
      store.openCursor(BridgeIDBKeyRange.only(0), "next"),
      "next",
    );
    await checkCursorDirection(
      store.openCursor(IDBKeyRange.only(0), "nextunique"),
      "nextunique",
    );
    await checkCursorDirection(
      store.openCursor(IDBKeyRange.only(0), "prev"),
      "prev",
    );
    await checkCursorDirection(
      store.openCursor(IDBKeyRange.only(0), "prevunique"),
      "prevunique",
    );

    await checkCursorDirection(index.openCursor(), "next");
    await checkCursorDirection(index.openCursor(0), "next");
    await checkCursorDirection(index.openCursor(0, "next"), "next");
    await checkCursorDirection(index.openCursor(0, "nextunique"), "nextunique");
    await checkCursorDirection(index.openCursor(0, "prev"), "prev");
    await checkCursorDirection(index.openCursor(0, "prevunique"), "prevunique");

    await checkCursorDirection(index.openCursor(IDBKeyRange.only(0)), "next");
    await checkCursorDirection(
      index.openCursor(IDBKeyRange.only(0), "next"),
      "next",
    );
    await checkCursorDirection(
      index.openCursor(IDBKeyRange.only(0), "nextunique"),
      "nextunique",
    );
    await checkCursorDirection(
      index.openCursor(IDBKeyRange.only(0), "prev"),
      "prev",
    );
    await checkCursorDirection(
      index.openCursor(IDBKeyRange.only(0), "prevunique"),
      "prevunique",
    );

    await checkCursorDirection(index.openKeyCursor(), "next");
    await checkCursorDirection(index.openKeyCursor(0), "next");
    await checkCursorDirection(index.openKeyCursor(0, "next"), "next");
    await checkCursorDirection(
      index.openKeyCursor(0, "nextunique"),
      "nextunique",
    );
    await checkCursorDirection(index.openKeyCursor(0, "prev"), "prev");
    await checkCursorDirection(
      index.openKeyCursor(0, "prevunique"),
      "prevunique",
    );

    await checkCursorDirection(
      index.openKeyCursor(IDBKeyRange.only(0)),
      "next",
    );
    await checkCursorDirection(
      index.openKeyCursor(IDBKeyRange.only(0), "next"),
      "next",
    );
    await checkCursorDirection(
      index.openKeyCursor(IDBKeyRange.only(0), "nextunique"),
      "nextunique",
    );
    await checkCursorDirection(
      index.openKeyCursor(IDBKeyRange.only(0), "prev"),
      "prev",
    );
    await checkCursorDirection(
      index.openKeyCursor(IDBKeyRange.only(0), "prevunique"),
      "prevunique",
    );

    t.end();
  }

  function checkCursorDirection(
    request: IDBRequest,
    direction: string,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      request.onsuccess = function (event: any) {
        t.notDeepEqual(
          event.target.result,
          null,
          "Check the result is not null",
        );
        t.deepEqual(
          event.target.result.direction,
          direction,
          "Check the result direction",
        );
        resolve();
      };
    });
  }
});
