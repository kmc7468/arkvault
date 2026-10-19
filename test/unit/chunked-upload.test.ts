import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadBlob } from "#lib/client/transfer/chunked-upload.ts";
import { generateDataKey } from "#lib/shared/crypto/index.ts";
import { CHUNK_SIZE } from "#lib/shared/format/index.ts";

vi.mock("axios", () => ({ default: { post: vi.fn() } }));

const post = vi.mocked(axios.post);

const createBlob = (chunks: number) => new Blob([new Uint8Array((chunks - 1) * CHUNK_SIZE + 1)]);

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({});
});

describe("uploadBlob", () => {
  it("uploads every chunk", async () => {
    const { dataKey } = await generateDataKey();

    const { encContentHash } = await uploadBlob("upload", createBlob(3), dataKey);

    expect(encContentHash).toBeTruthy();
    expect(post.mock.calls.map(([url]) => url).sort()).toEqual([
      "/api/upload/upload/chunks/1",
      "/api/upload/upload/chunks/2",
      "/api/upload/upload/chunks/3",
    ]);
  });

  it("rejects if encryption fails", async () => {
    const { dataKey } = await generateDataKey();
    const error = new Error("Encryption failed");

    await expect(
      uploadBlob("upload", createBlob(2), dataKey, {
        onPlaintextChunk: async (chunkIndex) => {
          if (chunkIndex === 1) throw error;
        },
      }),
    ).rejects.toBe(error);
  });

  it("rejects if uploading a chunk fails", async () => {
    const { dataKey } = await generateDataKey();
    const error = new Error("Upload failed");
    post.mockImplementation(async (url) => {
      if (url.endsWith("/2")) throw error;
      return {};
    });

    // More chunks than the queue can hold, so that the producer would block if not stopped
    await expect(uploadBlob("upload", createBlob(16), dataKey)).rejects.toBe(error);
  });
});
