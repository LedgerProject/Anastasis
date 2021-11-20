export declare function sha512(data: Uint8Array): Uint8Array;
export declare function hmac(digest: (d: Uint8Array) => Uint8Array, blockSize: number, key: Uint8Array, message: Uint8Array): Uint8Array;
export declare function hmacSha512(key: Uint8Array, message: Uint8Array): Uint8Array;
export declare function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array;
export declare function kdf(outputLength: number, ikm: Uint8Array, salt: Uint8Array, info: Uint8Array): Uint8Array;
