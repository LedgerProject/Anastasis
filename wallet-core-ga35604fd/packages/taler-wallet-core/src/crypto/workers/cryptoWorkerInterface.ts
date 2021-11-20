export interface CryptoWorker {
  postMessage(message: any): void;

  terminate(): void;

  onmessage: ((m: any) => void) | undefined;
  onerror: ((m: any) => void) | undefined;
}
