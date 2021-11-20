/*
 This file is part of TALER
 (C) 2016 GNUnet e.V.

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
 * Print the syntax tree of a TypeScript program.
 *
 * @author Florian Dold
 */

"use strict";

import { readFileSync } from "fs";
import { execSync } from "child_process";
import * as ts from "typescript";


export function processFile(sourceFile: ts.SourceFile) {
  processNode(sourceFile);

  function processNode(node: ts.Node, level=0) {
    let indent = "";
    for (let i = 0; i < level; i++) {
      indent = indent + " ";
    }
    console.log(indent + ts.SyntaxKind[node.kind]);
    ts.forEachChild(node, (n) => processNode(n, level+1));
  }
}

const fileNames = process.argv.slice(2);

fileNames.forEach(fileName => {
  let sourceFile = ts.createSourceFile(fileName, readFileSync(fileName).toString(), ts.ScriptTarget.ES2016, /*setParentNodes */ true);
  processFile(sourceFile);
});
