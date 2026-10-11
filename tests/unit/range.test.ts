import { describe, expect, it } from "vitest";
import { CHUNK_SIZE, ENCRYPTED_CHUNK_SIZE, ENCRYPTION_OVERHEAD } from "#lib/constants/index.js";
import { getContentRangeHeader, parseRangeHeader } from "#lib/modules/http.js";
import { getDecryptedSize, getEncryptedRange } from "../../src/service-worker/modules/crypto";

describe("parseRangeHeader", () => {
  it("parses byte ranges", () => {
    expect(parseRangeHeader(null)).toBeUndefined();
    expect(parseRangeHeader("bytes=0-")).toEqual({ start: 0, end: undefined });
    expect(parseRangeHeader("bytes=10-20")).toEqual({ start: 10, end: 20 });
    expect(parseRangeHeader("bytes=10-20, 30-40")).toEqual({ start: 10, end: 20 });
  });

  it("formats Content-Range", () => {
    expect(getContentRangeHeader({ start: 1, end: 2, total: 3 })).toEqual({
      "Content-Range": "bytes 1-2/3",
    });
  });
});

describe("encrypted chunk layout", () => {
  const encryptedSizeOf = (size: number) =>
    size + Math.ceil(size / CHUNK_SIZE) * ENCRYPTION_OVERHEAD;

  it.each([1, CHUNK_SIZE - 1, CHUNK_SIZE, CHUNK_SIZE + 1, 3 * CHUNK_SIZE + 12345])(
    "computes the decrypted size of %i bytes",
    (size) => {
      expect(getDecryptedSize(encryptedSizeOf(size), false)).toBe(size);
    },
  );

  it("computes the decrypted size of legacy files", () => {
    expect(getDecryptedSize(100 + ENCRYPTION_OVERHEAD, true)).toBe(100);
  });

  it("maps a plaintext range to whole encrypted chunks", () => {
    const totalSize = 3 * CHUNK_SIZE + 100;
    const totalEncryptedSize = encryptedSizeOf(totalSize);

    expect(getEncryptedRange(0, 10, totalEncryptedSize, false)).toEqual({
      firstChunkIndex: 0,
      lastChunkIndex: 0,
      start: 0,
      end: ENCRYPTED_CHUNK_SIZE - 1,
    });
    expect(getEncryptedRange(CHUNK_SIZE - 1, CHUNK_SIZE, totalEncryptedSize, false)).toEqual({
      firstChunkIndex: 0,
      lastChunkIndex: 1,
      start: 0,
      end: 2 * ENCRYPTED_CHUNK_SIZE - 1,
    });
    expect(getEncryptedRange(totalSize - 1, totalSize - 1, totalEncryptedSize, false)).toEqual({
      firstChunkIndex: 3,
      lastChunkIndex: 3,
      start: 3 * ENCRYPTED_CHUNK_SIZE,
      end: totalEncryptedSize - 1,
    });
  });

  it("maps any range of legacy files to the whole file", () => {
    expect(getEncryptedRange(5, 10, 1000, true)).toEqual({
      firstChunkIndex: 0,
      lastChunkIndex: 0,
      start: 0,
      end: 999,
    });
  });
});
