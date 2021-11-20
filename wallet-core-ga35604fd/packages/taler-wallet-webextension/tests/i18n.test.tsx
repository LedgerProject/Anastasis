/*
 This file is part of GNU Taler
 (C) 2020 Taler Systems SA

 GNU Taler is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 GNU Taler is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 GNU Taler; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

// import * as test from "ava";
import { internalSetStrings, i18n, Translate } from "@gnu-taler/taler-util";
import { render, configure } from "enzyme";
import { h } from 'preact';
import Adapter from 'enzyme-adapter-preact-pure';

configure({ adapter: new Adapter() });

const testStrings = {
  domain: "messages",
  locale_data: {
    messages: {
      str1: ["foo1"],
      str2: [""],
      "str3 %1$s / %2$s": ["foo3 %2$s ; %1$s"],
      "": {
        domain: "messages",
        plural_forms: "nplurals=2; plural=(n != 1);",
        lang: "",
      },
    },
  },
};

test("str translation", (done) => {

  // Alias, so we nly use the function for lookups, not for string extranction.
  const strAlias = i18n.str;
  const TranslateAlias = Translate;
  internalSetStrings(testStrings);
  expect(strAlias`str1`).toEqual("foo1");
  expect(strAlias`str2`).toEqual("str2");
  const a = "a";
  const b = "b";
  expect(strAlias`str3 ${a} / ${b}`).toEqual("foo3 b ; a");
  const r = render(<Translate>str1</Translate>);
  expect(r.text()).toEqual("foo1");

  const r2 = render(
    <TranslateAlias>
      str3 <span>{a}</span> / <span>{b}</span>
    </TranslateAlias>,
  );
  expect(r2.text()).toEqual("foo3 b ; a");

  done();
});

// test.default("existing str translation", (t) => {
//   internalSetStrings(strings);
//   t.pass();
// });
