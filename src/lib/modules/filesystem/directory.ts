import * as IndexedDB from "$lib/indexedDB";
import { trpc, isTRPCClientError } from "$trpc/client";
import { decryptDirectoryMetadata, decryptFileMetadata } from "./common";
import { FilesystemCache, type FilesystemCacheOptions } from "./FilesystemCache.svelte";
import type { DirectoryInfo, MaybeDirectoryInfo } from "./types";

const cache = new FilesystemCache<DirectoryId, MaybeDirectoryInfo>({
  async fetchFromIndexedDB(id) {
    const [directory, subDirectories, files] = await Promise.all([
      id !== "root" ? IndexedDB.getDirectoryInfo(id) : undefined,
      IndexedDB.getDirectoryInfos(id),
      IndexedDB.getFileInfos(id),
    ]);

    if (id === "root") {
      return {
        id,
        exists: true,
        subDirectories,
        files,
      };
    } else if (directory) {
      return {
        id,
        exists: true,
        parentId: directory.parentId,
        name: directory.name,
        subDirectories,
        files,
      };
    }
  },

  async fetchFromServer(id, _cachedInfo, masterKey) {
    try {
      const directory = await trpc().directory.get.query({ id });
      const [subDirectories, files, metadata] = await Promise.all([
        Promise.all(
          directory.subDirectories.map(async (directory) => ({
            id: directory.id,
            parentId: id,
            ...(await decryptDirectoryMetadata(directory, masterKey)),
          })),
        ),
        Promise.all(
          directory.files.map(async (file) => ({
            id: file.id,
            parentId: id,
            contentType: file.contentType,
            ...(await decryptFileMetadata(file, masterKey)),
          })),
        ),
        directory.metadata && decryptDirectoryMetadata(directory.metadata, masterKey),
      ]);

      return storeToIndexedDB(
        id !== "root"
          ? {
              id,
              parentId: directory.metadata!.parent,
              subDirectories,
              files,
              ...metadata!,
            }
          : { id, subDirectories, files },
      );
    } catch (e) {
      if (isTRPCClientError(e) && e.data?.code === "NOT_FOUND") {
        await IndexedDB.deleteDirectoryInfo(id as number);
        return { id, exists: false as const };
      }
      throw e;
    }
  },
});

const storeToIndexedDB = (info: DirectoryInfo) => {
  if (info.id !== "root") {
    void IndexedDB.storeDirectoryInfo(info);
  }

  // TODO: Bulk Upsert
  info.subDirectories.forEach((subDirectory) => {
    void IndexedDB.storeDirectoryInfo(subDirectory);
  });

  // TODO: Bulk Upsert
  info.files.forEach((file) => {
    void IndexedDB.storeFileInfo(file);
  });

  void IndexedDB.deleteDanglingDirectoryInfos(
    info.id,
    new Set(info.subDirectories.map(({ id }) => id)),
  );
  void IndexedDB.deleteDanglingFileInfos(info.id, new Set(info.files.map(({ id }) => id)));

  return { ...info, exists: true as const };
};

export const getDirectoryInfo = (
  id: DirectoryId,
  masterKey: CryptoKey,
  options?: {
    fetchFromServer?: FilesystemCacheOptions<DirectoryId, MaybeDirectoryInfo>["fetchFromServer"];
  },
) => {
  return cache.get(id, masterKey, options);
};
