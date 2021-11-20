import test from "ava";
import { assert_key_equals, createdb } from "./wptsupport";

test("WPT test keypath.htm", async (t) => {
  function keypath(
    keypath: any,
    objects: any[],
    expected_keys: any[],
    desc?: string,
  ) {
    return new Promise<void>((resolve, reject) => {
      console.log("key path", keypath);
      console.log("checking", desc);
      let db: any;
      const store_name = "store-" + Date.now() + Math.random();

      var open_rq = createdb(t);
      open_rq.onupgradeneeded = function (e: any) {
        db = (e.target as any).result;
        var objStore = db.createObjectStore(store_name, { keyPath: keypath });

        for (var i = 0; i < objects.length; i++) objStore.add(objects[i]);
      };

      open_rq.onsuccess = function (e: any) {
        var actual_keys: any[] = [],
          rq = db.transaction(store_name).objectStore(store_name).openCursor();

        rq.onsuccess = (e: any) => {
          var cursor = e.target.result;

          if (cursor) {
            actual_keys.push(cursor.key.valueOf());
            cursor.continue();
          } else {
            assert_key_equals(actual_keys, expected_keys, "keyorder array");
            resolve();
          }
        };
      };
    });
  }

  await keypath("my.key", [{ my: { key: 10 } }], [10]);

  await keypath("my.køi", [{ my: { køi: 5 } }], [5]);

  await keypath("my.key_ya", [{ my: { key_ya: 10 } }], [10]);

  await keypath("public.key$ya", [{ public: { key$ya: 10 } }], [10]);

  await keypath("true.$", [{ true: { $: 10 } }], [10]);

  await keypath("my._", [{ my: { _: 10 } }], [10]);

  await keypath("delete.a7", [{ delete: { a7: 10 } }], [10]);

  await keypath(
    "p.p.p.p.p.p.p.p.p.p.p.p.p.p",
    [
      {
        p: {
          p: {
            p: {
              p: {
                p: {
                  p: { p: { p: { p: { p: { p: { p: { p: { p: 10 } } } } } } } },
                },
              },
            },
          },
        },
      },
    ],
    [10],
  );

  await keypath(
    "str.length",
    [{ str: "pony" }, { str: "my" }, { str: "little" }, { str: "" }],
    [0, 2, 4, 6],
  );

  await keypath(
    "arr.length",
    [
      { arr: [0, 0, 0, 0] },
      { arr: [{}, 0, "hei", "length", Infinity, []] },
      { arr: [10, 10] },
      { arr: [] },
    ],
    [0, 2, 4, 6],
  );

  await keypath("length", [[10, 10], "123", { length: 20 }], [2, 3, 20]);

  await keypath(
    "",
    [["bags"], "bean", 10],
    [10, "bean", ["bags"]],
    "'' uses value as key",
  );

  await keypath(
    [""],
    [["bags"], "bean", 10],
    [[10], ["bean"], [["bags"]]],
    "[''] uses value as [key]",
  );

  await keypath(
    ["x", "y"],
    [
      { x: 10, y: 20 },
      { y: 1.337, x: 100 },
    ],
    [
      [10, 20],
      [100, 1.337],
    ],
    "['x', 'y']",
  );

  await keypath(
    [["x"], ["y"]],
    [
      { x: 10, y: 20 },
      { y: 1.337, x: 100 },
    ],
    [
      [10, 20],
      [100, 1.337],
    ],
    "[['x'], 'y'] (stringifies)",
  );

  await keypath(
    [
      "x",
      {
        toString: function () {
          return "y";
        },
      },
    ],
    [
      { x: 10, y: 20 },
      { y: 1.337, x: 100 },
    ],
    [
      [10, 20],
      [100, 1.337],
    ],
    "['x', {toString->'y'}] (stringifies)",
  );

  await keypath(
    ["name", "type"],
    [
      { name: "orange", type: "fruit" },
      { name: "orange", type: ["telecom", "french"] },
    ],
    [
      ["orange", "fruit"],
      ["orange", ["telecom", "french"]],
    ],
  );

  await keypath(
    ["name", "type.name"],
    [
      { name: "orange", type: { name: "fruit" } },
      { name: "orange", type: { name: "telecom" } },
    ],
    [
      ["orange", "fruit"],
      ["orange", "telecom"],
    ],
  );

  const loop_array: any[] = [];
  loop_array.push(loop_array);
  await keypath(
    loop_array,
    ["a", 1, ["k"]],
    [[1], ["a"], [["k"]]],
    "array loop -> stringify becomes ['']",
  );

  t.pass();
});
