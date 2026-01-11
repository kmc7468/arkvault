import { AES_GCM_IV_SIZE } from "$lib/constants";
import {
  encodeString,
  decodeString,
  encodeToBase64,
  decodeFromBase64,
  concatenateBuffers,
} from "./util";

export const generateMasterKey = async () => {
  return {
    masterKey: await crypto.subtle.generateKey(
      {
        name: "AES-KW",
        length: 256,
      } satisfies AesKeyGenParams,
      true,
      ["wrapKey", "unwrapKey"],
    ),
  };
};

export const generateDataKey = async () => {
  return {
    dataKey: await crypto.subtle.generateKey(
      {
        name: "AES-GCM",
        length: 256,
      } satisfies AesKeyGenParams,
      true,
      ["encrypt", "decrypt"],
    ),
    dataKeyVersion: new Date(),
  };
};

export const makeAESKeyNonextractable = async (key: CryptoKey) => {
  return await crypto.subtle.importKey(
    "raw",
    await crypto.subtle.exportKey("raw", key),
    key.algorithm,
    false,
    key.usages,
  );
};

export const wrapDataKey = async (dataKey: CryptoKey, masterKey: CryptoKey) => {
  return encodeToBase64(await crypto.subtle.wrapKey("raw", dataKey, masterKey, "AES-KW"));
};

export const unwrapDataKey = async (dataKeyWrapped: string, masterKey: CryptoKey) => {
  return {
    dataKey: await crypto.subtle.unwrapKey(
      "raw",
      decodeFromBase64(dataKeyWrapped),
      masterKey,
      "AES-KW",
      "AES-GCM",
      false, // Nonextractable
      ["encrypt", "decrypt"],
    ),
  };
};

export const wrapHmacSecret = async (hmacSecret: CryptoKey, masterKey: CryptoKey) => {
  return encodeToBase64(await crypto.subtle.wrapKey("raw", hmacSecret, masterKey, "AES-KW"));
};

export const unwrapHmacSecret = async (hmacSecretWrapped: string, masterKey: CryptoKey) => {
  return {
    hmacSecret: await crypto.subtle.unwrapKey(
      "raw",
      decodeFromBase64(hmacSecretWrapped),
      masterKey,
      "AES-KW",
      {
        name: "HMAC",
        hash: "SHA-256",
      } satisfies HmacImportParams,
      false, // Nonextractable
      ["sign", "verify"],
    ),
  };
};

export const encryptData = async (data: BufferSource, dataKey: CryptoKey) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    } satisfies AesGcmParams,
    dataKey,
    data,
  );
  return { ciphertext, iv: iv.buffer };
};

export const decryptData = async (
  ciphertext: BufferSource,
  iv: string | BufferSource,
  dataKey: CryptoKey,
) => {
  return await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: typeof iv === "string" ? decodeFromBase64(iv) : iv,
    } satisfies AesGcmParams,
    dataKey,
    ciphertext,
  );
};

export const encryptString = async (plaintext: string, dataKey: CryptoKey) => {
  const { ciphertext, iv } = await encryptData(encodeString(plaintext), dataKey);
  return { ciphertext: encodeToBase64(ciphertext), iv: encodeToBase64(iv) };
};

export const decryptString = async (ciphertext: string, iv: string, dataKey: CryptoKey) => {
  return decodeString(await decryptData(decodeFromBase64(ciphertext), iv, dataKey));
};

export const encryptChunk = async (chunk: ArrayBuffer, dataKey: CryptoKey) => {
  const { ciphertext, iv } = await encryptData(chunk, dataKey);
  return concatenateBuffers(iv, ciphertext).buffer;
};

export const decryptChunk = async (encryptedChunk: ArrayBuffer, dataKey: CryptoKey) => {
  return await decryptData(
    encryptedChunk.slice(AES_GCM_IV_SIZE),
    encryptedChunk.slice(0, AES_GCM_IV_SIZE),
    dataKey,
  );
};
