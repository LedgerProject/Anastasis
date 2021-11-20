/*
 This file is part of GNU Taler
 (C) 2019 GNUnet e.V.

 GNU Taler is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 GNU Taler is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 GNU Taler; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

interface MemoEntry<T> {
  p: Promise<T>;
  t: number;
  n: number;
}

export class AsyncOpMemoMap<T> {
  private n = 0;
  private memoMap: { [k: string]: MemoEntry<T> } = {};

  private cleanUp(key: string, n: number): void {
    const r = this.memoMap[key];
    if (r && r.n === n) {
      delete this.memoMap[key];
    }
  }

  memo(key: string, pg: () => Promise<T>): Promise<T> {
    const res = this.memoMap[key];
    if (res) {
      return res.p;
    }
    const n = this.n++;
    // Wrap the operation in case it immediately throws
    const p = Promise.resolve().then(() => pg());
    this.memoMap[key] = {
      p,
      n,
      t: new Date().getTime(),
    };
    return p.finally(() => {
      this.cleanUp(key, n);
    });
  }
  clear(): void {
    this.memoMap = {};
  }
}

export class AsyncOpMemoSingle<T> {
  private n = 0;
  private memoEntry: MemoEntry<T> | undefined;

  private cleanUp(n: number): void {
    if (this.memoEntry && this.memoEntry.n === n) {
      this.memoEntry = undefined;
    }
  }

  memo(pg: () => Promise<T>): Promise<T> {
    const res = this.memoEntry;
    if (res) {
      return res.p;
    }
    const n = this.n++;
    // Wrap the operation in case it immediately throws
    const p = Promise.resolve().then(() => pg());
    p.finally(() => {
      this.cleanUp(n);
    });
    this.memoEntry = {
      p,
      n,
      t: new Date().getTime(),
    };
    return p;
  }
  clear(): void {
    this.memoEntry = undefined;
  }
}
