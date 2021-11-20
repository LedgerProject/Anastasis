import test from "ava";
import { IDBVersionChangeEvent } from "../idbtypes";
import { createdb } from "./wptsupport";

test.cb("WPT test value.htm, array", (t) => {
  const value = new Array();
  const _instanceof = Array;

  t.plan(1);

  createdb(t).onupgradeneeded = function (e: IDBVersionChangeEvent) {
    (e.target as any).result.createObjectStore("store").add(value, 1);
    (e.target as any).onsuccess = (e: any) => {
      console.log("in first onsuccess");
      e.target.result
        .transaction("store")
        .objectStore("store")
        .get(1).onsuccess = (e: any) => {
        t.assert(e.target.result instanceof _instanceof, "instanceof");
        t.end();
      };
    };
  };
});

test.cb("WPT test value.htm, date", (t) => {
  const value = new Date();
  const _instanceof = Date;

  t.plan(1);

  createdb(t).onupgradeneeded = function (e: IDBVersionChangeEvent) {
    (e.target as any).result.createObjectStore("store").add(value, 1);
    (e.target as any).onsuccess = (e: any) => {
      console.log("in first onsuccess");
      e.target.result
        .transaction("store")
        .objectStore("store")
        .get(1).onsuccess = (e: any) => {
        console.log("target", e.target);
        console.log("result", e.target.result);
        t.assert(e.target.result instanceof _instanceof, "instanceof");
        t.end();
      };
    };
  };
});
