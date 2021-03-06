/*
Original work Copyright (C) 2013 Julian Gruber <julian@juliangruber.com>
Modified work Copyright (C) 2021 Taler Systems S.A.

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the "Software"),
to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.
*/

import { balanced } from "./balanced-match.js";

var escSlash = "\0SLASH" + Math.random() + "\0";
var escOpen = "\0OPEN" + Math.random() + "\0";
var escClose = "\0CLOSE" + Math.random() + "\0";
var escComma = "\0COMMA" + Math.random() + "\0";
var escPeriod = "\0PERIOD" + Math.random() + "\0";

/**
 * @return {number}
 */
function numeric(str: string): number {
  return parseInt(str, 10).toString() == str
    ? parseInt(str, 10)
    : str.charCodeAt(0);
}

/**
 * @param {string} str
 */
function escapeBraces(str: string) {
  return str
    .split("\\\\")
    .join(escSlash)
    .split("\\{")
    .join(escOpen)
    .split("\\}")
    .join(escClose)
    .split("\\,")
    .join(escComma)
    .split("\\.")
    .join(escPeriod);
}

/**
 * @param {string} str
 */
function unescapeBraces(str: string) {
  return str
    .split(escSlash)
    .join("\\")
    .split(escOpen)
    .join("{")
    .split(escClose)
    .join("}")
    .split(escComma)
    .join(",")
    .split(escPeriod)
    .join(".");
}

/**
 * Basically just str.split(","), but handling cases
 * where we have nested braced sections, which should be
 * treated as individual members, like {a,{b,c},d}
 * @param {string} str
 */
function parseCommaParts(str: string) {
  if (!str) return [""];

  var parts: string[] = [];
  var m = balanced("{", "}", str);

  if (!m) return str.split(",");

  var pre = m.pre;
  var body = m.body;
  var post = m.post;
  var p = pre.split(",");

  p[p.length - 1] += "{" + body + "}";
  var postParts = parseCommaParts(post);
  if (post.length) {
    p[p.length - 1] += postParts.shift();
    p.push.apply(p, postParts);
  }

  parts.push.apply(parts, p);

  return parts;
}

/**
 * @param {string} str
 */
function expandTop(str: string) {
  if (!str) return [];

  // I don't know why Bash 4.3 does this, but it does.
  // Anything starting with {} will have the first two bytes preserved
  // but *only* at the top level, so {},a}b will not expand to anything,
  // but a{},b}c will be expanded to [a}c,abc].
  // One could argue that this is a bug in Bash, but since the goal of
  // this module is to match Bash's rules, we escape a leading {}
  if (str.substr(0, 2) === "{}") {
    str = "\\{\\}" + str.substr(2);
  }

  return expand(escapeBraces(str), true).map(unescapeBraces);
}

/**
 * @param {string} str
 */
function embrace(str: string) {
  return "{" + str + "}";
}
/**
 * @param {string} el
 */
function isPadded(el: string) {
  return /^-?0\d/.test(el);
}

/**
 * @param {number} i
 * @param {number} y
 */
function lte(i: number, y: number) {
  return i <= y;
}
/**
 * @param {number} i
 * @param {number} y
 */
function gte(i: number, y: number) {
  return i >= y;
}

/**
 * @param {string} str
 * @param {boolean} [isTop]
 */
export function expand(str: string, isTop?: boolean): any {
  /** @type {string[]} */
  var expansions: string[] = [];

  var m = balanced("{", "}", str);
  if (!m) return [str];

  // no need to expand pre, since it is guaranteed to be free of brace-sets
  var pre = m.pre;
  var post = m.post.length ? expand(m.post, false) : [""];

  if (/\$$/.test(m.pre)) {
    for (var k = 0; k < post.length; k++) {
      var expansion = pre + "{" + m.body + "}" + post[k];
      expansions.push(expansion);
    }
  } else {
    var isNumericSequence = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(m.body);
    var isAlphaSequence = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(m.body);
    var isSequence = isNumericSequence || isAlphaSequence;
    var isOptions = m.body.indexOf(",") >= 0;
    if (!isSequence && !isOptions) {
      // {a},b}
      if (m.post.match(/,.*\}/)) {
        str = m.pre + "{" + m.body + escClose + m.post;
        return expand(str);
      }
      return [str];
    }

    var n: string[];
    if (isSequence) {
      n = m.body.split(/\.\./);
    } else {
      n = parseCommaParts(m.body);
      if (n.length === 1) {
        // x{{a,b}}y ==> x{a}y x{b}y
        n = expand(n[0], false).map(embrace);
        if (n.length === 1) {
          return post.map(function (p: string) {
            return m!.pre + n[0] + p;
          });
        }
      }
    }

    // at this point, n is the parts, and we know it's not a comma set
    // with a single entry.
    var N: string[];

    if (isSequence) {
      var x = numeric(n[0]);
      var y = numeric(n[1]);
      var width = Math.max(n[0].length, n[1].length);
      var incr = n.length == 3 ? Math.abs(numeric(n[2])) : 1;
      var test = lte;
      var reverse = y < x;
      if (reverse) {
        incr *= -1;
        test = gte;
      }
      var pad = n.some(isPadded);

      N = [];

      for (var i = x; test(i, y); i += incr) {
        var c;
        if (isAlphaSequence) {
          c = String.fromCharCode(i);
          if (c === "\\") c = "";
        } else {
          c = String(i);
          if (pad) {
            var need = width - c.length;
            if (need > 0) {
              var z = new Array(need + 1).join("0");
              if (i < 0) c = "-" + z + c.slice(1);
              else c = z + c;
            }
          }
        }
        N.push(c);
      }
    } else {
      N = [];

      for (var j = 0; j < n.length; j++) {
        N.push.apply(N, expand(n[j], false));
      }
    }

    for (var j = 0; j < N.length; j++) {
      for (var k = 0; k < post.length; k++) {
        var expansion = pre + N[j] + post[k];
        if (!isTop || isSequence || expansion) expansions.push(expansion);
      }
    }
  }

  return expansions;
}
