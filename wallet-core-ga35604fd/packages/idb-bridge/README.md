# idb-bridge

The `idb-bridge` package implements the IndexedDB API with multiple backends.

Currently available backends are:
 * sqlite: A SQLite3 database.  Can be backed by a file or in memory.
 * memdb: An unoptimized in-memory storage backend.  Useful for environments
   that do not have sqlite.

## Known Issues

IndexedDB assumes that after a database has been opened, the set of object stores and indices does not change,
even when there is no transaction active.  We cannot guarantee this with SQLite.

## Acknowledgements

This library is based on the fakeIndexedDB library
(https://github.com/dumbmatter/fakeIndexedDB).