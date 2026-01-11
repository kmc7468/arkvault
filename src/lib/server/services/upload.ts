import { error } from "@sveltejs/kit";
import { createHash } from "crypto";
import { createWriteStream } from "fs";
import { Readable } from "stream";
import { ENCRYPTION_OVERHEAD, ENCRYPTED_CHUNK_SIZE } from "$lib/constants";
import { UploadRepo } from "$lib/server/db";
import { safeRecursiveRm, safeUnlink } from "$lib/server/modules/filesystem";

const chunkLocks = new Set<string>();

export const uploadChunk = async (
  userId: number,
  sessionId: string,
  chunkIndex: number,
  encChunkStream: Readable,
  encChunkHash: string,
) => {
  const lockKey = `${sessionId}/${chunkIndex}`;
  if (chunkLocks.has(lockKey)) {
    error(409, "Chunk upload already in progress");
  } else {
    chunkLocks.add(lockKey);
  }

  let filePath;

  try {
    const session = await UploadRepo.getUploadSession(sessionId, userId);
    if (!session) {
      error(404, "Invalid upload id");
    } else if (chunkIndex >= session.totalChunks) {
      error(400, "Invalid chunk index");
    } else if (session.uploadedChunks.includes(chunkIndex)) {
      error(409, "Chunk already uploaded");
    }

    const isLastChunk = chunkIndex === session.totalChunks - 1;
    filePath = `${session.path}/${chunkIndex}`;

    const hashStream = createHash("sha256");
    const writeStream = createWriteStream(filePath, { flags: "wx", mode: 0o600 });
    let writtenBytes = 0;

    for await (const chunk of encChunkStream) {
      hashStream.update(chunk);
      writeStream.write(chunk);
      writtenBytes += chunk.length;
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.end((e: any) => (e ? reject(e) : resolve()));
    });

    if (hashStream.digest("base64") !== encChunkHash) {
      throw new Error("Invalid checksum");
    } else if (
      (!isLastChunk && writtenBytes !== ENCRYPTED_CHUNK_SIZE) ||
      (isLastChunk && (writtenBytes <= ENCRYPTION_OVERHEAD || writtenBytes > ENCRYPTED_CHUNK_SIZE))
    ) {
      throw new Error("Invalid chunk size");
    }

    await UploadRepo.markChunkAsUploaded(sessionId, chunkIndex);
  } catch (e) {
    await safeUnlink(filePath);

    if (
      e instanceof Error &&
      (e.message === "Invalid checksum" || e.message === "Invalid chunk size")
    ) {
      error(400, "Invalid request body");
    }
    throw e;
  } finally {
    chunkLocks.delete(lockKey);
  }
};

export const cleanupExpiredUploadSessions = async () => {
  const paths = await UploadRepo.cleanupExpiredUploadSessions();
  await Promise.all(paths.map(safeRecursiveRm));
};
