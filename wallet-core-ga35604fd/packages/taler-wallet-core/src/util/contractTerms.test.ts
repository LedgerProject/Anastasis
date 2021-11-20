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
import test from "ava";
import { ContractTermsUtil } from "./contractTerms.js";

test("contract terms canon hashing", (t) => {
  const cReq = {
    foo: 42,
    bar: "hello",
    $forgettable: {
      foo: true,
    },
  };

  const c1 = ContractTermsUtil.saltForgettable(cReq);
  const c2 = ContractTermsUtil.saltForgettable(cReq);
  t.assert(typeof cReq.$forgettable.foo === "boolean");
  t.assert(typeof c1.$forgettable.foo === "string");
  t.assert(c1.$forgettable.foo !== c2.$forgettable.foo);

  const h1 = ContractTermsUtil.hashContractTerms(c1);

  const c3 = ContractTermsUtil.scrub(JSON.parse(JSON.stringify(c1)));

  t.assert(c3.foo === undefined);
  t.assert(c3.bar === cReq.bar);

  const h2 = ContractTermsUtil.hashContractTerms(c3);

  t.deepEqual(h1, h2);
});

test("contract terms canon hashing (nested)", (t) => {
  const cReq = {
    foo: 42,
    bar: {
      prop1: "hello, world",
      $forgettable: {
        prop1: true,
      },
    },
    $forgettable: {
      bar: true,
    },
  };

  const c1 = ContractTermsUtil.saltForgettable(cReq);

  t.is(typeof c1.$forgettable.bar, "string");
  t.is(typeof c1.bar.$forgettable.prop1, "string");

  const forgetPath = (x: any, s: string) =>
    ContractTermsUtil.forgetAll(x, (p) => p.join(".") === s);

  // Forget bar first
  const c2 = forgetPath(c1, "bar");

  // Forget bar.prop1 first
  const c3 = forgetPath(forgetPath(c1, "bar.prop1"), "bar");

  // Forget everything
  const c4 = ContractTermsUtil.scrub(c1);

  const h1 = ContractTermsUtil.hashContractTerms(c1);
  const h2 = ContractTermsUtil.hashContractTerms(c2);
  const h3 = ContractTermsUtil.hashContractTerms(c3);
  const h4 = ContractTermsUtil.hashContractTerms(c4);

  t.is(h1, h2);
  t.is(h1, h3);
  t.is(h1, h4);

  // Doesn't contain salt
  t.false(ContractTermsUtil.validateForgettable(cReq));

  t.true(ContractTermsUtil.validateForgettable(c1));
  t.true(ContractTermsUtil.validateForgettable(c2));
  t.true(ContractTermsUtil.validateForgettable(c3));
  t.true(ContractTermsUtil.validateForgettable(c4));
});

test("contract terms reference vector", (t) => {
  const j = {
    k1: 1,
    $forgettable: {
      k1: "SALT",
    },
    k2: {
      n1: true,
      $forgettable: {
        n1: "salt",
      },
    },
    k3: {
      n1: "string",
    },
  };

  const h = ContractTermsUtil.hashContractTerms(j);

  t.deepEqual(
    h,
    "VDE8JPX0AEEE3EX1K8E11RYEWSZQKGGZCV6BWTE4ST1C8711P7H850Z7F2Q2HSSYETX87ERC2JNHWB7GTDWTDWMM716VKPSRBXD7SRR",
  );
});
