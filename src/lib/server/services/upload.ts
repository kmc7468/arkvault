import type { Readable } from "stream";
import {
  DirectoryRepo,
  FileDeletionRepo,
  FileRepo,
  LogRepo,
  MediaRepo,
  UploadRepo,
  db,
  transaction,
} from "#lib/server/db/index.ts";
import type { Ciphertext } from "#lib/server/db/schema/index.ts";
import { AppError } from "#lib/server/errors.ts";
import {
  deleteFile,
  hashFile,
  reserveFile,
  writeChunkAtOffset,
} from "#lib/server/storage/index.ts";
import {
  ensureActiveHskVersion,
  ensureActiveMekVersion,
  ensureFileDekVersion,
  ensureFreshDekVersion,
} from "./common.ts";
import { schedulePendingFileDeletions } from "./file-deletion.ts";

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
    await transaction(async (trx) => {
      await ensureActiveMekVersion(trx, params.userId, params.mekVersion);
      if (params.hskVersion) {
        await ensureActiveHskVersion(trx, params.userId, params.hskVersion);
      }
      if (
        params.parentId !== "root" &&
        !(await DirectoryRepo.lockDirectory(trx, params.userId, params.parentId))
      ) {
        throw new AppError("NOT_FOUND", "Directory not found");
      }

      await UploadRepo.createFileUploadSession(trx, {
        ...params,
        id,
        path,
        expiresAt: new Date(Date.now() + UPLOAD_EXPIRES),
      });
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
    await transaction(async (trx) => {
      await ensureFileDekVersion(trx, userId, fileId, dekVersion);
      await UploadRepo.createThumbnailUploadSession(trx, {
        id,
        userId,
        path,
        totalChunks: THUMBNAIL_CHUNKS,
        expiresAt: new Date(Date.now() + UPLOAD_EXPIRES),
        fileId,
        dekVersion,
      });
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
  const session = await UploadRepo.getUploadSession(db, sessionId, userId);
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
  await UploadRepo.markChunkAsUploaded(db, sessionId, chunkIndex);
};

const getCompletedUploadSession = async <T extends "file" | "thumbnail">(
  userId: number,
  uploadId: string,
  type: T,
) => {
  const session = await UploadRepo.getUploadSession(db, uploadId, userId);
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
    await transaction(async (trx) => {
      await FileDeletionRepo.enqueueFileDeletions(
        trx,
        await UploadRepo.deleteUploadSession(trx, uploadId),
      );
    });
    schedulePendingFileDeletions();
    throw new AppError("CONFLICT", "Uploaded file corrupted");
  }

  return await transaction(async (trx) => {
    // Locking the session ensures that it is completed only once
    const lockedSession = await UploadRepo.lockUploadSession(trx, uploadId, userId);
    if (lockedSession?.type !== "file") {
      throw new AppError("NOT_FOUND", "Invalid upload id");
    }

    const { id: fileId } = await FileRepo.createFile(trx, {
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
    await LogRepo.appendFileLog(trx, {
      file_id: fileId,
      action: "create",
      new_name: lockedSession.encName,
    });
    await UploadRepo.deleteUploadSession(trx, uploadId);
    return { fileId };
  });
};

export const completeFileThumbnailUpload = async (userId: number, uploadId: string) => {
  await getCompletedUploadSession(userId, uploadId, "thumbnail");

  await transaction(async (trx) => {
    const session = await UploadRepo.lockUploadSession(trx, uploadId, userId);
    if (session?.type !== "thumbnail") {
      throw new AppError("NOT_FOUND", "Invalid upload id");
    }

    await ensureFileDekVersion(trx, userId, session.fileId, session.dekVersion);
    const oldPath = await MediaRepo.lockFileThumbnailPath(trx, session.fileId);
    await MediaRepo.upsertFileThumbnail(trx, session.fileId, session.path, null);
    await UploadRepo.deleteUploadSession(trx, uploadId);
    await FileDeletionRepo.enqueueFileDeletions(trx, [oldPath]);
  });
  schedulePendingFileDeletions();
};

export const cleanupExpiredUploadSessions = async () => {
  await transaction(async (trx) => {
    await FileDeletionRepo.enqueueFileDeletions(
      trx,
      await UploadRepo.deleteExpiredUploadSessions(trx),
    );
  });
  schedulePendingFileDeletions();
};
