import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";

export interface ComputeMessage {
  stream: ReadableStream;
  key: Uint8Array;
}

// Errors are sent as messages, as rejections in `onmessage` don't fire `error` on the worker
export type ResultMessage = { result: Uint8Array } | { error: Error };

self.onmessage = async (event: MessageEvent<ComputeMessage>) => {
  try {
    const h = hmac.create(sha256, event.data.key);
    const reader = event.data.stream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      h.update(value);
    }

    const result = h.digest();
    self.postMessage({ result } satisfies ResultMessage, { transfer: [result.buffer] });
  } catch (e) {
    // Only errors are guaranteed to be cloneable
    const error = e instanceof Error ? e : new Error(String(e));
    self.postMessage({ error } satisfies ResultMessage);
  }
};
