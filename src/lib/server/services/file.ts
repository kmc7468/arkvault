import { FileRepo, MediaRepo } from "#lib/server/db/index.ts";
import type { Ciphertext } from "#lib/server/db/schema/index.ts";
import { AppError } from "#lib/server/errors.ts";
import { createEncContentStream } from "#lib/server/storage/index.ts";
import type { RangeRequest } from "#lib/shared/http.ts";
import { schedulePendingFileDeletions } from "./file-deletion.ts";

export const getFile = async (userId: number, fileId: number) => {
  const file = await FileRepo.getFile(userId, fileId);
  if (!file) {
    throw new AppError("NOT_FOUND", "File not found");
  }

  const categories = await FileRepo.getAllFileCategories(fileId);
  return { ...file, categories };
};

export const getFiles = async (userId: number, fileIds: number[]) => {
  return await FileRepo.getFilesWithCategories(userId, fileIds);
};

export const getAllFileIds = async (userId: number) => {
  return await FileRepo.getAllFileIds(userId);
};

export const getFileIdsByContentHmac = async (
  userId: number,
  hskVersion: number,
  contentHmac: string,
) => {
  return await FileRepo.getAllFileIdsByContentHmac(userId, hskVersion, contentHmac);
};

export const getFilesWithoutThumbnail = async (userId: number) => {
  return await FileRepo.getFilesWithoutThumbnail(userId);
};

export const renameFile = async (
  userId: number,
  fileId: number,
  dekVersion: Date,
  encName: Ciphertext,
) => {
  await FileRepo.setFileEncName(userId, fileId, dekVersion, encName);
};

export const deleteFile = async (userId: number, fileId: number) => {
  await FileRepo.unregisterFile(userId, fileId);
  schedulePendingFileDeletions();
};

export const getFavoriteFiles = async (userId: number) => {
  return await FileRepo.getAllFavoriteFiles(userId);
};

export const setFileFavorite = async (userId: number, fileId: number, isFavorite: boolean) => {
  await FileRepo.setFileFavorite(userId, fileId, isFavorite);
};

export const getFileThumbnail = async (userId: number, fileId: number) => {
  const thumbnail = await MediaRepo.getFileThumbnail(userId, fileId);
  if (!thumbnail) {
    throw new AppError("NOT_FOUND", "File or its thumbnail not found");
  }
  return thumbnail;
};

const decodeIv = (iv: string | null) => (iv ? Buffer.from(iv, "base64") : undefined);

export const getFileStream = async (userId: number, fileId: number, range?: RangeRequest) => {
  const file = await FileRepo.getFile(userId, fileId);
  if (!file) {
    throw new AppError("NOT_FOUND", "File not found");
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
