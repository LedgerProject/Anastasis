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
 * Helpers for relative and absolute time.
 */

/**
 * Imports.
 */
import { Codec, renderContext, Context } from "./codec.js";

export class Timestamp {
  /**
   * Timestamp in milliseconds.
   */
  readonly t_ms: number | "never";
}

export interface Duration {
  /**
   * Duration in milliseconds.
   */
  readonly d_ms: number | "forever";
}

let timeshift = 0;

export function setDangerousTimetravel(dt: number): void {
  timeshift = dt;
}

export function getTimestampNow(): Timestamp {
  return {
    t_ms: new Date().getTime() + timeshift,
  };
}

export function isTimestampExpired(t: Timestamp) {
  return timestampCmp(t, getTimestampNow()) <= 0;
}

export function getDurationRemaining(
  deadline: Timestamp,
  now = getTimestampNow(),
): Duration {
  if (deadline.t_ms === "never") {
    return { d_ms: "forever" };
  }
  if (now.t_ms === "never") {
    throw Error("invalid argument for 'now'");
  }
  if (deadline.t_ms < now.t_ms) {
    return { d_ms: 0 };
  }
  return { d_ms: deadline.t_ms - now.t_ms };
}

export namespace Duration {
  export const getRemaining = getDurationRemaining;
  export function toIntegerYears(d: Duration): number {
    if (typeof d.d_ms !== "number") {
      throw Error("infinite duration");
    }
    return Math.ceil(d.d_ms / 1000 / 60 / 60 / 24 / 365);
  }
}

export namespace Timestamp {
  export const min = timestampMin;
}

export function timestampMin(t1: Timestamp, t2: Timestamp): Timestamp {
  if (t1.t_ms === "never") {
    return { t_ms: t2.t_ms };
  }
  if (t2.t_ms === "never") {
    return { t_ms: t2.t_ms };
  }
  return { t_ms: Math.min(t1.t_ms, t2.t_ms) };
}

export function timestampMax(t1: Timestamp, t2: Timestamp): Timestamp {
  if (t1.t_ms === "never") {
    return { t_ms: "never" };
  }
  if (t2.t_ms === "never") {
    return { t_ms: "never" };
  }
  return { t_ms: Math.max(t1.t_ms, t2.t_ms) };
}

const SECONDS = 1000;
const MINUTES = SECONDS * 60;
const HOURS = MINUTES * 60;
const DAYS = HOURS * 24;
const MONTHS = DAYS * 30;
const YEARS = DAYS * 365;

export function durationFromSpec(spec: {
  seconds?: number;
  minutes?: number;
  hours?: number;
  days?: number;
  months?: number;
  years?: number;
}): Duration {
  let d_ms = 0;
  d_ms += (spec.seconds ?? 0) * SECONDS;
  d_ms += (spec.minutes ?? 0) * MINUTES;
  d_ms += (spec.hours ?? 0) * HOURS;
  d_ms += (spec.days ?? 0) * DAYS;
  d_ms += (spec.months ?? 0) * MONTHS;
  d_ms += (spec.years ?? 0) * YEARS;
  return { d_ms };
}

/**
 * Truncate a timestamp so that that it represents a multiple
 * of seconds.  The timestamp is always rounded down.
 */
export function timestampTruncateToSecond(t1: Timestamp): Timestamp {
  if (t1.t_ms === "never") {
    return { t_ms: "never" };
  }
  return {
    t_ms: Math.floor(t1.t_ms / 1000) * 1000,
  };
}

export function durationMin(d1: Duration, d2: Duration): Duration {
  if (d1.d_ms === "forever") {
    return { d_ms: d2.d_ms };
  }
  if (d2.d_ms === "forever") {
    return { d_ms: d2.d_ms };
  }
  return { d_ms: Math.min(d1.d_ms, d2.d_ms) };
}

export function durationMax(d1: Duration, d2: Duration): Duration {
  if (d1.d_ms === "forever") {
    return { d_ms: "forever" };
  }
  if (d2.d_ms === "forever") {
    return { d_ms: "forever" };
  }
  return { d_ms: Math.max(d1.d_ms, d2.d_ms) };
}

export function durationMul(d: Duration, n: number): Duration {
  if (d.d_ms === "forever") {
    return { d_ms: "forever" };
  }
  return { d_ms: Math.round(d.d_ms * n) };
}

export function durationAdd(d1: Duration, d2: Duration): Duration {
  if (d1.d_ms === "forever" || d2.d_ms === "forever") {
    return { d_ms: "forever" };
  }
  return { d_ms: d1.d_ms + d2.d_ms };
}

export function timestampCmp(t1: Timestamp, t2: Timestamp): number {
  if (t1.t_ms === "never") {
    if (t2.t_ms === "never") {
      return 0;
    }
    return 1;
  }
  if (t2.t_ms === "never") {
    return -1;
  }
  if (t1.t_ms == t2.t_ms) {
    return 0;
  }
  if (t1.t_ms > t2.t_ms) {
    return 1;
  }
  return -1;
}

export function timestampAddDuration(t1: Timestamp, d: Duration): Timestamp {
  if (t1.t_ms === "never" || d.d_ms === "forever") {
    return { t_ms: "never" };
  }
  return { t_ms: t1.t_ms + d.d_ms };
}

export function timestampSubtractDuraction(
  t1: Timestamp,
  d: Duration,
): Timestamp {
  if (t1.t_ms === "never") {
    return { t_ms: "never" };
  }
  if (d.d_ms === "forever") {
    return { t_ms: 0 };
  }
  return { t_ms: Math.max(0, t1.t_ms - d.d_ms) };
}

export function stringifyTimestamp(t: Timestamp): string {
  if (t.t_ms === "never") {
    return "never";
  }
  return new Date(t.t_ms).toISOString();
}

export function timestampDifference(t1: Timestamp, t2: Timestamp): Duration {
  if (t1.t_ms === "never") {
    return { d_ms: "forever" };
  }
  if (t2.t_ms === "never") {
    return { d_ms: "forever" };
  }
  return { d_ms: Math.abs(t1.t_ms - t2.t_ms) };
}

export function timestampToIsoString(t: Timestamp): string {
  if (t.t_ms === "never") {
    return "<never>";
  } else {
    return new Date(t.t_ms).toISOString();
  }
}

export function timestampIsBetween(
  t: Timestamp,
  start: Timestamp,
  end: Timestamp,
): boolean {
  if (timestampCmp(t, start) < 0) {
    return false;
  }
  if (timestampCmp(t, end) > 0) {
    return false;
  }
  return true;
}

export const codecForTimestamp: Codec<Timestamp> = {
  decode(x: any, c?: Context): Timestamp {
    const t_ms = x.t_ms;
    if (typeof t_ms === "string") {
      if (t_ms === "never") {
        return { t_ms: "never" };
      }
      throw Error(`expected timestamp at ${renderContext(c)}`);
    }
    if (typeof t_ms === "number") {
      return { t_ms };
    }
    throw Error(`expected timestamp at ${renderContext(c)}`);
  },
};

export const codecForDuration: Codec<Duration> = {
  decode(x: any, c?: Context): Duration {
    const d_ms = x.d_ms;
    if (typeof d_ms === "string") {
      if (d_ms === "forever") {
        return { d_ms: "forever" };
      }
      throw Error(`expected duration at ${renderContext(c)}`);
    }
    if (typeof d_ms === "number") {
      return { d_ms };
    }
    throw Error(`expected duration at ${renderContext(c)}`);
  },
};
