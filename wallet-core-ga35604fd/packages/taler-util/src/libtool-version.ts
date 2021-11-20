/*
 This file is part of TALER
 (C) 2017 GNUnet e.V.

 TALER is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 TALER is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 TALER; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

/**
 * Semantic versioning, but libtool-style.
 * See https://www.gnu.org/software/libtool/manual/html_node/Libtool-versioning.html
 */

/**
 * Result of comparing two libtool versions.
 */
export interface VersionMatchResult {
  /**
   * Is the first version compatible with the second?
   */
  compatible: boolean;
  /**
   * Is the first version older (-1), newser (+1) or
   * identical (0)?
   */
  currentCmp: number;
}

interface Version {
  current: number;
  revision: number;
  age: number;
}

/**
 * Compare two libtool-style version strings.
 */
export function compare(
  me: string,
  other: string,
): VersionMatchResult | undefined {
  const meVer = parseVersion(me);
  const otherVer = parseVersion(other);

  if (!(meVer && otherVer)) {
    return undefined;
  }

  const compatible =
    meVer.current - meVer.age <= otherVer.current &&
    meVer.current >= otherVer.current - otherVer.age;

  const currentCmp = Math.sign(meVer.current - otherVer.current);

  return { compatible, currentCmp };
}

function parseVersion(v: string): Version | undefined {
  const [currentStr, revisionStr, ageStr, ...rest] = v.split(":");
  if (rest.length !== 0) {
    return undefined;
  }
  const current = Number.parseInt(currentStr);
  const revision = Number.parseInt(revisionStr);
  const age = Number.parseInt(ageStr);

  if (Number.isNaN(current)) {
    return undefined;
  }

  if (Number.isNaN(revision)) {
    return undefined;
  }

  if (Number.isNaN(age)) {
    return undefined;
  }

  return { current, revision, age };
}
