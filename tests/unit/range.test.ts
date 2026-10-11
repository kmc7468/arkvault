import { describe, expect, it } from "vitest";
import {
  CHUNK_SIZE,
  ENCRYPTED_CHUNK_SIZE,
  ENCRYPTION_OVERHEAD,
  getDecryptedSize,
  getEncryptedRange,
  getEncryptedSize,
} from "#lib/shared/format/index.js";
import { getContentRangeHeader, parseRangeHeader, resolveRange } from "#lib/shared/http.js";

describe("parseRangeHeader", () => {
  it("parses byte ranges", () => {
    expect(parseRangeHeader(null)).toBeUndefined();
    expect(parseRangeHeader("bytes=0-")).toEqual({ start: 0, end: undefined });
    expect(parseRangeHeader("bytes=10-20")).toEqual({ start: 10, end: 20 });
    expect(parseRangeHeader("bytes=10-20, 30-40")).toEqual({ start: 10, end: 20 });
    expect(parseRangeHeader("bytes=-500")).toEqual({ suffixLength: 500 });
  });

  it("ignores invalid ranges", () => {
    expect(parseRangeHeader("bytes=-")).toBeUndefined();
    expect(parseRangeHeader("items=0-1")).toBeUndefined();
  });
});

describe("resolveRange", () => {
  it("resolves the whole content without a range", () => {
    expect(resolveRange(undefined, 100)).toEqual({ start: 0, end: 99, total: 100 });
  });

  it("clamps the end to the content size", () => {
    expect(resolveRange({ start: 10, end: 1000 }, 100)).toEqual({ start: 10, end: 99, total: 100 });
    expect(resolveRange({ start: 10 }, 100)).toEqual({ start: 10, end: 99, total: 100 });
  });

  it("resolves suffix ranges", () => {
    expect(resolveRange({ suffixLength: 10 }, 100)).toEqual({ start: 90, end: 99, total: 100 });
    expect(resolveRange({ suffixLength: 1000 }, 100)).toEqual({ start: 0, end: 99, total: 100 });
  });

  it("rejects unsatisfiable ranges", () => {
    expect(resolveRange({ start: 100 }, 100)).toBeNull();
    expect(resolveRange({ start: 20, end: 10 }, 100)).toBeNull();
  });

  it("formats Content-Range", () => {
    expect(getContentRangeHeader({ start: 1, end: 2, total: 3 })).toEqual({
      "Content-Range": "bytes 1-2/3",
    });
  });
});

describe("encrypted chunk layout", () => {
  it.each([1, CHUNK_SIZE - 1, CHUNK_SIZE, CHUNK_SIZE + 1, 3 * CHUNK_SIZE + 12345])(
    "computes the decrypted size of %i bytes",
    (size) => {
      expect(getEncryptedSize(size)).toBe(
        size + Math.ceil(size / CHUNK_SIZE) * ENCRYPTION_OVERHEAD,
      );
      expect(getDecryptedSize(getEncryptedSize(size), false)).toBe(size);
    },
  );

  it("computes the decrypted size of legacy files", () => {
    expect(getDecryptedSize(100 + ENCRYPTION_OVERHEAD, true)).toBe(100);
  });

  it("maps a plaintext range to whole encrypted chunks", () => {
    const totalSize = 3 * CHUNK_SIZE + 100;
    const totalEncryptedSize = getEncryptedSize(totalSize);

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
