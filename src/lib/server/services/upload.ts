import type { Readable } from "stream";
import { db, FileRepo, MediaRepo, UploadRepo } from "#lib/server/db/index.js";
import type { Ciphertext } from "#lib/server/db/schema/index.js";
import { AppError } from "#lib/server/errors.js";
import {
  deleteFile,
  hashFile,
  reserveFile,
  writeChunkAtOffset,
} from "#lib/server/storage/index.js";
import { ensureFreshDekVersion } from "./common";
import { schedulePendingFileDeletions } from "./fileDeletion";

const UPLOAD_EXPIRES = 24 * 3600 * 1000; // 24 hours
const THUMBNAIL_CHUNKS = 1; // Up to 4 MiB

export const isChunkUploaded = (bitmap: Buffer, chunkIndex: number) => {
  chunkIndex -= 1;
  const byte = bitmap[Math.floor(chunkIndex / 8)];
  return !!byte && (byte & (1 << (chunkIndex % 8))) !== 0; // Postgres sucks
};

const withReservedFile = async <T>(
  kind: "library" | "thumbnails",
  userId: number,
  callback: (path: string) => Promise<T>,
) => {
  const path = await reserveFile(kind, userId);
  try {
    return await callback(path);
  } catch (e) {
    await deleteFile(path).catch(console.error);
    throw e;
  }
};

export const startFileUpload = async (params: {
  userId: number;
  totalChunks: number;
  parentId: DirectoryId;
  mekVersion: number;
  encDek: string;
  dekVersion: Date;
  hskVersion: number | null;
  contentType: string;
  encName: Ciphertext;
  encCreatedAt: Ciphertext | null;
  encLastModifiedAt: Ciphertext;
}) => {
  ensureFreshDekVersion(params.dekVersion);

  return await withReservedFile("library", params.userId, async (path) => {
    const id = crypto.randomUUID();
    await UploadRepo.createFileUploadSession({
      ...params,
      id,
      path,
      expiresAt: new Date(Date.now() + UPLOAD_EXPIRES),
    });
    return { uploadId: id };
  });
};

export const startFileThumbnailUpload = async (
  userId: number,
  fileId: number,
  dekVersion: Date,
) => {
  return await withReservedFile("thumbnails", userId, async (path) => {
    const id = crypto.randomUUID();
    await UploadRepo.createThumbnailUploadSession({
      id,
      type: "thumbnail",
      userId,
      path,
      totalChunks: THUMBNAIL_CHUNKS,
      expiresAt: new Date(Date.now() + UPLOAD_EXPIRES),
      fileId,
      dekVersion,
    });
    return { uploadId: id };
  });
};

export const uploadChunk = async (
  userId: number,
  sessionId: string,
  chunkIndex: number,
  encChunkStream: Readable,
) => {
  const session = await UploadRepo.getUploadSession(sessionId, userId);
  if (!session) {
    throw new AppError("NOT_FOUND", "Invalid upload id");
  } else if (chunkIndex > session.totalChunks) {
    throw new AppError("BAD_REQUEST", "Invalid chunk index");
  } else if (isChunkUploaded(session.bitmap, chunkIndex)) {
    throw new AppError("CONFLICT", "Chunk already uploaded");
  }

  // Concurrent uploads of the same chunk may corrupt the file, which will be detected by the
  // hash verification on completion
  const isLastChunk = chunkIndex === session.totalChunks;
  await writeChunkAtOffset(session.path, encChunkStream, chunkIndex, isLastChunk);
  await UploadRepo.markChunkAsUploaded(sessionId, chunkIndex);
};

const getCompletedUploadSession = async <T extends "file" | "thumbnail">(
  userId: number,
  uploadId: string,
  type: T,
) => {
  const session = await UploadRepo.getUploadSession(uploadId, userId);
  if (session?.type !== type) {
    throw new AppError("NOT_FOUND", "Invalid upload id");
  } else if (session.uploadedChunks < session.totalChunks) {
    throw new AppError("BAD_REQUEST", "Upload not completed");
  }
  return session as Extract<NonNullable<typeof session>, { type: T }>;
};

export const completeFileUpload = async (
  userId: number,
  uploadId: string,
  contentHmac: string | null,
  encContentHash: string,
) => {
  const session = await getCompletedUploadSession(userId, uploadId, "file");
  if (!!session.hskVersion !== !!contentHmac) {
    throw new AppError("BAD_REQUEST", "Invalid content HMAC");
  }

  const hash = await hashFile(session.path);
  if (hash !== encContentHash) {
    await UploadRepo.discardUploadSession(uploadId);
    schedulePendingFileDeletions();
    throw new AppError("CONFLICT", "Uploaded file corrupted");
  }

  return await db.transaction().execute(async (trx) => {
    // Locking the session ensures that it is completed only once
    const lockedSession = await UploadRepo.lockUploadSession(trx, uploadId, userId);
    if (lockedSession.type !== "file") {
      throw new AppError("NOT_FOUND", "Invalid upload id");
    }

    const { id: fileId } = await FileRepo.registerFile(trx, {
      parentId: lockedSession.parentId,
      userId,
      path: lockedSession.path,
      mekVersion: lockedSession.mekVersion,
      encDek: lockedSession.encDek,
      dekVersion: lockedSession.dekVersion,
      hskVersion: lockedSession.hskVersion,
      contentHmac,
      contentType: lockedSession.contentType,
      encContentIv: null,
      encContentHash: hash,
      encName: lockedSession.encName,
      encCreatedAt: lockedSession.encCreatedAt,
      encLastModifiedAt: lockedSession.encLastModifiedAt,
    });
    await UploadRepo.deleteUploadSession(trx, uploadId);
    return { fileId };
  });
};

export const completeFileThumbnailUpload = async (userId: number, uploadId: string) => {
  await getCompletedUploadSession(userId, uploadId, "thumbnail");

  await db.transaction().execute(async (trx) => {
    const session = await UploadRepo.lockUploadSession(trx, uploadId, userId);
    if (session.type !== "thumbnail") {
      throw new AppError("NOT_FOUND", "Invalid upload id");
    }

    await MediaRepo.updateFileThumbnail(
      trx,
      userId,
      session.fileId,
      session.dekVersion,
      session.path,
      null,
    );
    await UploadRepo.deleteUploadSession(trx, uploadId);
  });
  schedulePendingFileDeletions();
};

export const cleanupExpiredUploadSessions = async () => {
  await UploadRepo.cleanupExpiredUploadSessions();
  schedulePendingFileDeletions();
};
