import HmacWorker from "$workers/hmac?worker";
import type { ComputeMessage, ResultMessage } from "$workers/hmac";

export const digestMessage = async (message: BufferSource) => {
  return await crypto.subtle.digest("SHA-256", message);
};

export const generateHmacSecret = async () => {
  return {
    hmacSecret: await crypto.subtle.generateKey(
      {
        name: "HMAC",
        hash: "SHA-256",
      } satisfies HmacKeyGenParams,
      true,
      ["sign", "verify"],
    ),
  };
};

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
