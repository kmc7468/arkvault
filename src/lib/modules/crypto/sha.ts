import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";

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

export const createHmacStream = async (hmacSecret: CryptoKey) => {
  const h = hmac.create(sha256, new Uint8Array(await crypto.subtle.exportKey("raw", hmacSecret)));
  return {
    update: (data: Uint8Array) => h.update(data),
    digest: () => h.digest(),
  };
};
