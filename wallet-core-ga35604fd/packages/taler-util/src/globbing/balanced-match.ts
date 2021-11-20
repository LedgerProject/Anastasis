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

export function balanced(a: RegExp | string, b: RegExp | string, str: string) {
  let myA: string;
  let myB: string;
  if (a instanceof RegExp) myA = maybeMatch(a, str)!;
  else myA = a;
  if (b instanceof RegExp) myB = maybeMatch(b, str)!;
  else myB = b;

  const r = range(myA, myB, str);

  return (
    r && {
      start: r[0],
      end: r[1],
      pre: str.slice(0, r[0]),
      body: str.slice(r[0]! + myA!.length, r[1]),
      post: str.slice(r[1]! + myB!.length),
    }
  );
}

/**
 * @param {RegExp} reg
 * @param {string} str
 */
function maybeMatch(reg: RegExp, str: string) {
  const m = str.match(reg);
  return m ? m[0] : null;
}

balanced.range = range;

/**
 * @param {string} a
 * @param {string} b
 * @param {string} str
 */
function range(a: string, b: string, str: string) {
  let begs: number[];
  let beg: number;
  let left, right, result;
  let ai = str.indexOf(a);
  let bi = str.indexOf(b, ai + 1);
  let i = ai;

  if (ai >= 0 && bi > 0) {
    if (a === b) {
      return [ai, bi];
    }
    begs = [];
    left = str.length;

    while (i >= 0 && !result) {
      if (i === ai) {
        begs.push(i);
        ai = str.indexOf(a, i + 1);
      } else if (begs.length === 1) {
        result = [begs.pop(), bi];
      } else {
        beg = begs.pop()!;
        if (beg < left) {
          left = beg;
          right = bi;
        }

        bi = str.indexOf(b, i + 1);
      }

      i = ai < bi && ai >= 0 ? ai : bi;
    }

    if (begs.length) {
      result = [left, right];
    }
  }

  return result;
}
