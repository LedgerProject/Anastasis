/*
 This file is part of GNU Taler
 (C) 2021 Taler Systems S.A.

 GNU Taler is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 GNU Taler is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 GNU Taler; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

import { canonicalJson, Logger } from "@gnu-taler/taler-util";
import { kdf } from "@gnu-taler/taler-util";
import {
  decodeCrock,
  encodeCrock,
  getRandomBytes,
  hash,
  stringToBytes,
} from "@gnu-taler/taler-util";

const logger = new Logger("contractTerms.ts");

export namespace ContractTermsUtil {
  export type PathPredicate = (path: string[]) => boolean;

  /**
   * Scrub all forgettable members from an object.
   */
  export function scrub(anyJson: any): any {
    return forgetAllImpl(anyJson, [], () => true);
  }

  /**
   * Recursively forget all forgettable members of an object,
   * where the path matches a predicate.
   */
  export function forgetAll(anyJson: any, pred: PathPredicate): any {
    return forgetAllImpl(anyJson, [], pred);
  }

  function forgetAllImpl(
    anyJson: any,
    path: string[],
    pred: PathPredicate,
  ): any {
    const dup = JSON.parse(JSON.stringify(anyJson));
    if (Array.isArray(dup)) {
      for (let i = 0; i < dup.length; i++) {
        dup[i] = forgetAllImpl(dup[i], [...path, `${i}`], pred);
      }
    } else if (typeof dup === "object" && dup != null) {
      if (typeof dup.$forgettable === "object") {
        for (const x of Object.keys(dup.$forgettable)) {
          if (!pred([...path, x])) {
            continue;
          }
          if (!dup.$forgotten) {
            dup.$forgotten = {};
          }
          if (!dup.$forgotten[x]) {
            const membValCanon = stringToBytes(
              canonicalJson(scrub(dup[x])) + "\0",
            );
            const membSalt = stringToBytes(dup.$forgettable[x] + "\0");
            const h = kdf(64, membValCanon, membSalt, new Uint8Array([]));
            dup.$forgotten[x] = encodeCrock(h);
          }
          delete dup[x];
          delete dup.$forgettable[x];
        }
        if (Object.keys(dup.$forgettable).length === 0) {
          delete dup.$forgettable;
        }
      }
      for (const x of Object.keys(dup)) {
        if (x.startsWith("$")) {
          continue;
        }
        dup[x] = forgetAllImpl(dup[x], [...path, x], pred);
      }
    }
    return dup;
  }

  /**
   * Generate a salt for all members marked as forgettable,
   * but which don't have an actual salt yet.
   */
  export function saltForgettable(anyJson: any): any {
    const dup = JSON.parse(JSON.stringify(anyJson));
    if (Array.isArray(dup)) {
      for (let i = 0; i < dup.length; i++) {
        dup[i] = saltForgettable(dup[i]);
      }
    } else if (typeof dup === "object" && dup !== null) {
      if (typeof dup.$forgettable === "object") {
        for (const k of Object.keys(dup.$forgettable)) {
          if (dup.$forgettable[k] === true) {
            dup.$forgettable[k] = encodeCrock(getRandomBytes(32));
          }
        }
      }
      for (const x of Object.keys(dup)) {
        if (x.startsWith("$")) {
          continue;
        }
        dup[x] = saltForgettable(dup[x]);
      }
    }
    return dup;
  }

  const nameRegex = /^[0-9A-Za-z_]+$/;

  /**
   * Check that the given JSON object is well-formed with regards
   * to forgettable fields and other restrictions for forgettable JSON.
   */
  export function validateForgettable(anyJson: any): boolean {
    if (typeof anyJson === "string") {
      return true;
    }
    if (typeof anyJson === "number") {
      return (
        Number.isInteger(anyJson) &&
        anyJson >= Number.MIN_SAFE_INTEGER &&
        anyJson <= Number.MAX_SAFE_INTEGER
      );
    }
    if (typeof anyJson === "boolean") {
      return true;
    }
    if (anyJson === null) {
      return true;
    }
    if (Array.isArray(anyJson)) {
      return anyJson.every((x) => validateForgettable(x));
    }
    if (typeof anyJson === "object") {
      for (const k of Object.keys(anyJson)) {
        if (k.match(nameRegex)) {
          if (validateForgettable(anyJson[k])) {
            continue;
          } else {
            return false;
          }
        }
        if (k === "$forgettable") {
          const fga = anyJson.$forgettable;
          if (!fga || typeof fga !== "object") {
            return false;
          }
          for (const fk of Object.keys(fga)) {
            if (!fk.match(nameRegex)) {
              return false;
            }
            if (!(fk in anyJson)) {
              return false;
            }
            const fv = anyJson.$forgettable[fk];
            if (typeof fv !== "string") {
              return false;
            }
          }
        } else if (k === "$forgotten") {
          const fgo = anyJson.$forgotten;
          if (!fgo || typeof fgo !== "object") {
            return false;
          }
          for (const fk of Object.keys(fgo)) {
            if (!fk.match(nameRegex)) {
              return false;
            }
            // Check that the value has actually been forgotten.
            if (fk in anyJson) {
              return false;
            }
            const fv = anyJson.$forgotten[fk];
            if (typeof fv !== "string") {
              return false;
            }
            try {
              const decFv = decodeCrock(fv);
              if (decFv.length != 64) {
                return false;
              }
            } catch (e) {
              return false;
            }
            // Check that salt has been deleted after forgetting.
            if (anyJson.$forgettable?.[k] !== undefined) {
              return false;
            }
          }
        } else {
          return false;
        }
      }
      return true;
    }
    return false;
  }

  /**
   * Check that no forgettable information has been forgotten.
   *
   * Must only be called on an object already validated with validateForgettable.
   */
  export function validateNothingForgotten(contractTerms: any): boolean {
    throw Error("not implemented yet");
  }

  /**
   * Hash a contract terms object.  Forgettable fields
   * are scrubbed and JSON canonicalization is applied
   * before hashing.
   */
  export function hashContractTerms(contractTerms: unknown): string {
    const cleaned = scrub(contractTerms);
    const canon = canonicalJson(cleaned) + "\0";
    const bytes = stringToBytes(canon);
    logger.info(`contract terms before hashing: ${encodeCrock(bytes)}`);
    return encodeCrock(hash(bytes));
  }
}
