import { describe, expect, it } from "vitest";
import { encryptChunk, generateDataKey } from "#lib/shared/crypto/index.ts";
import { concatenateBuffers } from "#lib/shared/crypto/index.ts";
import {
  CHUNK_SIZE,
  createDecryptionStream,
  getEncryptedRange,
  getEncryptedSize,
} from "#lib/shared/format/index.ts";

const plaintext = Uint8Array.from({ length: 2 * CHUNK_SIZE + 12345 }, (_, i) => (i * 7) % 251);

// `toEqual` is too slow for large arrays
const expectBytes = (actual: Uint8Array, expected: Uint8Array) => {
  expect(actual.byteLength).toBe(expected.byteLength);
  expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true);
};

const encrypt = async (data: Uint8Array, dataKey: CryptoKey, chunkSize = CHUNK_SIZE) => {
  const chunks: ArrayBuffer[] = [];
  for (let offset = 0; offset < data.byteLength; offset += chunkSize) {
    chunks.push(await encryptChunk(data.slice(offset, offset + chunkSize).buffer, dataKey));
  }
  return concatenateBuffers(...chunks);
};

// Feeds the input in pieces of irregular sizes like a network stream
const toStream = (data: Uint8Array) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      let offset = 0;
      for (let i = 0; offset < data.byteLength; i++) {
        const size = [1, 1000, 65536, 3_000_000][i % 4]!;
        controller.enqueue(data.slice(offset, offset + size));
        offset += size;
      }
      controller.close();
    },
  });

const decrypt = async (
  encrypted: Uint8Array,
  dataKey: CryptoKey,
  start: number,
  end: number,
  isLegacy = false,
) => {
  const encryptedRange = getEncryptedRange(start, end, encrypted.byteLength, isLegacy);
  const stream = toStream(
    encrypted.slice(encryptedRange.start, encryptedRange.end + 1),
  ).pipeThrough(
    createDecryptionStream({
      range: { start, end, total: plaintext.byteLength },
      chunkCount: encryptedRange.lastChunkIndex - encryptedRange.firstChunkIndex + 1,
      dataKey,
      isLegacy,
    }),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

describe("createDecryptionStream", async () => {
  const { dataKey } = await generateDataKey();
  const encrypted = await encrypt(plaintext, dataKey);

  it("produces encrypted content of the expected size", () => {
    expect(encrypted.byteLength).toBe(getEncryptedSize(plaintext.byteLength));
  });

  it.each([
    [0, plaintext.byteLength - 1],
    [0, 0],
    [10, 20],
    [CHUNK_SIZE - 5, CHUNK_SIZE + 5],
    [CHUNK_SIZE, 2 * CHUNK_SIZE - 1],
    [CHUNK_SIZE + 1, plaintext.byteLength - 1],
    [plaintext.byteLength - 1, plaintext.byteLength - 1],
  ])("decrypts the range %i-%i", async (start, end) => {
    expectBytes(await decrypt(encrypted, dataKey, start, end), plaintext.slice(start, end + 1));
  });

  it("decrypts ranges of legacy files", async () => {
    const legacyEncrypted = await encrypt(plaintext, dataKey, plaintext.byteLength);

    expectBytes(
      await decrypt(legacyEncrypted, dataKey, 100, CHUNK_SIZE + 100, true),
      plaintext.slice(100, CHUNK_SIZE + 101),
    );
  });

  it("rejects truncated content", async () => {
    const stream = toStream(encrypted.slice(0, CHUNK_SIZE)).pipeThrough(
      createDecryptionStream({
        range: { start: 0, end: plaintext.byteLength - 1, total: plaintext.byteLength },
        chunkCount: 3,
        dataKey,
        isLegacy: false,
      }),
    );

    await expect(new Response(stream).arrayBuffer()).rejects.toThrow();
  });
});
