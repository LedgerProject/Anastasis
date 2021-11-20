/*
 This file is part of GNU Taler
 (C) 2019 GNUnet e.V.

 TALER is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 TALER is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 TALER; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

export interface OpenedPromise<T> {
  promise: Promise<T>;
  resolve: (val: T) => void;
  reject: (err: any) => void;
}

/**
 * Get an unresolved promise together with its extracted resolve / reject
 * function.
 */
export function openPromise<T>(): OpenedPromise<T> {
  let resolve: ((x?: any) => void) | null = null;
  let reject: ((reason?: any) => void) | null = null;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  if (!(resolve && reject)) {
    // Never happens, unless JS implementation is broken
    throw Error();
  }
  return { resolve, reject, promise };
}

export class AsyncCondition {
  private _waitPromise: Promise<void>;
  private _resolveWaitPromise: (val: void) => void;
  constructor() {
    const op = openPromise<void>();
    this._waitPromise = op.promise;
    this._resolveWaitPromise = op.resolve;
  }

  wait(): Promise<void> {
    return this._waitPromise;
  }

  trigger(): void {
    this._resolveWaitPromise();
    const op = openPromise<void>();
    this._waitPromise = op.promise;
    this._resolveWaitPromise = op.resolve;
  }
}
