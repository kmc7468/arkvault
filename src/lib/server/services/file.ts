import { error } from "@sveltejs/kit";
import { createHash } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, stat } from "fs/promises";
import { dirname } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { v4 as uuidv4 } from "uuid";
import { CHUNK_SIZE, ENCRYPTION_OVERHEAD } from "$lib/constants";
import { FileRepo, MediaRepo, UploadRepo, IntegrityError } from "$lib/server/db";
import env from "$lib/server/loadenv";
import { getChunkDirectoryPath, safeUnlink } from "$lib/server/modules/filesystem";

const uploadLocks = new Set<string>();

const createEncContentStream = async (
  path: string,
  iv?: Buffer,
  range?: { start?: number; end?: number },
) => {
  const { size: fileSize } = await stat(path);
  const ivSize = iv?.byteLength ?? 0;
  const totalSize = fileSize + ivSize;

  const start = range?.start ?? 0;
  const end = range?.end ?? totalSize - 1;
  if (start > end || start < 0 || end >= totalSize) {
    error(416, "Invalid range");
  }

  return {
    encContentStream: Readable.toWeb(
      Readable.from(
        (async function* () {
          if (start < ivSize) {
            yield iv!.subarray(start, Math.min(end + 1, ivSize));
          }
          if (end >= ivSize) {
            yield* createReadStream(path, {
              start: Math.max(0, start - ivSize),
              end: end - ivSize,
            });
          }
        })(),
      ),
    ),
    range: { start, end, total: totalSize },
  };
};

export const getFileStream = async (
  userId: number,
  fileId: number,
  range?: { start?: number; end?: number },
) => {
  const file = await FileRepo.getFile(userId, fileId);
  if (!file) {
    error(404, "Invalid file id");
  }

  return createEncContentStream(
    file.path,
    file.encContentIv ? Buffer.from(file.encContentIv, "base64") : undefined,
    range,
  );
};

export const getFileThumbnailStream = async (
  userId: number,
  fileId: number,
  range?: { start?: number; end?: number },
) => {
  const thumbnail = await MediaRepo.getFileThumbnail(userId, fileId);
  if (!thumbnail) {
    error(404, "File or its thumbnail not found");
  }

  return createEncContentStream(
    thumbnail.path,
    Buffer.from(thumbnail.encContentIv, "base64"),
    range,
  );
};

export const uploadFileThumbnail = async (
  userId: number,
  fileId: number,
  dekVersion: Date,
  encContentIv: string,
  encContentStream: Readable,
) => {
  const path = `${env.thumbnailsPath}/${userId}/${uuidv4()}`;
  await mkdir(dirname(path), { recursive: true });

  try {
    await pipeline(encContentStream, createWriteStream(path, { flags: "wx", mode: 0o600 }));

    const oldPath = await MediaRepo.updateFileThumbnail(
      userId,
      fileId,
      dekVersion,
      path,
      encContentIv,
    );
    safeUnlink(oldPath); // Intended
  } catch (e) {
    await safeUnlink(path);

    if (e instanceof IntegrityError) {
      if (e.message === "File not found") {
        error(404, "File not found");
      } else if (e.message === "Invalid DEK version") {
        error(400, "Mismatched DEK version");
      }
    }
    throw e;
  }
};

export const uploadChunk = async (
  userId: number,
  sessionId: string,
  chunkIndex: number,
  encChunkStream: Readable,
  encChunkHash: string,
) => {
  const lockKey = `${sessionId}/${chunkIndex}`;
  if (uploadLocks.has(lockKey)) {
    error(409, "Chunk already uploaded"); // TODO: Message
  } else {
    uploadLocks.add(lockKey);
  }

  const filePath = `${getChunkDirectoryPath(sessionId)}/${chunkIndex}`;

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

    let writtenBytes = 0;
    const hashStream = createHash("sha256");
    const writeStream = createWriteStream(filePath, { flags: "wx", mode: 0o600 });

    for await (const chunk of encChunkStream) {
      writtenBytes += chunk.length;
      hashStream.update(chunk);
      writeStream.write(chunk);
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.end((e: any) => (e ? reject(e) : resolve()));
    });

    if (hashStream.digest("base64") !== encChunkHash) {
      throw new Error("Invalid checksum");
    } else if (
      (!isLastChunk && writtenBytes !== CHUNK_SIZE + ENCRYPTION_OVERHEAD) ||
      (isLastChunk &&
        (writtenBytes <= ENCRYPTION_OVERHEAD || writtenBytes > CHUNK_SIZE + ENCRYPTION_OVERHEAD))
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
    uploadLocks.delete(lockKey);
  }
};
