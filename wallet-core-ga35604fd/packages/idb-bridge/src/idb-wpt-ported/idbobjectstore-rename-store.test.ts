import test, { ExecutionContext } from "ava";
import {
  checkStoreContents,
  checkStoreGenerator,
  checkStoreIndexes,
  createBooksStore,
  createDatabase,
  createNotBooksStore,
  migrateDatabase,
} from "./wptsupport";

// IndexedDB: object store renaming support
// IndexedDB object store rename in new transaction
test("WPT idbobjectstore-rename-store.html (subtest 1)", async (t) => {
  let bookStore: any = null;
  let bookStore2: any = null;
  let renamedBookStore: any = null;
  let renamedBookStore2: any = null;
  await createDatabase(t, (database, transaction) => {
    bookStore = createBooksStore(t, database);
  })
    .then((database) => {
      t.deepEqual(
        database.objectStoreNames as any,
        ["books"],
        'Test setup should have created a "books" object store',
      );
      const transaction = database.transaction("books", "readonly");
      bookStore2 = transaction.objectStore("books");
      return checkStoreContents(
        t,
        bookStore2,
        "The store should have the expected contents before any renaming",
      ).then(() => database.close());
    })
    .then(() =>
      migrateDatabase(t, 2, (database, transaction) => {
        renamedBookStore = transaction.objectStore("books");
        renamedBookStore.name = "renamed_books";

        t.deepEqual(
          renamedBookStore.name,
          "renamed_books",
          "IDBObjectStore name should change immediately after a rename",
        );
        t.deepEqual(
          database.objectStoreNames as any,
          ["renamed_books"],
          "IDBDatabase.objectStoreNames should immediately reflect the " +
            "rename",
        );
        t.deepEqual(
          transaction.objectStoreNames as any,
          ["renamed_books"],
          "IDBTransaction.objectStoreNames should immediately reflect the " +
            "rename",
        );
        t.deepEqual(
          transaction.objectStore("renamed_books"),
          renamedBookStore,
          "IDBTransaction.objectStore should return the renamed object " +
            "store when queried using the new name immediately after the " +
            "rename",
        );
        t.throws(
          () => transaction.objectStore("books"),
          { name: "NotFoundError" },
          "IDBTransaction.objectStore should throw when queried using the " +
            "renamed object store's old name immediately after the rename",
        );
      }),
    )
    .then((database) => {
      t.deepEqual(
        database.objectStoreNames as any,
        ["renamed_books"],
        "IDBDatabase.objectStoreNames should still reflect the rename " +
          "after the versionchange transaction commits",
      );
      const transaction = database.transaction("renamed_books", "readonly");
      renamedBookStore2 = transaction.objectStore("renamed_books");
      return checkStoreContents(
        t,
        renamedBookStore2,
        "Renaming an object store should not change its records",
      ).then(() => database.close());
    })
    .then(() => {
      t.deepEqual(
        bookStore.name,
        "books",
        "IDBObjectStore obtained before the rename transaction should " +
          "not reflect the rename",
      );
      t.deepEqual(
        bookStore2.name,
        "books",
        "IDBObjectStore obtained before the rename transaction should " +
          "not reflect the rename",
      );
      t.deepEqual(
        renamedBookStore.name,
        "renamed_books",
        "IDBObjectStore used in the rename transaction should keep " +
          "reflecting the new name after the transaction is committed",
      );
      t.deepEqual(
        renamedBookStore2.name,
        "renamed_books",
        "IDBObjectStore obtained after the rename transaction should " +
          "reflect the new name",
      );
    });
});

// IndexedDB: object store renaming support
// IndexedDB object store rename in the transaction where it is created
test("WPT idbobjectstore-rename-store.html (subtest 2)", async (t) => {
  let renamedBookStore: any = null,
    renamedBookStore2: any = null;
  await createDatabase(t, (database, transaction) => {
    renamedBookStore = createBooksStore(t, database);
    renamedBookStore.name = "renamed_books";

    t.deepEqual(
      renamedBookStore.name,
      "renamed_books",
      "IDBObjectStore name should change immediately after a rename",
    );
    t.deepEqual(
      database.objectStoreNames as any,
      ["renamed_books"],
      "IDBDatabase.objectStoreNames should immediately reflect the " + "rename",
    );
    t.deepEqual(
      transaction.objectStoreNames as any,
      ["renamed_books"],
      "IDBTransaction.objectStoreNames should immediately reflect the " +
        "rename",
    );
    t.deepEqual(
      transaction.objectStore("renamed_books"),
      renamedBookStore,
      "IDBTransaction.objectStore should return the renamed object " +
        "store when queried using the new name immediately after the " +
        "rename",
    );
    t.throws(
      () => transaction.objectStore("books"),
      { name: "NotFoundError" },
      "IDBTransaction.objectStore should throw when queried using the " +
        "renamed object store's old name immediately after the rename",
    );
  })
    .then((database) => {
      t.deepEqual(
        database.objectStoreNames as any,
        ["renamed_books"],
        "IDBDatabase.objectStoreNames should still reflect the rename " +
          "after the versionchange transaction commits",
      );
      const transaction = database.transaction("renamed_books", "readonly");
      renamedBookStore2 = transaction.objectStore("renamed_books");
      return checkStoreContents(
        t,
        renamedBookStore2,
        "Renaming an object store should not change its records",
      ).then(() => database.close());
    })
    .then(() => {
      t.deepEqual(
        renamedBookStore.name,
        "renamed_books",
        "IDBObjectStore used in the rename transaction should keep " +
          "reflecting the new name after the transaction is committed",
      );
      t.deepEqual(
        renamedBookStore2.name,
        "renamed_books",
        "IDBObjectStore obtained after the rename transaction should " +
          "reflect the new name",
      );
    });
});

// Renames the 'books' store to 'renamed_books'.
//
// Returns a promise that resolves to an IndexedDB database. The caller must
// close the database.
const renameBooksStore = (testCase: ExecutionContext) => {
  return migrateDatabase(testCase, 2, (database, transaction) => {
    const store = transaction.objectStore("books");
    store.name = "renamed_books";
  });
};

// IndexedDB: object store renaming support
// IndexedDB object store rename covers index
test("WPT idbobjectstore-rename-store.html (subtest 3)", async (t) => {
  await createDatabase(t, (database, transaction) => {
    createBooksStore(t, database);
  })
    .then(async (database) => {
      const transaction = database.transaction("books", "readonly");
      const store = transaction.objectStore("books");
      await checkStoreIndexes(
        t,
        store,
        "The object store index should have the expected contents before " +
          "any renaming",
      );
      return database.close();
    })
    .then(() => renameBooksStore(t))
    .then(async (database) => {
      const transaction = database.transaction("renamed_books", "readonly");
      const store = transaction.objectStore("renamed_books");
      await checkStoreIndexes(
        t,
        store,
        "Renaming an object store should not change its indexes",
      );
      return database.close();
    });
  t.pass();
});

// IndexedDB: object store renaming support
// IndexedDB object store rename covers key generator
test("WPT idbobjectstore-rename-store.html (subtest 4)", async (t) => {
  await createDatabase(t, (database, transaction) => {
    createBooksStore(t, database);
  })
    .then((database) => {
      const transaction = database.transaction("books", "readwrite");
      const store = transaction.objectStore("books");
      return checkStoreGenerator(
        t,
        store,
        345679,
        "The object store key generator should have the expected state " +
          "before any renaming",
      ).then(() => database.close());
    })
    .then(() => renameBooksStore(t))
    .then((database) => {
      const transaction = database.transaction("renamed_books", "readwrite");
      const store = transaction.objectStore("renamed_books");
      return checkStoreGenerator(
        t,
        store,
        345680,
        "Renaming an object store should not change the state of its key " +
          "generator",
      ).then(() => database.close());
    });
  t.pass();
});

// IndexedDB: object store renaming support
// IndexedDB object store rename to the name of a deleted store succeeds
test("WPT idbobjectstore-rename-store.html (subtest 5)", async (t) => {
  await createDatabase(t, (database, transaction) => {
    createBooksStore(t, database);
    createNotBooksStore(t, database);
  })
    .then((database) => {
      database.close();
    })
    .then(() =>
      migrateDatabase(t, 2, (database, transaction) => {
        const store = transaction.objectStore("books");
        database.deleteObjectStore("not_books");
        store.name = "not_books";
        t.deepEqual(
          database.objectStoreNames as any,
          ["not_books"],
          "IDBDatabase.objectStoreNames should immediately reflect the " +
            "rename",
        );
      }),
    )
    .then((database) => {
      t.deepEqual(
        database.objectStoreNames as any,
        ["not_books"],
        "IDBDatabase.objectStoreNames should still reflect the rename " +
          "after the versionchange transaction commits",
      );
      const transaction = database.transaction("not_books", "readonly");
      const store = transaction.objectStore("not_books");
      return checkStoreContents(
        t,
        store,
        "Renaming an object store should not change its records",
      ).then(() => database.close());
    });
  t.pass();
});

// IndexedDB: object store renaming support
test("WPT idbobjectstore-rename-store.html (IndexedDB object store swapping via renames succeeds)", async (t) => {
  await createDatabase(t, (database, transaction) => {
    createBooksStore(t, database);
    createNotBooksStore(t, database);
  })
    .then((database) => {
      database.close();
    })
    .then(() =>
      migrateDatabase(t, 2, (database, transaction) => {
        const bookStore = transaction.objectStore("books");
        const notBookStore = transaction.objectStore("not_books");

        transaction.objectStore("books").name = "tmp";
        transaction.objectStore("not_books").name = "books";
        transaction.objectStore("tmp").name = "not_books";

        t.deepEqual(
          database.objectStoreNames as any,
          ["books", "not_books"],
          "IDBDatabase.objectStoreNames should immediately reflect the swap",
        );

        t.is(
          transaction.objectStore("books"),
          notBookStore,
          'IDBTransaction.objectStore should return the original "books" ' +
            'store when queried with "not_books" after the swap',
        );
        t.is(
          transaction.objectStore("not_books"),
          bookStore,
          "IDBTransaction.objectStore should return the original " +
            '"not_books" store when queried with "books" after the swap',
        );
      }),
    )
    .then((database) => {
      t.deepEqual(
        database.objectStoreNames as any,
        ["books", "not_books"],
        "IDBDatabase.objectStoreNames should still reflect the swap " +
          "after the versionchange transaction commits",
      );
      const transaction = database.transaction("not_books", "readonly");
      const store = transaction.objectStore("not_books");
      t.deepEqual(
        store.indexNames as any,
        ["by_author", "by_title"],
        '"not_books" index names should still reflect the swap after the ' +
          "versionchange transaction commits",
      );
      return checkStoreContents(
        t,
        store,
        "Swapping two object stores should not change their records",
      ).then(() => database.close());
    });
  t.pass();
});

// IndexedDB: object store renaming support
test("WPT idbobjectstore-rename-store.html (IndexedDB object store rename stringifies non-string names)", async (t) => {
  await createDatabase(t, (database, transaction) => {
    createBooksStore(t, database);
  })
    .then((database) => {
      database.close();
    })
    .then(() =>
      migrateDatabase(t, 2, (database, transaction) => {
        const store = transaction.objectStore("books");
        // @ts-expect-error
        store.name = 42;
        t.deepEqual(
          store.name,
          "42",
          "IDBObjectStore name should change immediately after a " +
            "rename to a number",
        );
        t.deepEqual(
          database.objectStoreNames as any,
          ["42"],
          "IDBDatabase.objectStoreNames should immediately reflect the " +
            "stringifying rename",
        );

        // @ts-expect-error
        store.name = true;
        t.deepEqual(
          store.name,
          "true",
          "IDBObjectStore name should change immediately after a " +
            "rename to a boolean",
        );

        // @ts-expect-error
        store.name = {};
        t.deepEqual(
          store.name,
          "[object Object]",
          "IDBObjectStore name should change immediately after a " +
            "rename to an object",
        );

        // @ts-expect-error
        store.name = () => null;
        t.deepEqual(
          store.name,
          "() => null",
          "IDBObjectStore name should change immediately after a " +
            "rename to a function",
        );

        // @ts-expect-error
        store.name = undefined;
        t.deepEqual(
          store.name,
          "undefined",
          "IDBObjectStore name should change immediately after a " +
            "rename to undefined",
        );
      }),
    )
    .then((database) => {
      t.deepEqual(
        database.objectStoreNames as any,
        ["undefined"],
        "IDBDatabase.objectStoreNames should reflect the last rename " +
          "after the versionchange transaction commits",
      );
      const transaction = database.transaction("undefined", "readonly");
      const store = transaction.objectStore("undefined");
      return checkStoreContents(
        t,
        store,
        "Renaming an object store should not change its records",
      ).then(() => database.close());
    });
  t.pass();
});

function rename_test_macro(
  t: ExecutionContext,
  escapedName: string,
): Promise<void> {
  const name = JSON.parse('"' + escapedName + '"');
  return createDatabase(t, (database, transaction) => {
    createBooksStore(t, database);
  })
    .then((database) => {
      database.close();
    })
    .then(() =>
      migrateDatabase(t, 2, (database, transaction) => {
        const store = transaction.objectStore("books");

        store.name = name;
        t.deepEqual(
          store.name,
          name,
          "IDBObjectStore name should change immediately after the " + "rename",
        );
        t.deepEqual(
          database.objectStoreNames as any,
          [name],
          "IDBDatabase.objectStoreNames should immediately reflect the " +
            "rename",
        );
      }),
    )
    .then((database) => {
      t.deepEqual(
        database.objectStoreNames as any,
        [name],
        "IDBDatabase.objectStoreNames should reflect the rename " +
          "after the versionchange transaction commits",
      );
      const transaction = database.transaction(name, "readonly");
      const store = transaction.objectStore(name);
      return checkStoreContents(
        t,
        store,
        "Renaming an object store should not change its records",
      ).then(() => database.close());
    });
}

for (let escapedName of ["", "\\u0000", "\\uDC00\\uD800"]) {
  test(
    'IndexedDB object store can be renamed to "' + escapedName + '"',
    rename_test_macro,
    escapedName,
  );
}
