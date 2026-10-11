import { DirectoryRepo, FileRepo } from "#lib/server/db/index.js";
import type { Ciphertext } from "#lib/server/db/schema/index.js";
import { AppError } from "#lib/server/errors.js";
import { ensureFreshDekVersion } from "./common";
import { schedulePendingFileDeletions } from "./fileDeletion";

export const getDirectory = async (userId: number, directoryId: DirectoryId) => {
  const directory =
    directoryId !== "root" ? await DirectoryRepo.getDirectory(userId, directoryId) : undefined;
  if (directory === null) {
    throw new AppError("NOT_FOUND", "Directory not found");
  }

  const [subDirectories, files] = await Promise.all([
    DirectoryRepo.getAllDirectoriesByParent(userId, directoryId),
    FileRepo.getAllFilesByParent(userId, directoryId),
  ]);
  return { directory, subDirectories, files };
};

export const createDirectory = async (params: {
  userId: number;
  parentId: DirectoryId;
  mekVersion: number;
  encDek: string;
  dekVersion: Date;
  encName: Ciphertext;
}) => {
  ensureFreshDekVersion(params.dekVersion);
  await DirectoryRepo.registerDirectory(params);
};

export const renameDirectory = async (
  userId: number,
  directoryId: number,
  dekVersion: Date,
  encName: Ciphertext,
) => {
  await DirectoryRepo.setDirectoryEncName(userId, directoryId, dekVersion, encName);
};

export const deleteDirectory = async (userId: number, directoryId: number) => {
  const { deletedFileIds } = await DirectoryRepo.unregisterDirectory(userId, directoryId);
  schedulePendingFileDeletions();
  return { deletedFileIds };
};

export const getFavoriteDirectories = async (userId: number) => {
  return await DirectoryRepo.getAllFavoriteDirectories(userId);
};

export const setDirectoryFavorite = async (
  userId: number,
  directoryId: number,
  isFavorite: boolean,
) => {
  await DirectoryRepo.setDirectoryFavorite(userId, directoryId, isFavorite);
};
