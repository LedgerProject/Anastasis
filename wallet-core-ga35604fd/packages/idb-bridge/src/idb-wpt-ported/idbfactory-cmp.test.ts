import test from "ava";
import { createdb, idbFactory } from "./wptsupport";

test("WPT idbfactory-cmp*.html", async (t) => {
  const indexedDB = idbFactory;
  var greater = indexedDB.cmp(2, 1);
  var equal = indexedDB.cmp(2, 2);
  var less = indexedDB.cmp(1, 2);

  t.deepEqual(greater, 1, "greater");
  t.deepEqual(equal, 0, "equal");
  t.deepEqual(less, -1, "less");

  t.throws(
    () => {
      // @ts-expect-error
      indexedDB.cmp();
    },
    { instanceOf: TypeError },
  );

  t.throws(
    () => {
      indexedDB.cmp(null, null);
    },
    { name: "DataError" },
  );

  t.throws(
    () => {
      indexedDB.cmp(1, null);
    },
    { name: "DataError" },
  );

  t.throws(
    () => {
      indexedDB.cmp(null, 1);
    },
    { name: "DataError" },
  );

  t.throws(
    () => {
      indexedDB.cmp(NaN, NaN);
    },
    { name: "DataError" },
  );

  t.throws(
    () => {
      indexedDB.cmp(1, NaN);
    },
    { name: "DataError" },
  );

  t.throws(
    () => {
      indexedDB.cmp(NaN, 1);
    },
    { name: "DataError" },
  );
});
