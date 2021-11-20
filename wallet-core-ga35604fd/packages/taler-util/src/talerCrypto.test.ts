/*
 This file is part of GNU Taler
 (C) 2019 GNUnet e.V.

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
 * Imports
 */
import test from "ava";
import {
  encodeCrock,
  decodeCrock,
  ecdheGetPublic,
  eddsaGetPublic,
  keyExchangeEddsaEcdhe,
  keyExchangeEcdheEddsa,
  stringToBytes,
  bytesToString,
} from "./talerCrypto.js";
import { sha512, kdf } from "./kdf.js";
import * as nacl from "./nacl-fast.js";

test("encoding", (t) => {
  const s = "Hello, World";
  const encStr = encodeCrock(stringToBytes(s));
  const outBuf = decodeCrock(encStr);
  const sOut = bytesToString(outBuf);
  t.deepEqual(s, sOut);
});

test("taler-exchange-tvg hash code", (t) => {
  const input = "91JPRV3F5GG4EKJN41A62V35E8";
  const output =
    "CW96WR74JS8T53EC8GKSGD49QKH4ZNFTZXDAWMMV5GJ1E4BM6B8GPN5NVHDJ8ZVXNCW7Q4WBYCV61HCA3PZC2YJD850DT29RHHN7ESR";

  const myOutput = encodeCrock(sha512(decodeCrock(input)));

  t.deepEqual(myOutput, output);
});

test("taler-exchange-tvg ecdhe key", (t) => {
  const priv1 = "X4T4N0M8PVQXQEBW2BA7049KFSM7J437NSDFC6GDNM3N5J9367A0";
  const pub1 = "M997P494MS6A95G1P0QYWW2VNPSHSX5Q6JBY5B9YMNYWP0B50X3G";
  const priv2 = "14A0MMQ64DCV8HE0CS3WBC9DHFJAHXRGV7NEARFJPC5R5E1697E0";
  const skm =
    "NXRY2YCY7H9B6KM928ZD55WG964G59YR0CPX041DYXKBZZ85SAWNPQ8B30QRM5FMHYCXJAN0EAADJYWEF1X3PAC2AJN28626TR5A6AR";

  const myPub1 = nacl.scalarMult_base(decodeCrock(priv1));
  t.deepEqual(encodeCrock(myPub1), pub1);

  const mySkm = nacl.hash(
    nacl.scalarMult(decodeCrock(priv2), decodeCrock(pub1)),
  );
  t.deepEqual(encodeCrock(mySkm), skm);
});

test("taler-exchange-tvg eddsa key", (t) => {
  const priv = "9TM70AKDTS57AWY9JK2J4TMBTMW6K62WHHGZWYDG0VM5ABPZKD40";
  const pub = "8GSJZ649T2PXMKZC01Y4ANNBE7MF14QVK9SQEC4E46ZHKCVG8AS0";

  const pair = nacl.crypto_sign_keyPair_fromSeed(decodeCrock(priv));
  t.deepEqual(encodeCrock(pair.publicKey), pub);
});

test("taler-exchange-tvg kdf", (t) => {
  const salt = "94KPT83PCNS7J83KC5P78Y8";
  const ikm = "94KPT83MD1JJ0WV5CDS6AX10D5Q70XBM41NPAY90DNGQ8SBJD5GPR";
  const ctx =
    "94KPT83141HPYVKMCNW78833D1TPWTSC41GPRWVF41NPWVVQDRG62WS04XMPWSKF4WG6JVH0EHM6A82J8S1G";
  const outLen = 64;
  const out =
    "GTMR4QT05Z9WF5HKVG0WK9RPXGHSMHJNW377G9GJXCA8B0FEKPF4D27RJMSJZYWSQNTBJ5EYVV7ZW18B48Z0JVJJ80RHB706Y96Q358";

  const myOut = kdf(
    outLen,
    decodeCrock(ikm),
    decodeCrock(salt),
    decodeCrock(ctx),
  );

  t.deepEqual(encodeCrock(myOut), out);
});

test("taler-exchange-tvg eddsa_ecdh", (t) => {
  const priv_ecdhe = "4AFZWMSGTVCHZPQ0R81NWXDCK4N58G7SDBBE5KXE080Y50370JJG";
  const pub_ecdhe = "FXFN5GPAFTKVPWJDPVXQ87167S8T82T5ZV8CDYC0NH2AE14X0M30";
  const priv_eddsa = "1KG54M8T3X8BSFSZXCR3SQBSR7Y9P53NX61M864S7TEVMJ2XVPF0";
  const pub_eddsa = "7BXWKG6N224C57RTDV8XEAHR108HG78NMA995BE8QAT5GC1S7E80";
  const key_material =
    "PKZ42Z56SVK2796HG1QYBRJ6ZQM2T9QGA3JA4AAZ8G7CWK9FPX175Q9JE5P0ZAX3HWWPHAQV4DPCK10R9X3SAXHRV0WF06BHEC2ZTKR";

  const myEcdhePub = ecdheGetPublic(decodeCrock(priv_ecdhe));
  t.deepEqual(encodeCrock(myEcdhePub), pub_ecdhe);

  const myEddsaPub = eddsaGetPublic(decodeCrock(priv_eddsa));
  t.deepEqual(encodeCrock(myEddsaPub), pub_eddsa);

  const myKm1 = keyExchangeEddsaEcdhe(
    decodeCrock(priv_eddsa),
    decodeCrock(pub_ecdhe),
  );
  t.deepEqual(encodeCrock(myKm1), key_material);

  const myKm2 = keyExchangeEcdheEddsa(
    decodeCrock(priv_ecdhe),
    decodeCrock(pub_eddsa),
  );
  t.deepEqual(encodeCrock(myKm2), key_material);
});

test("incremental hashing #1", (t) => {
  const n = 1024;
  const d = nacl.randomBytes(n);

  const h1 = nacl.hash(d);
  const h2 = new nacl.HashState().update(d).finish();

  const s = new nacl.HashState();
  for (let i = 0; i < n; i++) {
    const b = new Uint8Array(1);
    b[0] = d[i];
    s.update(b);
  }

  const h3 = s.finish();

  t.deepEqual(encodeCrock(h1), encodeCrock(h2));
  t.deepEqual(encodeCrock(h1), encodeCrock(h3));
});

test("incremental hashing #2", (t) => {
  const n = 10;
  const d = nacl.randomBytes(n);

  const h1 = nacl.hash(d);
  const h2 = new nacl.HashState().update(d).finish();
  const s = new nacl.HashState();
  for (let i = 0; i < n; i++) {
    const b = new Uint8Array(1);
    b[0] = d[i];
    s.update(b);
  }

  const h3 = s.finish();

  t.deepEqual(encodeCrock(h1), encodeCrock(h3));
  t.deepEqual(encodeCrock(h1), encodeCrock(h2));
});

test("taler-exchange-tvg eddsa_ecdh #2", (t) => {
  const priv_ecdhe = "W5FH9CFS3YPGSCV200GE8TH6MAACPKKGEG2A5JTFSD1HZ5RYT7Q0";
  const pub_ecdhe = "FER9CRS2T8783TAANPZ134R704773XT0ZT1XPFXZJ9D4QX67ZN00";
  const priv_eddsa = "MSZ1TBKC6YQ19ZFP3NTJVKWNVGFP35BBRW8FTAQJ9Z2B96VC9P4G";
  const pub_eddsa = "Y7MKG85PBT8ZEGHF08JBVZXEV70TS0PY5Y2CMEN1WXEDN63KP1A0";
  const key_material =
    "G6RA58N61K7MT3WA13Q7VRTE1FQS6H43RX9HK8Z5TGAB61601GEGX51JRHHQMNKNM2R9AVC1STSGQDRHGKWVYP584YGBCTVMMJYQF30";

  const myEcdhePub = ecdheGetPublic(decodeCrock(priv_ecdhe));
  t.deepEqual(encodeCrock(myEcdhePub), pub_ecdhe);

  const myEddsaPub = eddsaGetPublic(decodeCrock(priv_eddsa));
  t.deepEqual(encodeCrock(myEddsaPub), pub_eddsa);

  const myKm1 = keyExchangeEddsaEcdhe(
    decodeCrock(priv_eddsa),
    decodeCrock(pub_ecdhe),
  );
  t.deepEqual(encodeCrock(myKm1), key_material);

  const myKm2 = keyExchangeEcdheEddsa(
    decodeCrock(priv_ecdhe),
    decodeCrock(pub_eddsa),
  );
  t.deepEqual(encodeCrock(myKm2), key_material);
});
