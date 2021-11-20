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

/**
 * Imports.
 */
import path from "path";
import fs from "fs";

/**
 * Resolve an asset name into an absolute filename.
 *
 * The asset file should be placed in the "assets" directory
 * at the top level of the package (i.e. next to package.json).
 */
export function resolveAsset(name: string): string {
  const n = __filename;
  const d = __dirname;
  let assetPath: string;
  // Currently both asset paths are the same.
  // This might change if the file that contains "resolveAsset"
  // ever moves.  Thus, we're keeping the case distinction.
  if (n.endsWith("assets.js")) {
    // We're not bundled.  Path is relative to the current file.
    assetPath = path.resolve(path.join(d, "..", "assets", name));
  } else if (n.endsWith("taler-wallet-cli.js")) {
    // We're bundled.  Currently, this path is the same
    // FIXME:  Take into account some ASSETS environment variable?
    assetPath = path.resolve(path.join(d, "..", "assets", name));
  } else {
    throw Error("Can't resolve asset (unknown)");
  }
  if (!fs.existsSync(assetPath)) {
    throw Error(`Asset '${name} not found'`);
  }
  return assetPath;
}
