import {
  DirectoryRepo,
  FileDeletionRepo,
  FileRepo,
  LogRepo,
  UploadRepo,
  db,
  transaction,
} from "#lib/server/db/index.ts";
import type { Ciphertext } from "#lib/server/db/schema/index.ts";
import { AppError } from "#lib/server/errors.ts";
import {
  dekVersionMismatchOrNotFound,
  ensureActiveMekVersion,
  ensureFreshDekVersion,
} from "./common.ts";
import { schedulePendingFileDeletions } from "./file-deletion.ts";

const directoryNotFoundError = () => new AppError("NOT_FOUND", "Directory not found");

export const getDirectory = async (userId: number, directoryId: DirectoryId) => {
  const directory =
    directoryId !== "root" ? await DirectoryRepo.getDirectory(db, userId, directoryId) : undefined;
  if (directory === null) {
    throw directoryNotFoundError();
  }

  const [subDirectories, files] = await Promise.all([
    DirectoryRepo.getAllDirectoriesByParent(db, userId, directoryId),
    FileRepo.getAllFilesByParent(db, userId, directoryId),
  ]);
  return { directory, subDirectories, files };
};

export const createDirectory = async (params: DirectoryRepo.NewDirectory) => {
  ensureFreshDekVersion(params.dekVersion);

  await transaction(async (trx) => {
    await ensureActiveMekVersion(trx, params.userId, params.mekVersion);
    if (
      params.parentId !== "root" &&
      !(await DirectoryRepo.lockDirectory(trx, params.userId, params.parentId))
    ) {
      throw directoryNotFoundError();
    }

    const { id } = await DirectoryRepo.createDirectory(trx, params);
    await LogRepo.appendDirectoryLog(trx, {
      directory_id: id,
      action: "create",
      new_name: params.encName,
    });
  });
};

export const renameDirectory = async (
  userId: number,
  directoryId: number,
  dekVersion: Date,
  encName: Ciphertext,
) => {
  await transaction(async (trx) => {
    if (!(await DirectoryRepo.setDirectoryEncName(trx, userId, directoryId, dekVersion, encName))) {
      throw await dekVersionMismatchOrNotFound(
        DirectoryRepo.getDirectory(trx, userId, directoryId),
        "Directory not found",
      );
    }

    await LogRepo.appendDirectoryLog(trx, {
      directory_id: directoryId,
      action: "rename",
      new_name: encName,
    });
  });
};

// Deletes the directory with its descendants and files
export const deleteDirectory = async (userId: number, directoryId: number) => {
  const deletedFileIds = await transaction(async (trx) => {
    const directoryIds = await DirectoryRepo.lockDirectoryTree(trx, userId, directoryId);
    if (directoryIds.length === 0) {
      throw directoryNotFoundError();
    }

    const files = await FileRepo.lockFilesInDirectoriesForDeletion(trx, directoryIds);
    const fileIds = files.map(({ id }) => id);
    const uploadPaths = await UploadRepo.deleteUploadSessionsOf(trx, { directoryIds, fileIds });
    await FileRepo.deleteFiles(trx, fileIds);
    await DirectoryRepo.deleteDirectories(trx, directoryIds);

    await FileDeletionRepo.enqueueFileDeletions(trx, [
      ...files.flatMap(({ path, thumbnailPath }) => [path, thumbnailPath]),
      ...uploadPaths,
    ]);
    return fileIds;
  });

  schedulePendingFileDeletions();
  return { deletedFileIds };
};

export const getFavoriteDirectories = async (userId: number) => {
  return await DirectoryRepo.getAllFavoriteDirectories(db, userId);
};

// Does nothing if the directory is already in the state
export const setDirectoryFavorite = async (
  userId: number,
  directoryId: number,
  isFavorite: boolean,
) => {
  await transaction(async (trx) => {
    if (!(await DirectoryRepo.setDirectoryFavorite(trx, userId, directoryId, isFavorite))) {
      if (!(await DirectoryRepo.getDirectory(trx, userId, directoryId))) {
        throw directoryNotFoundError();
      }
      return;
    }

    await LogRepo.appendDirectoryLog(trx, {
      directory_id: directoryId,
      action: isFavorite ? "add-to-favorites" : "remove-from-favorites",
    });
  });
};
