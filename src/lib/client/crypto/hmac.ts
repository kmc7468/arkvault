import type { ComputeMessage, ResultMessage } from "#workers/hmac.js";
import HmacWorker from "#workers/hmac.js?worker";

// Computes HMAC of large blobs incrementally in a worker, which WebCrypto doesn't support
export const signMessageHmac = async (message: Blob, hmacSecret: CryptoKey) => {
  const stream = message.stream();
  const hmacSecretRaw = new Uint8Array(await crypto.subtle.exportKey("raw", hmacSecret));
  const worker = new HmacWorker();

  return new Promise<Uint8Array>((resolve, reject) => {
    worker.onmessage = ({ data }: MessageEvent<ResultMessage>) => {
      resolve(data.result);
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
