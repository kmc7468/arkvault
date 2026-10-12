import { randomUUID } from "crypto";
import { createReadStream } from "fs";
import { open } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { Readable } from "stream";
import { AppError } from "#lib/server/errors.ts";
import { ENCRYPTION_OVERHEAD, ENCRYPTED_CHUNK_SIZE } from "#lib/shared/format/index.ts";
import { deleteFile } from "./files.ts";

const invalidChunkSize = () => new AppError("BAD_REQUEST", "Invalid chunk size");

// Receives and validates a chunk before it is copied into the upload's file. Temporary chunks
// aren't placed in the persistent storage, and are removed even if receiving or applying fails.
export const withTemporaryChunk = async <T>(
  encChunkStream: Readable,
  isLastChunk: boolean,
  callback: (readChunk: () => Readable) => Promise<T>,
) => {
  const path = join(tmpdir(), `arkvault-chunk-${randomUUID()}`);
  // Created exclusively with restricted permissions, as `writeChunkAtOffset` writes into existing
  // files only
  const file = await open(path, "wx", 0o600);
  try {
    await file.close();
    await writeChunkAtOffset(path, encChunkStream, 1, isLastChunk);
    // A new stream is created for each call, as the chunk may be read several times (e.g. when
    // retrying a transaction)
    return await callback(() => createReadStream(path));
  } finally {
    await deleteFile(path).catch(console.error);
  }
};

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
