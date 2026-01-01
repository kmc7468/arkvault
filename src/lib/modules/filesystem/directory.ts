import * as IndexedDB from "$lib/indexedDB";
import { monotonicResolve } from "$lib/utils";
import { trpc, isTRPCClientError } from "$trpc/client";
import { FilesystemCache, decryptDirectoryMetadata, decryptFileMetadata } from "./internal.svelte";
import type { MaybeDirectoryInfo } from "./types";

const cache = new FilesystemCache<DirectoryId, MaybeDirectoryInfo>();

const fetchFromIndexedDB = async (id: DirectoryId) => {
  const [directory, subDirectories, files] = await Promise.all([
    id !== "root" ? IndexedDB.getDirectoryInfo(id) : undefined,
    IndexedDB.getDirectoryInfos(id),
    IndexedDB.getFileInfos(id),
  ]);

  if (id === "root") {
    return {
      id,
      exists: true as const,
      subDirectories,
      files,
    };
  } else if (directory) {
    return {
      id,
      exists: true as const,
      parentId: directory.parentId,
      name: directory.name,
      subDirectories,
      files,
    };
  }
};

const fetchFromServer = async (id: DirectoryId, masterKey: CryptoKey) => {
  try {
    const {
      metadata,
      subDirectories: subDirectoriesRaw,
      files: filesRaw,
    } = await trpc().directory.get.query({ id });
    const [subDirectories, files] = await Promise.all([
      Promise.all(
        subDirectoriesRaw.map(async (directory) => ({
          id: directory.id,
          ...(await decryptDirectoryMetadata(directory, masterKey)),
        })),
      ),
      Promise.all(
        filesRaw.map(async (file) => ({
          id: file.id,
          contentType: file.contentType,
          ...(await decryptFileMetadata(file, masterKey)),
        })),
      ),
    ]);

    if (id === "root") {
      return {
        id,
        exists: true as const,
        subDirectories,
        files,
      };
    } else {
      return {
        id,
        exists: true as const,
        parentId: metadata!.parent,
        subDirectories,
        files,
        ...(await decryptDirectoryMetadata(metadata!, masterKey)),
      };
    }
  } catch (e) {
    if (isTRPCClientError(e) && e.data?.code === "NOT_FOUND") {
      await IndexedDB.deleteDirectoryInfo(id as number);
      return { id, exists: false as const };
    }
    throw e;
  }
};

export const getDirectoryInfo = async (id: DirectoryId, masterKey: CryptoKey) => {
  return await cache.get(id, (isInitial, resolve) =>
    monotonicResolve(
      [isInitial && fetchFromIndexedDB(id), fetchFromServer(id, masterKey)],
      resolve,
    ),
  );
};
