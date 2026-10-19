import type { ComputeMessage, ResultMessage } from "#workers/hmac.ts";
import HmacWorker from "#workers/hmac.ts?worker";

// Computes HMAC of large blobs incrementally in a worker, which WebCrypto doesn't support
export const signMessageHmac = async (message: Blob, hmacSecret: CryptoKey) => {
  const stream = message.stream();
  const hmacSecretRaw = new Uint8Array(await crypto.subtle.exportKey("raw", hmacSecret));
  const worker = new HmacWorker();

  return new Promise<Uint8Array>((resolve, reject) => {
    worker.onmessage = ({ data }: MessageEvent<ResultMessage>) => {
      if ("result" in data) {
        resolve(data.result);
      } else {
        reject(data.error);
      }
      worker.terminate();
    };

    worker.onerror = ({ error }) => {
      reject(error);
      worker.terminate();
    };

    worker.postMessage({ stream, key: hmacSecretRaw } satisfies ComputeMessage, {
      transfer: [stream, hmacSecretRaw.buffer],
    });
  });
};
