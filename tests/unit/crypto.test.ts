import { describe, expect, it } from "vitest";
import {
  decodeFromBase64,
  decryptChunk,
  decryptString,
  encodeToBase64,
  encryptChunk,
  encryptString,
  generateDataKey,
} from "#lib/shared/crypto/index.js";

describe("base64", () => {
  it("round-trips large buffers", () => {
    const data = Uint8Array.from({ length: 1024 * 1024 }, (_, i) => (i * 31) % 256);
    const encoded = encodeToBase64(data);
    expect(new Uint8Array(decodeFromBase64(encoded))).toEqual(data);
    expect(encodeToBase64(data.buffer)).toBe(encoded);
  });
});

describe("AES-GCM", () => {
  it("round-trips strings", async () => {
    const { dataKey } = await generateDataKey();
    const { ciphertext, iv } = await encryptString("안녕하세요.jpg", dataKey);
    expect(await decryptString(ciphertext, iv, dataKey)).toBe("안녕하세요.jpg");
  });

  it("round-trips chunks", async () => {
    const { dataKey } = await generateDataKey();
    const chunk = crypto.getRandomValues(new Uint8Array(4096));

    const encrypted = await encryptChunk(chunk.buffer, dataKey);

    expect(encrypted.byteLength).toBe(4096 + 12 + 16);
    expect(new Uint8Array(await decryptChunk(encrypted, dataKey))).toEqual(chunk);
  });

  it("rejects tampered chunks", async () => {
    const { dataKey } = await generateDataKey();
    const encrypted = new Uint8Array(await encryptChunk(new Uint8Array(32).buffer, dataKey));
    encrypted[20]! ^= 1;

    await expect(decryptChunk(encrypted.buffer, dataKey)).rejects.toThrow();
  });
});
