import test from "ava";
import { BridgeIDBRequest } from "..";
import { EventTarget, IDBDatabase } from "../idbtypes";
import { createdb } from "./wptsupport";

// Bubbling and capturing of request events
test("WPT request_bubble-and-capture.htm", async (t) => {
  await new Promise<void>((resolve, reject) => {
    var events: any[] = [];

    var open_rq = createdb(t);
    open_rq.onupgradeneeded = function (e: any) {
      var db = e.target.result;
      var txn = e.target.transaction;
      var store = db.createObjectStore("s");
      var rq1 = store.add("", 1);
      var rq2 = store.add("", 1);
      db.onerror = function () {};

      log_request(" db", db);
      log_request("txn", txn);
      log_request("rq1", rq1);
      log_request("rq2", rq2);

      // Don't let it get to abort
      db.addEventListener(
        "error",
        function (e: any) {
          e.preventDefault();
        },
        false,
      );
    };

    open_rq.onsuccess = function (e: any) {
      log("open_rq.success")(e);
      t.deepEqual(
        events,
        [
          "capture  db.success",
          "capture txn.success",
          "capture rq1.success",
          "bubble  rq1.success",

          "capture  db.error: ConstraintError",
          "capture txn.error: ConstraintError",
          "capture rq2.error: ConstraintError",
          "bubble  rq2.error: ConstraintError",
          "bubble  txn.error: ConstraintError",
          "bubble   db.error: ConstraintError",

          "open_rq.success",
        ],
        "events",
      );
      resolve();
    };

    function log_request(type: any, obj: EventTarget) {
      obj.addEventListener(
        "success",
        log("capture " + type + ".success"),
        true,
      );
      obj.addEventListener(
        "success",
        log("bubble  " + type + ".success"),
        false,
      );
      obj.addEventListener("error", log("capture " + type + ".error"), true);
      obj.addEventListener("error", log("bubble  " + type + ".error"), false);
    }

    function log(msg: any) {
      return function (e: any) {
        if (e && e.target && e.target.error)
          events.push(msg + ": " + e.target.error.name);
        else events.push(msg);
      };
    }
  });
  t.pass();
});
