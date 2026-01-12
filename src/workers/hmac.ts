import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";

export interface ComputeMessage {
  stream: ReadableStream;
  key: Uint8Array;
}

export interface ResultMessage {
  result: Uint8Array;
}

self.onmessage = async (event: MessageEvent<ComputeMessage>) => {
  const h = hmac.create(sha256, event.data.key);
  const reader = event.data.stream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    h.update(value);
  }

  const result = h.digest();
  self.postMessage({ result } satisfies ResultMessage, { transfer: [result.buffer] });
};
