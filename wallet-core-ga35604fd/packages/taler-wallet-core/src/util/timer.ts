/*
 This file is part of GNU Taler
 (C) 2017-2019 Taler Systems S.A.

 GNU Taler is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 GNU Taler is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 GNU Taler; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

/**
 * Cross-platform timers.
 *
 * NodeJS and the browser use slightly different timer API,
 * this abstracts over these differences.
 */

/**
 * Imports.
 */
import { Logger, Duration } from "@gnu-taler/taler-util";

const logger = new Logger("timer.ts");

/**
 * Cancelable timer.
 */
export interface TimerHandle {
  clear(): void;

  /**
   * Make sure the event loop exits when the timer is the
   * only event left.  Has no effect in the browser.
   */
  unref(): void;
}

class IntervalHandle {
  constructor(public h: any) {}

  clear(): void {
    clearInterval(this.h);
  }

  /**
   * Make sure the event loop exits when the timer is the
   * only event left.  Has no effect in the browser.
   */
  unref(): void {
    if (typeof this.h === "object") {
      this.h.unref();
    }
  }
}

class TimeoutHandle {
  constructor(public h: any) {}

  clear(): void {
    clearTimeout(this.h);
  }

  /**
   * Make sure the event loop exits when the timer is the
   * only event left.  Has no effect in the browser.
   */
  unref(): void {
    if (typeof this.h === "object") {
      this.h.unref();
    }
  }
}

/**
 * Get a performance counter in nanoseconds.
 */
export const performanceNow: () => bigint = (() => {
  // @ts-ignore
  if (typeof process !== "undefined" && process.hrtime) {
    return () => {
      return process.hrtime.bigint();
    };
  }

  // @ts-ignore
  if (typeof performance !== "undefined") {
    // @ts-ignore
    return () => BigInt(Math.floor(performance.now() * 1000)) * BigInt(1000);
  }

  return () => BigInt(0);
})();

/**
 * Call a function every time the delay given in milliseconds passes.
 */
export function every(delayMs: number, callback: () => void): TimerHandle {
  return new IntervalHandle(setInterval(callback, delayMs));
}

/**
 * Call a function after the delay given in milliseconds passes.
 */
export function after(delayMs: number, callback: () => void): TimerHandle {
  return new TimeoutHandle(setTimeout(callback, delayMs));
}

const nullTimerHandle = {
  clear() {
    // do nothing
    return;
  },
  unref() {
    // do nothing
    return;
  },
};

/**
 * Group of timers that can be destroyed at once.
 */
export class TimerGroup {
  private stopped = false;

  private timerMap: { [index: number]: TimerHandle } = {};

  private idGen = 1;

  stopCurrentAndFutureTimers(): void {
    this.stopped = true;
    for (const x in this.timerMap) {
      if (!this.timerMap.hasOwnProperty(x)) {
        continue;
      }
      this.timerMap[x].clear();
      delete this.timerMap[x];
    }
  }

  resolveAfter(delayMs: Duration): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (delayMs.d_ms !== "forever") {
        this.after(delayMs.d_ms, () => {
          resolve();
        });
      }
    });
  }

  after(delayMs: number, callback: () => void): TimerHandle {
    if (this.stopped) {
      logger.warn("dropping timer since timer group is stopped");
      return nullTimerHandle;
    }
    const h = after(delayMs, callback);
    const myId = this.idGen++;
    this.timerMap[myId] = h;

    const tm = this.timerMap;

    return {
      clear() {
        h.clear();
        delete tm[myId];
      },
      unref() {
        h.unref();
      },
    };
  }

  every(delayMs: number, callback: () => void): TimerHandle {
    if (this.stopped) {
      logger.warn("dropping timer since timer group is stopped");
      return nullTimerHandle;
    }
    const h = every(delayMs, callback);
    const myId = this.idGen++;
    this.timerMap[myId] = h;

    const tm = this.timerMap;

    return {
      clear() {
        h.clear();
        delete tm[myId];
      },
      unref() {
        h.unref();
      },
    };
  }
}
