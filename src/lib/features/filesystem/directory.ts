import { deleteFileCache, deleteFileThumbnailCache } from "#lib/client/cache/index.js";
import * as IndexedDB from "#lib/client/storage/indexedDB/index.js";
import { isTRPCClientError, trpc } from "#trpc/client.js";
import { FilesystemCache } from "./cache.svelte";
import {
  decryptDirectoryMetadata,
  decryptFileMetadata,
  encryptName,
  generateEntryKeys,
} from "./metadata";
import { useResource } from "./resource.svelte";
import type { DataKey, DirectoryInfo, MaybeDirectoryInfo } from "./types";

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
        isFavorite: directory.isFavorite,
      };
    }
  },

  async fetchFromServer(id) {
    try {
      const directory = await trpc.directory.get.query({ id });
      const [subDirectories, files, metadata] = await Promise.all([
        Promise.all(
          directory.subDirectories.map(async (directory) => ({
            id: directory.id,
            parentId: id,
            isFavorite: directory.isFavorite,
            ...(await decryptDirectoryMetadata(directory)),
          })),
        ),
        Promise.all(
          directory.files.map(async (file) => ({
            id: file.id,
            parentId: id,
            contentType: file.contentType,
            isFavorite: file.isFavorite,
            ...(await decryptFileMetadata(file)),
          })),
        ),
        directory.metadata && decryptDirectoryMetadata(directory.metadata),
      ]);

      return storeToIndexedDB(
        id !== "root"
          ? {
              id,
              parentId: directory.metadata!.parent,
              subDirectories,
              files,
              isFavorite: directory.metadata!.isFavorite,
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
  options?: {
    serverResponse?: {
      parent: DirectoryId;
      mekVersion: number;
      dek: string;
      dekVersion: Date;
      name: string;
      nameIv: string;
      isFavorite: boolean;
    };
  },
) => {
  return cache.get(id, {
    fetchFromServer:
      options?.serverResponse &&
      (async (cachedValue) => {
        const metadata = await decryptDirectoryMetadata(options!.serverResponse!);
        return storeToIndexedDB({
          subDirectories: [],
          files: [],
          ...cachedValue,
          id: id as number,
          parentId: options!.serverResponse!.parent,
          isFavorite: options!.serverResponse!.isFavorite,
          ...metadata,
        });
      }),
  });
};

export const useDirectory = (getId: () => DirectoryId) => {
  return useResource(getId, (id) => getDirectoryInfo(id));
};

export const invalidateDirectory = (id: DirectoryId) => {
  cache.invalidate(id);
};

export const createDirectory = async (parentId: DirectoryId, name: string) => {
  await trpc.directory.create.mutate({ parent: parentId, ...(await generateEntryKeys(name)) });
  invalidateDirectory(parentId);
};

export const renameDirectory = async (
  directory: { id: number; parentId: DirectoryId; dataKey?: DataKey },
  newName: string,
) => {
  if (!directory.dataKey) {
    throw new Error("Data key not loaded");
  }

  await trpc.directory.rename.mutate({
    id: directory.id,
    dekVersion: directory.dataKey.version,
    ...(await encryptName(newName, directory.dataKey.key)),
  });
  invalidateDirectory(directory.parentId);
  invalidateDirectory(directory.id);
};

export const deleteDirectory = async (directory: { id: number; parentId: DirectoryId }) => {
  const { deletedFiles } = await trpc.directory.delete.mutate({ id: directory.id });
  cache.evict(directory.id);
  invalidateDirectory(directory.parentId);

  await Promise.all(
    deletedFiles.flatMap((fileId) => [deleteFileCache(fileId), deleteFileThumbnailCache(fileId)]),
  );
};

export const setDirectoryFavorite = async (
  directory: { id: number; parentId: DirectoryId },
  isFavorite: boolean,
) => {
  if (isFavorite) {
    await trpc.favorites.addDirectory.mutate({ id: directory.id });
  } else {
    await trpc.favorites.removeDirectory.mutate({ id: directory.id });
  }
  invalidateDirectory(directory.parentId);
  invalidateDirectory(directory.id);
};
