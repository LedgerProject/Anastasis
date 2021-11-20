/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */

/**
 * Type declarations for IndexedDB, adapted from the TypeScript lib.dom.d.ts.
 *
 * Instead of ambient types, we export type declarations.
 */

/**
 * @public
 */
export type IDBKeyPath = string;

/**
 * @public
 */
export interface EventListener {
  (evt: Event): void;
}

/**
 * @public
 */
export interface EventListenerObject {
  handleEvent(evt: Event): void;
}

/**
 * @public
 */
export interface EventListenerOptions {
  capture?: boolean;
}

/**
 * @public
 */
export interface AddEventListenerOptions extends EventListenerOptions {
  once?: boolean;
  passive?: boolean;
}

/**
 * @public
 */
export type IDBTransactionMode = "readonly" | "readwrite" | "versionchange";

/**
 * @public
 */
export type EventListenerOrEventListenerObject =
  | EventListener
  | EventListenerObject;

/**
 * EventTarget is a DOM interface implemented by objects that can receive
 * events and may have listeners for them.
 *
 * @public
 */
export interface EventTarget {
  /**
   * Appends an event listener for events whose type attribute value is type. The callback argument sets the callback that will be invoked when the event is dispatched.
   *
   * The options argument sets listener-specific options. For compatibility this can be a boolean, in which case the method behaves exactly as if the value was specified as options's capture.
   *
   * When set to true, options's capture prevents callback from being invoked when the event's eventPhase attribute value is BUBBLING_PHASE. When false (or not present), callback will not be invoked when event's eventPhase attribute value is CAPTURING_PHASE. Either way, callback will be invoked if event's eventPhase attribute value is AT_TARGET.
   *
   * When set to true, options's passive indicates that the callback will not cancel the event by invoking preventDefault(). This is used to enable performance optimizations described in § 2.8 Observing event listeners.
   *
   * When set to true, options's once indicates that the callback will only be invoked once after which the event listener will be removed.
   *
   * The event listener is appended to target's event listener list and is not appended if it has the same type, callback, and capture.
   */
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void;
  /**
   * Dispatches a synthetic event event to target and returns true if either event's cancelable attribute value is false or its preventDefault() method was not invoked, and false otherwise.
   */
  dispatchEvent(event: Event): boolean;
  /**
   * Removes the event listener in target's event listener list with the same type, callback, and options.
   */
  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void;
}

/**
 * An event which takes place in the DOM.
 *
 * @public
 */
export interface Event {
  /**
   * Returns true or false depending on how event was initialized. True if event goes through its target's ancestors in reverse tree order, and false otherwise.
   */
  readonly bubbles: boolean;
  cancelBubble: boolean;
  /**
   * Returns true or false depending on how event was initialized. Its return value does not always carry meaning, but true can indicate that part of the operation during which event was dispatched, can be canceled by invoking the preventDefault() method.
   */
  readonly cancelable: boolean;
  /**
   * Returns true or false depending on how event was initialized. True if event invokes listeners past a ShadowRoot node that is the root of its target, and false otherwise.
   */
  readonly composed: boolean;
  /**
   * Returns the object whose event listener's callback is currently being invoked.
   */
  readonly currentTarget: EventTarget | null;
  /**
   * Returns true if preventDefault() was invoked successfully to indicate cancellation, and false otherwise.
   */
  readonly defaultPrevented: boolean;
  /**
   * Returns the event's phase, which is one of NONE, CAPTURING_PHASE, AT_TARGET, and BUBBLING_PHASE.
   */
  readonly eventPhase: number;
  /**
   * Returns true if event was dispatched by the user agent, and false otherwise.
   */
  readonly isTrusted: boolean;
  returnValue: boolean;
  /**
   * @deprecated use target instead
   */
  readonly srcElement: EventTarget | null;
  /**
   * Returns the object to which event is dispatched (its target).
   */
  readonly target: EventTarget | null;
  /**
   * Returns the event's timestamp as the number of milliseconds measured relative to the time origin.
   */
  readonly timeStamp: number;
  /**
   * Returns the type of event, e.g. "click", "hashchange", or "submit".
   */
  readonly type: string;
  /**
   * Returns the invocation target objects of event's path (objects on which listeners will be invoked), except for any nodes in shadow trees of which the shadow root's mode is "closed" that are not reachable from event's currentTarget.
   */
  composedPath(): EventTarget[];
  initEvent(type: string, bubbles?: boolean, cancelable?: boolean): void;
  /**
   * If invoked when the cancelable attribute value is true, and while executing a listener for the event with passive set to false, signals to the operation that caused event to be dispatched that it needs to be canceled.
   */
  preventDefault(): void;
  /**
   * Invoking this method prevents event from reaching any registered event listeners after the current one finishes running and, when dispatched in a tree, also prevents event from reaching any other objects.
   */
  stopImmediatePropagation(): void;
  /**
   * When dispatched in a tree, invoking this method prevents event from reaching any objects other than the current object.
   */
  stopPropagation(): void;
  readonly AT_TARGET: number;
  readonly BUBBLING_PHASE: number;
  readonly CAPTURING_PHASE: number;
  readonly NONE: number;
}

/**
 * A type returned by some APIs which contains a list of DOMString (strings).
 *
 * @public
 */
export interface DOMStringList {
  /**
   * Returns the number of strings in strings.
   */
  readonly length: number;
  /**
   * Returns true if strings contains string, and false otherwise.
   */
  contains(string: string): boolean;
  /**
   * Returns the string with index index from strings.
   */
  item(index: number): string | null;
  [index: number]: string;
}

/**
 * @public
 */
export type BufferSource = ArrayBufferView | ArrayBuffer;

/**
 * @public
 */
export type IDBValidKey = number | string | Date | BufferSource | IDBArrayKey;

/**
 * @public
 */
export interface IDBIndexParameters {
  multiEntry?: boolean;
  unique?: boolean;
}

/**
 * @public
 */
export interface IDBObjectStoreParameters {
  autoIncrement?: boolean;
  keyPath?: string | string[] | null;
}

/**
 * @public
 */
export interface EventInit {
  bubbles?: boolean;
  cancelable?: boolean;
  composed?: boolean;
}

/**
 * @public
 */
export interface IDBArrayKey extends Array<IDBValidKey> {}

/**
 * @public
 */
export type IDBCursorDirection = "next" | "nextunique" | "prev" | "prevunique";

/**
 * This IndexedDB API interface represents a cursor for traversing or
 * iterating over multiple records in a database.
 *
 * @public
 */
export interface IDBCursor {
  /**
   * Returns the direction ("next", "nextunique", "prev" or "prevunique") of the cursor.
   */
  readonly direction: IDBCursorDirection;
  /**
   * Returns the key of the cursor. Throws a "InvalidStateError" DOMException if the cursor is advancing or is finished.
   */
  readonly key: IDBValidKey;
  /**
   * Returns the effective key of the cursor. Throws a "InvalidStateError" DOMException if the cursor is advancing or is finished.
   */
  readonly primaryKey: IDBValidKey;
  /**
   * Returns the IDBObjectStore or IDBIndex the cursor was opened from.
   */
  readonly source: IDBObjectStore | IDBIndex;
  /**
   * Advances the cursor through the next count records in range.
   */
  advance(count: number): void;
  /**
   * Advances the cursor to the next record in range.
   */
  continue(key?: IDBValidKey): void;
  /**
   * Advances the cursor to the next record in range matching or after key and primaryKey. Throws an "InvalidAccessError" DOMException if the source is not an index.
   */
  continuePrimaryKey(key: IDBValidKey, primaryKey: IDBValidKey): void;
  /**
   * Delete the record pointed at by the cursor with a new value.
   *
   * If successful, request's result will be undefined.
   */
  delete(): IDBRequest<undefined>;
  /**
   * Updated the record pointed at by the cursor with a new value.
   *
   * Throws a "DataError" DOMException if the effective object store uses in-line keys and the key would have changed.
   *
   * If successful, request's result will be the record's key.
   */
  update(value: any): IDBRequest<IDBValidKey>;
}

/**
 * This IndexedDB API interface represents a cursor for traversing or
 * iterating over multiple records in a database. It is the same as the
 * IDBCursor, except that it includes the value property.
 *
 * @public
 */
export interface IDBCursorWithValue extends IDBCursor {
  /**
   * Returns the cursor's current value.
   */
  readonly value: any;
}

/**
 * @public
 */
export interface IDBDatabaseEventMap {
  abort: Event;
  close: Event;
  error: Event;
  versionchange: IDBVersionChangeEvent;
}

/**
 * This IndexedDB API interface provides a connection to a database; you can
 * use an IDBDatabase object to open a transaction on your database then
 * create, manipulate, and delete objects (data) in that database. The
 * interface provides the only way to get and manage versions of the database.
 *
 * @public
 */
export interface IDBDatabase extends EventTarget {
  /**
   * Returns the name of the database.
   */
  readonly name: string;
  /**
   * Returns a list of the names of object stores in the database.
   */
  readonly objectStoreNames: DOMStringList;
  onabort: ((this: IDBDatabase, ev: Event) => any) | null;
  onclose: ((this: IDBDatabase, ev: Event) => any) | null;
  onerror: ((this: IDBDatabase, ev: Event) => any) | null;
  onversionchange:
    | ((this: IDBDatabase, ev: IDBVersionChangeEvent) => any)
    | null;
  /**
   * Returns the version of the database.
   */
  readonly version: number;
  /**
   * Closes the connection once all running transactions have finished.
   */
  close(): void;
  /**
   * Creates a new object store with the given name and options and returns a new IDBObjectStore.
   *
   * Throws a "InvalidStateError" DOMException if not called within an upgrade transaction.
   */
  createObjectStore(
    name: string,
    optionalParameters?: IDBObjectStoreParameters,
  ): IDBObjectStore;
  /**
   * Deletes the object store with the given name.
   *
   * Throws a "InvalidStateError" DOMException if not called within an upgrade transaction.
   */
  deleteObjectStore(name: string): void;
  /**
   * Returns a new transaction with the given mode ("readonly" or "readwrite") and scope which can be a single object store name or an array of names.
   */
  transaction(
    storeNames: string | string[],
    mode?: IDBTransactionMode,
  ): IDBTransaction;
  addEventListener<K extends keyof IDBDatabaseEventMap>(
    type: K,
    listener: (this: IDBDatabase, ev: IDBDatabaseEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof IDBDatabaseEventMap>(
    type: K,
    listener: (this: IDBDatabase, ev: IDBDatabaseEventMap[K]) => any,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

/**
 * @public
 */
export interface IDBFactory {
  /**
   * Compares two values as keys. Returns -1 if key1 precedes key2, 1 if key2 precedes key1, and 0 if the keys are equal.
   *
   * Throws a "DataError" DOMException if either input is not a valid key.
   */
  cmp(first: any, second: any): number;
  /**
   * Attempts to delete the named database. If the database already exists and
   * there are open connections that don't close in response to a versionchange
   * event, the request will be blocked until all they close. If the request is
   * successful request's result will be null.
   */
  deleteDatabase(name: string): IDBOpenDBRequest;
  /**
   * Attempts to open a connection to the named database with the current
   * version, or 1 if it does not already exist. If the request is successful
   * request's result will be the connection.
   */
  open(name: string, version?: number): IDBOpenDBRequest;
}

/**
 * IDBIndex interface of the IndexedDB API provides asynchronous access to an
 * index in a database. An index is a kind of object store for looking up
 * records in another object store, called the referenced object store. You use
 * this interface to retrieve data.
 *
 * @public
 */
export interface IDBIndex {
  readonly keyPath: string | string[];
  readonly multiEntry: boolean;
  /**
   * Returns the name of the index.
   */
  name: string;
  /**
   * Returns the IDBObjectStore the index belongs to.
   */
  readonly objectStore: IDBObjectStore;
  readonly unique: boolean;
  /**
   * Retrieves the number of records matching the given key or key range in query.
   *
   * If successful, request's result will be the count.
   */
  count(key?: IDBValidKey | IDBKeyRange): IDBRequest<number>;
  /**
   * Retrieves the value of the first record matching the given key or key range in query.
   *
   * If successful, request's result will be the value, or undefined if there was no matching record.
   */
  get(key: IDBValidKey | IDBKeyRange): IDBRequest<any | undefined>;
  /**
   * Retrieves the values of the records matching the given key or key range in query (up to count if given).
   *
   * If successful, request's result will be an Array of the values.
   */
  getAll(
    query?: IDBValidKey | IDBKeyRange | null,
    count?: number,
  ): IDBRequest<any[]>;
  /**
   * Retrieves the keys of records matching the given key or key range in query (up to count if given).
   *
   * If successful, request's result will be an Array of the keys.
   */
  getAllKeys(
    query?: IDBValidKey | IDBKeyRange | null,
    count?: number,
  ): IDBRequest<IDBValidKey[]>;
  /**
   * Retrieves the key of the first record matching the given key or key range in query.
   *
   * If successful, request's result will be the key, or undefined if there was no matching record.
   */
  getKey(key: IDBValidKey | IDBKeyRange): IDBRequest<IDBValidKey | undefined>;
  /**
   * Opens a cursor over the records matching query, ordered by direction. If query is null, all records in index are matched.
   *
   * If successful, request's result will be an IDBCursorWithValue, or null if there were no matching records.
   */
  openCursor(
    query?: IDBValidKey | IDBKeyRange | null,
    direction?: IDBCursorDirection,
  ): IDBRequest<IDBCursorWithValue | null>;
  /**
   * Opens a cursor with key only flag set over the records matching query, ordered by direction. If query is null, all records in index are matched.
   *
   * If successful, request's result will be an IDBCursor, or null if there were no matching records.
   */
  openKeyCursor(
    query?: IDBValidKey | IDBKeyRange | null,
    direction?: IDBCursorDirection,
  ): IDBRequest<IDBCursor | null>;
}

/**
 * A key range can be a single value or a range with upper and lower bounds or
 * endpoints. If the key range has both upper and lower bounds, then it is
 * bounded; if it has no bounds, it is unbounded. A bounded key range can
 * either be open (the endpoints are excluded) or closed (the endpoints are
 * included).
 *
 * @public
 */
export interface IDBKeyRange {
  /**
   * Returns lower bound, or undefined if none.
   */
  readonly lower: any;
  /**
   * Returns true if the lower open flag is set, and false otherwise.
   */
  readonly lowerOpen: boolean;
  /**
   * Returns upper bound, or undefined if none.
   */
  readonly upper: any;
  /**
   * Returns true if the upper open flag is set, and false otherwise.
   */
  readonly upperOpen: boolean;
  /**
   * Returns true if key is included in the range, and false otherwise.
   */
  includes(key: any): boolean;
}

/**
 * @public
 */
export interface IDBObjectStore {
  /**
   * Returns true if the store has a key generator, and false otherwise.
   */
  readonly autoIncrement: boolean;
  /**
   * Returns a list of the names of indexes in the store.
   */
  readonly indexNames: DOMStringList;
  /**
   * Returns the key path of the store, or null if none.
   */
  readonly keyPath: string | string[];
  /**
   * Returns the name of the store.
   */
  name: string;
  /**
   * Returns the associated transaction.
   */
  readonly transaction: IDBTransaction;
  /**
   * Adds or updates a record in store with the given value and key.
   *
   * If the store uses in-line keys and key is specified a "DataError" DOMException will be thrown.
   *
   * If put() is used, any existing record with the key will be replaced. If add() is used, and if a record with the key already exists the request will fail, with request's error set to a "ConstraintError" DOMException.
   *
   * If successful, request's result will be the record's key.
   */
  add(value: any, key?: IDBValidKey): IDBRequest<IDBValidKey>;
  /**
   * Deletes all records in store.
   *
   * If successful, request's result will be undefined.
   */
  clear(): IDBRequest<undefined>;
  /**
   * Retrieves the number of records matching the given key or key range in query.
   *
   * If successful, request's result will be the count.
   */
  count(key?: IDBValidKey | IDBKeyRange): IDBRequest<number>;
  /**
   * Creates a new index in store with the given name, keyPath and options and returns a new IDBIndex. If the keyPath and options define constraints that cannot be satisfied with the data already in store the upgrade transaction will abort with a "ConstraintError" DOMException.
   *
   * Throws an "InvalidStateError" DOMException if not called within an upgrade transaction.
   */
  createIndex(
    name: string,
    keyPath: string | string[],
    options?: IDBIndexParameters,
  ): IDBIndex;
  /**
   * Deletes records in store with the given key or in the given key range in query.
   *
   * If successful, request's result will be undefined.
   */
  delete(key: IDBValidKey | IDBKeyRange): IDBRequest<undefined>;
  /**
   * Deletes the index in store with the given name.
   *
   * Throws an "InvalidStateError" DOMException if not called within an upgrade transaction.
   */
  deleteIndex(name: string): void;
  /**
   * Retrieves the value of the first record matching the given key or key range in query.
   *
   * If successful, request's result will be the value, or undefined if there was no matching record.
   */
  get(query: IDBValidKey | IDBKeyRange): IDBRequest<any | undefined>;
  /**
   * Retrieves the values of the records matching the given key or key range in query (up to count if given).
   *
   * If successful, request's result will be an Array of the values.
   */
  getAll(
    query?: IDBValidKey | IDBKeyRange | null,
    count?: number,
  ): IDBRequest<any[]>;
  /**
   * Retrieves the keys of records matching the given key or key range in query (up to count if given).
   *
   * If successful, request's result will be an Array of the keys.
   */
  getAllKeys(
    query?: IDBValidKey | IDBKeyRange | null,
    count?: number,
  ): IDBRequest<IDBValidKey[]>;
  /**
   * Retrieves the key of the first record matching the given key or key range in query.
   *
   * If successful, request's result will be the key, or undefined if there was no matching record.
   */
  getKey(query: IDBValidKey | IDBKeyRange): IDBRequest<IDBValidKey | undefined>;
  index(name: string): IDBIndex;
  /**
   * Opens a cursor over the records matching query, ordered by direction. If query is null, all records in store are matched.
   *
   * If successful, request's result will be an IDBCursorWithValue pointing at the first matching record, or null if there were no matching records.
   */
  openCursor(
    query?: IDBValidKey | IDBKeyRange | null,
    direction?: IDBCursorDirection,
  ): IDBRequest<IDBCursorWithValue | null>;
  /**
   * Opens a cursor with key only flag set over the records matching query, ordered by direction. If query is null, all records in store are matched.
   *
   * If successful, request's result will be an IDBCursor pointing at the first matching record, or null if there were no matching records.
   */
  openKeyCursor(
    query?: IDBValidKey | IDBKeyRange | null,
    direction?: IDBCursorDirection,
  ): IDBRequest<IDBCursor | null>;
  /**
   * Adds or updates a record in store with the given value and key.
   *
   * If the store uses in-line keys and key is specified a "DataError" DOMException will be thrown.
   *
   * If put() is used, any existing record with the key will be replaced. If add() is used, and if a record with the key already exists the request will fail, with request's error set to a "ConstraintError" DOMException.
   *
   * If successful, request's result will be the record's key.
   */
  put(value: any, key?: IDBValidKey): IDBRequest<IDBValidKey>;
}

/**
 * @public
 */
export interface IDBOpenDBRequestEventMap extends IDBRequestEventMap {
  blocked: Event;
  upgradeneeded: IDBVersionChangeEvent;
}

/**
 * Also inherits methods from its parents IDBRequest and EventTarget.
 *
 * @public
 */
export interface IDBOpenDBRequest extends IDBRequest<IDBDatabase> {
  onblocked: ((this: IDBOpenDBRequest, ev: Event) => any) | null;
  onupgradeneeded:
    | ((this: IDBOpenDBRequest, ev: IDBVersionChangeEvent) => any)
    | null;
  addEventListener<K extends keyof IDBOpenDBRequestEventMap>(
    type: K,
    listener: (this: IDBOpenDBRequest, ev: IDBOpenDBRequestEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof IDBOpenDBRequestEventMap>(
    type: K,
    listener: (this: IDBOpenDBRequest, ev: IDBOpenDBRequestEventMap[K]) => any,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

/**
 * @public
 */
export type IDBRequestReadyState = "done" | "pending";

/**
 * @public
 */
export interface IDBRequestEventMap {
  error: Event;
  success: Event;
}

/**
 * An abnormal event (called an exception) which occurs as a result of calling
 * a method or accessing a property of a web API.
 *
 * @public
 */
export interface DOMException {
  readonly code: number;
  readonly message: string;
  readonly name: string;
  readonly ABORT_ERR: number;
  readonly DATA_CLONE_ERR: number;
  readonly DOMSTRING_SIZE_ERR: number;
  readonly HIERARCHY_REQUEST_ERR: number;
  readonly INDEX_SIZE_ERR: number;
  readonly INUSE_ATTRIBUTE_ERR: number;
  readonly INVALID_ACCESS_ERR: number;
  readonly INVALID_CHARACTER_ERR: number;
  readonly INVALID_MODIFICATION_ERR: number;
  readonly INVALID_NODE_TYPE_ERR: number;
  readonly INVALID_STATE_ERR: number;
  readonly NAMESPACE_ERR: number;
  readonly NETWORK_ERR: number;
  readonly NOT_FOUND_ERR: number;
  readonly NOT_SUPPORTED_ERR: number;
  readonly NO_DATA_ALLOWED_ERR: number;
  readonly NO_MODIFICATION_ALLOWED_ERR: number;
  readonly QUOTA_EXCEEDED_ERR: number;
  readonly SECURITY_ERR: number;
  readonly SYNTAX_ERR: number;
  readonly TIMEOUT_ERR: number;
  readonly TYPE_MISMATCH_ERR: number;
  readonly URL_MISMATCH_ERR: number;
  readonly VALIDATION_ERR: number;
  readonly WRONG_DOCUMENT_ERR: number;
}

/**
 * The request object does not initially contain any information about the
 * result of the operation, but once information becomes available, an event is
 * fired on the request, and the information becomes available through the
 * properties of the IDBRequest instance.
 *
 * @public
 */
export interface IDBRequest<T = any> extends EventTarget {
  /**
   * When a request is completed, returns the error (a DOMException), or null if the request succeeded. Throws a "InvalidStateError" DOMException if the request is still pending.
   */
  readonly error: DOMException | null;
  onerror: ((this: IDBRequest<T>, ev: Event) => any) | null;
  onsuccess: ((this: IDBRequest<T>, ev: Event) => any) | null;
  /**
   * Returns "pending" until a request is complete, then returns "done".
   */
  readonly readyState: IDBRequestReadyState;
  /**
   * When a request is completed, returns the result, or undefined if the request failed. Throws a "InvalidStateError" DOMException if the request is still pending.
   */
  readonly result: T;
  /**
   * Returns the IDBObjectStore, IDBIndex, or IDBCursor the request was made against, or null if is was an open request.
   */
  readonly source: IDBObjectStore | IDBIndex | IDBCursor;
  /**
   * Returns the IDBTransaction the request was made within. If this as an open request, then it returns an upgrade transaction while it is running, or null otherwise.
   */
  readonly transaction: IDBTransaction | null;
  addEventListener<K extends keyof IDBRequestEventMap>(
    type: K,
    listener: (this: IDBRequest<T>, ev: IDBRequestEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof IDBRequestEventMap>(
    type: K,
    listener: (this: IDBRequest<T>, ev: IDBRequestEventMap[K]) => any,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

/**
 * @public
 */
export interface IDBTransactionEventMap {
  abort: Event;
  complete: Event;
  error: Event;
}

/**
 * @public
 */
export interface IDBTransaction extends EventTarget {
  /**
   * Returns the transaction's connection.
   */
  readonly db: IDBDatabase;
  /**
   * If the transaction was aborted, returns the error (a DOMException) providing the reason.
   */
  readonly error: DOMException;
  /**
   * Returns the mode the transaction was created with ("readonly" or "readwrite"), or "versionchange" for an upgrade transaction.
   */
  readonly mode: IDBTransactionMode;
  /**
   * Returns a list of the names of object stores in the transaction's scope. For an upgrade transaction this is all object stores in the database.
   */
  readonly objectStoreNames: DOMStringList;
  onabort: ((this: IDBTransaction, ev: Event) => any) | null;
  oncomplete: ((this: IDBTransaction, ev: Event) => any) | null;
  onerror: ((this: IDBTransaction, ev: Event) => any) | null;
  /**
   * Aborts the transaction. All pending requests will fail with a "AbortError" DOMException and all changes made to the database will be reverted.
   */
  abort(): void;
  /**
   * Returns an IDBObjectStore in the transaction's scope.
   */
  objectStore(name: string): IDBObjectStore;
  addEventListener<K extends keyof IDBTransactionEventMap>(
    type: K,
    listener: (this: IDBTransaction, ev: IDBTransactionEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof IDBTransactionEventMap>(
    type: K,
    listener: (this: IDBTransaction, ev: IDBTransactionEventMap[K]) => any,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

/**
 * This IndexedDB API interface indicates that the version of the database has
 * changed, as the result of an IDBOpenDBRequest.onupgradeneeded event handler
 * function.
 *
 * @public
 */
export interface IDBVersionChangeEvent extends Event {
  readonly newVersion: number | null;
  readonly oldVersion: number;
}
