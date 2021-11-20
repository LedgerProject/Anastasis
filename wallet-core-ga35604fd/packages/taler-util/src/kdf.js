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
import * as nacl from "./nacl-fast.js";
import { sha256 } from "./sha256.js";
export function sha512(data) {
    return nacl.hash(data);
}
export function hmac(digest, blockSize, key, message) {
    if (key.byteLength > blockSize) {
        key = digest(key);
    }
    if (key.byteLength < blockSize) {
        const k = key;
        key = new Uint8Array(blockSize);
        key.set(k, 0);
    }
    const okp = new Uint8Array(blockSize);
    const ikp = new Uint8Array(blockSize);
    for (let i = 0; i < blockSize; i++) {
        ikp[i] = key[i] ^ 0x36;
        okp[i] = key[i] ^ 0x5c;
    }
    const b1 = new Uint8Array(blockSize + message.byteLength);
    b1.set(ikp, 0);
    b1.set(message, blockSize);
    const h0 = digest(b1);
    const b2 = new Uint8Array(blockSize + h0.length);
    b2.set(okp, 0);
    b2.set(h0, blockSize);
    return digest(b2);
}
export function hmacSha512(key, message) {
    return hmac(sha512, 128, key, message);
}
export function hmacSha256(key, message) {
    return hmac(sha256, 64, key, message);
}
export function kdf(outputLength, ikm, salt, info) {
    // extract
    const prk = hmacSha512(salt, ikm);
    // expand
    const N = Math.ceil(outputLength / 32);
    const output = new Uint8Array(N * 32);
    for (let i = 0; i < N; i++) {
        let buf;
        if (i == 0) {
            buf = new Uint8Array(info.byteLength + 1);
            buf.set(info, 0);
        }
        else {
            buf = new Uint8Array(info.byteLength + 1 + 32);
            for (let j = 0; j < 32; j++) {
                buf[j] = output[(i - 1) * 32 + j];
            }
            buf.set(info, 32);
        }
        buf[buf.length - 1] = i + 1;
        const chunk = hmacSha256(prk, buf);
        output.set(chunk, i * 32);
    }
    return output.slice(0, outputLength);
}
//# sourceMappingURL=kdf.js.map