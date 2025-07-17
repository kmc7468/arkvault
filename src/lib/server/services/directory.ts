import { error } from "@sveltejs/kit";
import { unlink } from "fs/promises";
import { IntegrityError } from "$lib/server/db/error";
import {
  registerDirectory,
  getAllDirectoriesByParent,
  getDirectory,
  setDirectoryEncName,
  unregisterDirectory,
  getAllFilesByParent,
  type DirectoryId,
  type NewDirectory,
} from "$lib/server/db/file";
import type { Ciphertext } from "$lib/server/db/schema";

export const getDirectoryInformation = async (userId: number, directoryId: DirectoryId) => {
  const directory = directoryId !== "root" ? await getDirectory(userId, directoryId) : undefined;
  if (directory === null) {
    error(404, "Invalid directory id");
  }

  const directories = await getAllDirectoriesByParent(userId, directoryId);
  const files = await getAllFilesByParent(userId, directoryId);
  return {
    metadata: directory && {
      parentId: directory.parentId ?? ("root" as const),
      mekVersion: directory.mekVersion,
      encDek: directory.encDek,
      dekVersion: directory.dekVersion,
      encName: directory.encName,
    },
    directories: directories.map(({ id }) => id),
    files: files.map(({ id }) => id),
  };
};

const safeUnlink = async (path: string | null) => {
  if (path) {
    await unlink(path).catch(console.error);
  }
};

export const deleteDirectory = async (userId: number, directoryId: number) => {
  try {
    const files = await unregisterDirectory(userId, directoryId);
    return {
      files: files.map(({ id, path, thumbnailPath }) => {
        safeUnlink(path); // Intended
        safeUnlink(thumbnailPath); // Intended
        return id;
      }),
    };
  } catch (e) {
    if (e instanceof IntegrityError && e.message === "Directory not found") {
      error(404, "Invalid directory id");
    }
    throw e;
  }
};

export const renameDirectory = async (
  userId: number,
  directoryId: number,
  dekVersion: Date,
  newEncName: Ciphertext,
) => {
  try {
    await setDirectoryEncName(userId, directoryId, dekVersion, newEncName);
  } catch (e) {
    if (e instanceof IntegrityError) {
      if (e.message === "Directory not found") {
        error(404, "Invalid directory id");
      } else if (e.message === "Invalid DEK version") {
        error(400, "Invalid DEK version");
      }
    }
    throw e;
  }
};

export const createDirectory = async (params: NewDirectory) => {
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  const oneMinuteLater = new Date(Date.now() + 60 * 1000);
  if (params.dekVersion <= oneMinuteAgo || params.dekVersion >= oneMinuteLater) {
    error(400, "Invalid DEK version");
  }

  try {
    const { id } = await registerDirectory(params);
    return { id };
  } catch (e) {
    if (e instanceof IntegrityError && e.message === "Inactive MEK version") {
      error(400, "Invalid MEK version");
    }
    throw e;
  }
};
