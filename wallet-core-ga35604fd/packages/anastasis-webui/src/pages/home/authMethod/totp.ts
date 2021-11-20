/* eslint-disable @typescript-eslint/camelcase */
import jssha from "jssha";

const SEARCH_RANGE = 16;
const timeStep = 30;

export function computeTOTPandCheck(
  secretKey: Uint8Array,
  digits: number,
  code: number,
): boolean {
  const now = new Date().getTime();
  const epoch = Math.floor(Math.round(now / 1000.0) / timeStep);

  for (let ms = -SEARCH_RANGE; ms < SEARCH_RANGE; ms++) {
    const movingFactor = (epoch + ms).toString(16).padStart(16, "0");

    const hmacSha = new jssha("SHA-1", "HEX", {
      hmacKey: { value: secretKey, format: "UINT8ARRAY" },
    });
    hmacSha.update(movingFactor);
    const hmac_text = hmacSha.getHMAC("UINT8ARRAY");

    const offset = hmac_text[hmac_text.length - 1] & 0xf;

    const otp =
      (((hmac_text[offset + 0] << 24) +
        (hmac_text[offset + 1] << 16) +
        (hmac_text[offset + 2] << 8) +
        hmac_text[offset + 3]) &
        0x7fffffff) %
      Math.pow(10, digits);

    if (otp == code) return true;
  }
  return false;
}

const encTable__ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".split("");
export function base32enc(buffer: Uint8Array): string {
  let rpos = 0;
  let bits = 0;
  let vbit = 0;

  let result = "";
  while (rpos < buffer.length || vbit > 0) {
    if (rpos < buffer.length && vbit < 5) {
      bits = (bits << 8) | buffer[rpos++];
      vbit += 8;
    }
    if (vbit < 5) {
      bits <<= 5 - vbit;
      vbit = 5;
    }
    result += encTable__[(bits >> (vbit - 5)) & 31];
    vbit -= 5;
  }
  return result;
}

// const array = new Uint8Array(256)
// const secretKey = window.crypto.getRandomValues(array)
// console.log(base32enc(secretKey))
