import { open } from "fs/promises";
import type { Readable } from "stream";
import { AppError } from "#lib/server/errors.js";
import { ENCRYPTION_OVERHEAD, ENCRYPTED_CHUNK_SIZE } from "#lib/shared/format/index.js";

const invalidChunkSize = () => new AppError("BAD_REQUEST", "Invalid chunk size");

export const writeChunkAtOffset = async (
  path: string,
  encChunkStream: Readable,
  chunkIndex: number,
  isLastChunk: boolean,
) => {
  const offset = (chunkIndex - 1) * ENCRYPTED_CHUNK_SIZE;
  const file = await open(path, "r+");
  let written = 0;

  try {
    for await (const chunk of encChunkStream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      written += buffer.length;
      if (written > ENCRYPTED_CHUNK_SIZE) {
        throw invalidChunkSize();
      }

      let chunkOffset = 0;
      while (chunkOffset < buffer.length) {
        const { bytesWritten } = await file.write(
          buffer,
          chunkOffset,
          buffer.length - chunkOffset,
          offset + written - buffer.length + chunkOffset,
        );
        if (bytesWritten <= 0) {
          throw new Error("Failed to write chunk");
        }
        chunkOffset += bytesWritten;
      }
    }

    if (
      (!isLastChunk && written !== ENCRYPTED_CHUNK_SIZE) ||
      (isLastChunk && (written <= ENCRYPTION_OVERHEAD || written > ENCRYPTED_CHUNK_SIZE))
    ) {
      throw invalidChunkSize();
    }

    if (isLastChunk) {
      await file.truncate(offset + written);
    }

    return written;
  } finally {
    await file.close();
  }
};
