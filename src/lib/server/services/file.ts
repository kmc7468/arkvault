import {
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
import { createEncContentStream } from "#lib/server/storage/index.ts";
import type { RangeRequest } from "#lib/shared/http.ts";
import { dekVersionMismatchOrNotFound } from "./common.ts";
import { schedulePendingFileDeletions } from "./file-deletion.ts";

const fileNotFoundError = () => new AppError("NOT_FOUND", "File not found");

export const getFile = async (userId: number, fileId: number) => {
  const file = await FileRepo.getFile(db, userId, fileId);
  if (!file) {
    throw fileNotFoundError();
  }

  const categories = await FileRepo.getAllFileCategories(db, fileId);
  return { ...file, categories };
};

export const getFiles = async (userId: number, fileIds: number[]) => {
  return await FileRepo.getFilesWithCategories(db, userId, fileIds);
};

export const getAllFileIds = async (userId: number) => {
  return await FileRepo.getAllFileIds(db, userId);
};

export const getFileIdsByContentHmac = async (
  userId: number,
  hskVersion: number,
  contentHmac: string,
) => {
  return await FileRepo.getAllFileIdsByContentHmac(db, userId, hskVersion, contentHmac);
};

export const getFilesWithoutThumbnail = async (userId: number) => {
  return await FileRepo.getFilesWithoutThumbnail(db, userId);
};

export const renameFile = async (
  userId: number,
  fileId: number,
  dekVersion: Date,
  encName: Ciphertext,
) => {
  await transaction(async (trx) => {
    if (!(await FileRepo.setFileEncName(trx, userId, fileId, dekVersion, encName))) {
      throw await dekVersionMismatchOrNotFound(
        FileRepo.getFile(trx, userId, fileId),
        "File not found",
      );
    }

    await LogRepo.appendFileLog(trx, { file_id: fileId, action: "rename", new_name: encName });
  });
};

export const deleteFile = async (userId: number, fileId: number) => {
  await transaction(async (trx) => {
    const file = await FileRepo.lockFileForDeletion(trx, userId, fileId);
    if (!file) {
      throw fileNotFoundError();
    }

    const uploadPaths = await UploadRepo.deleteUploadSessionsOf(trx, { fileIds: [fileId] });
    await FileRepo.deleteFiles(trx, [fileId]);
    await FileDeletionRepo.enqueueFileDeletions(trx, [
      file.path,
      file.thumbnailPath,
      ...uploadPaths,
    ]);
  });

  schedulePendingFileDeletions();
};

export const getFavoriteFiles = async (userId: number) => {
  return await FileRepo.getAllFavoriteFiles(db, userId);
};

// Does nothing if the file is already in the state
export const setFileFavorite = async (userId: number, fileId: number, isFavorite: boolean) => {
  await transaction(async (trx) => {
    if (!(await FileRepo.setFileFavorite(trx, userId, fileId, isFavorite))) {
      if (!(await FileRepo.getFile(trx, userId, fileId))) {
        throw fileNotFoundError();
      }
      return;
    }

    await LogRepo.appendFileLog(trx, {
      file_id: fileId,
      action: isFavorite ? "add-to-favorites" : "remove-from-favorites",
    });
  });
};

export const getFileThumbnail = async (userId: number, fileId: number) => {
  const thumbnail = await MediaRepo.getFileThumbnail(db, userId, fileId);
  if (!thumbnail) {
    throw new AppError("NOT_FOUND", "File or its thumbnail not found");
  }
  return thumbnail;
};

const decodeIv = (iv: string | null) => (iv ? Buffer.from(iv, "base64") : undefined);

export const getFileStream = async (userId: number, fileId: number, range?: RangeRequest) => {
  const file = await FileRepo.getFile(db, userId, fileId);
  if (!file) {
    throw fileNotFoundError();
  }
  return await createEncContentStream(file.path, decodeIv(file.encContentIv), range);
};

export const getFileThumbnailStream = async (
  userId: number,
  fileId: number,
  range?: RangeRequest,
) => {
  const thumbnail = await getFileThumbnail(userId, fileId);
  return await createEncContentStream(thumbnail.path, decodeIv(thumbnail.encContentIv), range);
};
