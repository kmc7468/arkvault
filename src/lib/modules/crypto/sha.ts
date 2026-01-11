import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";

export const digestMessage = async (message: BufferSource) => {
  return await crypto.subtle.digest("SHA-256", message);
};

export const createStreamingHmac = async (hmacSecret: CryptoKey) => {
  const keyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", hmacSecret));
  const h = hmac.create(sha256, keyBytes);

  return {
    update: (data: Uint8Array) => h.update(data),
    digest: () => h.digest(),
  };
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

export const signMessageHmac = async (message: BufferSource, hmacSecret: CryptoKey) => {
  return await crypto.subtle.sign("HMAC", hmacSecret, message);
};
