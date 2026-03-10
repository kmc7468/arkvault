import { error } from "@sveltejs/kit";
import { open } from "fs/promises";
import { Readable } from "stream";
import { ENCRYPTION_OVERHEAD, ENCRYPTED_CHUNK_SIZE } from "$lib/constants";
import { UploadRepo } from "$lib/server/db";
import { safeUnlink } from "$lib/server/modules/filesystem";

const chunkLocks = new Set<string>();

const isChunkUploaded = (bitmap: Buffer, chunkIndex: number) => {
  chunkIndex -= 1;
  const byte = bitmap[Math.floor(chunkIndex / 8)];
  return !!byte && (byte & (1 << (chunkIndex % 8))) !== 0; // Postgres sucks
};

const writeChunkAtOffset = async (
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
        throw new Error("Invalid chunk size");
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
      throw new Error("Invalid chunk size");
    }

    if (isLastChunk) {
      await file.truncate(offset + written);
    }

    return written;
  } finally {
    await file.close();
  }
};

export const uploadChunk = async (
  userId: number,
  sessionId: string,
  chunkIndex: number,
  encChunkStream: Readable,
) => {
  const lockKey = `${sessionId}/${chunkIndex}`;
  if (chunkLocks.has(lockKey)) {
    error(409, "Chunk upload already in progress");
  } else {
    chunkLocks.add(lockKey);
  }

  try {
    const session = await UploadRepo.getUploadSession(sessionId, userId);
    if (!session) {
      error(404, "Invalid upload id");
    } else if (chunkIndex > session.totalChunks) {
      error(400, "Invalid chunk index");
    } else if (isChunkUploaded(session.bitmap, chunkIndex)) {
      error(409, "Chunk already uploaded");
    }

    const isLastChunk = chunkIndex === session.totalChunks;
    await writeChunkAtOffset(session.path, encChunkStream, chunkIndex, isLastChunk);
    await UploadRepo.markChunkAsUploaded(sessionId, chunkIndex);
  } catch (e) {
    if (e instanceof Error && e.message === "Invalid chunk size") {
      error(400, "Invalid request body");
    }
    throw e;
  } finally {
    chunkLocks.delete(lockKey);
  }
};

export const cleanupExpiredUploadSessions = async () => {
  const paths = await UploadRepo.cleanupExpiredUploadSessions();
  await Promise.all(paths.map(safeUnlink));
};
