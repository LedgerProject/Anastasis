import { setPRNG } from "./nacl-fast.js";

export function loadBrowserPrng() {
  // Initialize PRNG if environment provides CSPRNG.
  // If not, methods calling randombytes will throw.
  // @ts-ignore-error
  const cr = typeof self !== "undefined" ? self.crypto || self.msCrypto : null;

  const QUOTA = 65536;
  setPRNG(function (x: Uint8Array, n: number) {
    let i;
    const v = new Uint8Array(n);
    for (i = 0; i < n; i += QUOTA) {
      cr.getRandomValues(v.subarray(i, i + Math.min(n - i, QUOTA)));
    }
    for (i = 0; i < n; i++) x[i] = v[i];
    for (i = 0; i < v.length; i++) v[i] = 0;
  });
}
