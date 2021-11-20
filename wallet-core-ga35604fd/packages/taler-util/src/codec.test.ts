/*
 This file is part of GNU Taler
 (C) 2018-2019 GNUnet e.V.

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
 * Type-safe codecs for converting from/to JSON.
 */

import test from "ava";
import {
  Codec,
  buildCodecForObject,
  codecForConstString,
  codecForString,
  buildCodecForUnion,
} from "./codec.js";

interface MyObj {
  foo: string;
}

interface AltOne {
  type: "one";
  foo: string;
}

interface AltTwo {
  type: "two";
  bar: string;
}

type MyUnion = AltOne | AltTwo;

test("basic codec", (t) => {
  const myObjCodec = buildCodecForObject<MyObj>()
    .property("foo", codecForString())
    .build("MyObj");
  const res = myObjCodec.decode({ foo: "hello" });
  t.assert(res.foo === "hello");

  t.throws(() => {
    myObjCodec.decode({ foo: 123 });
  });
});

test("union", (t) => {
  const altOneCodec: Codec<AltOne> = buildCodecForObject<AltOne>()
    .property("type", codecForConstString("one"))
    .property("foo", codecForString())
    .build("AltOne");
  const altTwoCodec: Codec<AltTwo> = buildCodecForObject<AltTwo>()
    .property("type", codecForConstString("two"))
    .property("bar", codecForString())
    .build("AltTwo");
  const myUnionCodec: Codec<MyUnion> = buildCodecForUnion<MyUnion>()
    .discriminateOn("type")
    .alternative("one", altOneCodec)
    .alternative("two", altTwoCodec)
    .build<MyUnion>("MyUnion");

  const res = myUnionCodec.decode({ type: "one", foo: "bla" });
  t.is(res.type, "one");
  if (res.type == "one") {
    t.is(res.foo, "bla");
  }
});
