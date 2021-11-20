/*
 This file is part of GNU Taler
 (C) 2020 Taler Systems S.A.

 GNU Taler is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 GNU Taler is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 GNU Taler; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

import test from "ava";

import { Amounts, AmountJson, amountMaxValue } from "./amounts.js";

const jAmt = (
  value: number,
  fraction: number,
  currency: string,
): AmountJson => ({ value, fraction, currency });

const sAmt = (s: string): AmountJson => Amounts.parseOrThrow(s);

test("amount addition (simple)", (t) => {
  const a1 = jAmt(1, 0, "EUR");
  const a2 = jAmt(1, 0, "EUR");
  const a3 = jAmt(2, 0, "EUR");
  t.true(0 === Amounts.cmp(Amounts.add(a1, a2).amount, a3));
  t.pass();
});

test("amount addition (saturation)", (t) => {
  const a1 = jAmt(1, 0, "EUR");
  const res = Amounts.add(jAmt(amountMaxValue, 0, "EUR"), a1);
  t.true(res.saturated);
  t.pass();
});

test("amount subtraction (simple)", (t) => {
  const a1 = jAmt(2, 5, "EUR");
  const a2 = jAmt(1, 0, "EUR");
  const a3 = jAmt(1, 5, "EUR");
  t.true(0 === Amounts.cmp(Amounts.sub(a1, a2).amount, a3));
  t.pass();
});

test("amount subtraction (saturation)", (t) => {
  const a1 = jAmt(0, 0, "EUR");
  const a2 = jAmt(1, 0, "EUR");
  let res = Amounts.sub(a1, a2);
  t.true(res.saturated);
  res = Amounts.sub(a1, a1);
  t.true(!res.saturated);
  t.pass();
});

test("amount comparison", (t) => {
  t.is(Amounts.cmp(jAmt(1, 0, "EUR"), jAmt(1, 0, "EUR")), 0);
  t.is(Amounts.cmp(jAmt(1, 1, "EUR"), jAmt(1, 0, "EUR")), 1);
  t.is(Amounts.cmp(jAmt(1, 1, "EUR"), jAmt(1, 2, "EUR")), -1);
  t.is(Amounts.cmp(jAmt(1, 0, "EUR"), jAmt(0, 0, "EUR")), 1);
  t.is(Amounts.cmp(jAmt(0, 0, "EUR"), jAmt(1, 0, "EUR")), -1);
  t.is(Amounts.cmp(jAmt(1, 0, "EUR"), jAmt(0, 100000000, "EUR")), 0);
  t.throws(() => Amounts.cmp(jAmt(1, 0, "FOO"), jAmt(1, 0, "BAR")));
  t.pass();
});

test("amount parsing", (t) => {
  t.is(
    Amounts.cmp(Amounts.parseOrThrow("TESTKUDOS:0"), jAmt(0, 0, "TESTKUDOS")),
    0,
  );
  t.is(
    Amounts.cmp(Amounts.parseOrThrow("TESTKUDOS:10"), jAmt(10, 0, "TESTKUDOS")),
    0,
  );
  t.is(
    Amounts.cmp(
      Amounts.parseOrThrow("TESTKUDOS:0.1"),
      jAmt(0, 10000000, "TESTKUDOS"),
    ),
    0,
  );
  t.is(
    Amounts.cmp(
      Amounts.parseOrThrow("TESTKUDOS:0.00000001"),
      jAmt(0, 1, "TESTKUDOS"),
    ),
    0,
  );
  t.is(
    Amounts.cmp(
      Amounts.parseOrThrow("TESTKUDOS:4503599627370496.99999999"),
      jAmt(4503599627370496, 99999999, "TESTKUDOS"),
    ),
    0,
  );
  t.throws(() => Amounts.parseOrThrow("foo:"));
  t.throws(() => Amounts.parseOrThrow("1.0"));
  t.throws(() => Amounts.parseOrThrow("42"));
  t.throws(() => Amounts.parseOrThrow(":1.0"));
  t.throws(() => Amounts.parseOrThrow(":42"));
  t.throws(() => Amounts.parseOrThrow("EUR:.42"));
  t.throws(() => Amounts.parseOrThrow("EUR:42."));
  t.throws(() => Amounts.parseOrThrow("TESTKUDOS:4503599627370497.99999999"));
  t.is(
    Amounts.cmp(
      Amounts.parseOrThrow("TESTKUDOS:0.99999999"),
      jAmt(0, 99999999, "TESTKUDOS"),
    ),
    0,
  );
  t.throws(() => Amounts.parseOrThrow("TESTKUDOS:0.999999991"));
  t.pass();
});

test("amount stringification", (t) => {
  t.is(Amounts.stringify(jAmt(0, 0, "TESTKUDOS")), "TESTKUDOS:0");
  t.is(Amounts.stringify(jAmt(4, 94000000, "TESTKUDOS")), "TESTKUDOS:4.94");
  t.is(Amounts.stringify(jAmt(0, 10000000, "TESTKUDOS")), "TESTKUDOS:0.1");
  t.is(Amounts.stringify(jAmt(0, 1, "TESTKUDOS")), "TESTKUDOS:0.00000001");
  t.is(Amounts.stringify(jAmt(5, 0, "TESTKUDOS")), "TESTKUDOS:5");
  // denormalized
  t.is(Amounts.stringify(jAmt(1, 100000000, "TESTKUDOS")), "TESTKUDOS:2");
  t.pass();
});

test("amount multiplication", (t) => {
  t.is(Amounts.stringify(Amounts.mult(sAmt("EUR:1.11"), 0).amount), "EUR:0");
  t.is(Amounts.stringify(Amounts.mult(sAmt("EUR:1.11"), 1).amount), "EUR:1.11");
  t.is(Amounts.stringify(Amounts.mult(sAmt("EUR:1.11"), 2).amount), "EUR:2.22");
  t.is(Amounts.stringify(Amounts.mult(sAmt("EUR:1.11"), 3).amount), "EUR:3.33");
  t.is(Amounts.stringify(Amounts.mult(sAmt("EUR:1.11"), 4).amount), "EUR:4.44");
  t.is(Amounts.stringify(Amounts.mult(sAmt("EUR:1.11"), 5).amount), "EUR:5.55");
});
