import { deleteFileCache, deleteFileThumbnailCache } from "#lib/client/cache/index.ts";
import * as IndexedDB from "#lib/client/storage/indexed-db/index.ts";
import { isTRPCClientError, trpc } from "#trpc/client.ts";
import { FilesystemCache } from "./cache.svelte.ts";
import { invalidateDirectory } from "./directory.ts";
import { toFileInfo, toFileWithCategoriesInfo, type FileDto } from "./dto.ts";
import { encryptName } from "./metadata.ts";
import { useResource } from "./resource.svelte.ts";
import type { DataKey, FileInfo, MaybeFileInfo } from "./types.ts";

// Categories of files stored in IndexedDB, which may have been deleted
const getFileCategoryInfos = async (categoryIds: number[] | undefined) => {
  const categories = await Promise.all(
    (categoryIds ?? []).map((id) => IndexedDB.getCategoryInfo(id)),
  );
  return categories
    .filter((category) => !!category)
    .map(({ id, parentId, name }) => ({ id, parentId, name }));
};

const cache = new FilesystemCache<number, MaybeFileInfo>({
  async fetchFromIndexedDB(id) {
    const file = await IndexedDB.getFileInfo(id);
    if (file) {
      return {
        id,
        exists: true,
        parentId: file.parentId,
        contentType: file.contentType,
        name: file.name,
        createdAt: file.createdAt,
        lastModifiedAt: file.lastModifiedAt,
        categories: await getFileCategoryInfos(file.categoryIds),
        isFavorite: file.isFavorite,
      };
    }
  },

  async fetchFromServer(id) {
    try {
      return storeToIndexedDB(await toFileWithCategoriesInfo(await trpc.file.get.query({ id })));
    } catch (e) {
      if (isTRPCClientError(e) && e.data?.code === "NOT_FOUND") {
        await IndexedDB.deleteFileInfo(id);
        return { id, exists: false as const };
      }
      throw e;
    }
  },

  async bulkFetchFromIndexedDB(ids) {
    const files = (await IndexedDB.bulkGetFileInfos([...ids])).filter((file) => !!file);
    return new Map(
      await Promise.all(
        files.map(
          async (file) =>
            [
              file.id,
              {
                ...file,
                exists: true as const,
                categories: await getFileCategoryInfos(file.categoryIds),
              },
            ] as const,
        ),
      ),
    );
  },

  async bulkFetchFromServer(ids) {
    const idsArray = [...ids.keys()];

    const filesRaw = await trpc.file.bulkGet.query({ ids: idsArray });
    const files = await Promise.all(filesRaw.map(toFileWithCategoriesInfo));

    const existingIds = new Set(filesRaw.map(({ id }) => id));
    const deletedIds = idsArray.filter((id) => !existingIds.has(id));

    void IndexedDB.bulkDeleteFileInfos(deletedIds);
    return new Map<number, MaybeFileInfo>([
      ...bulkStoreToIndexedDB(files),
      ...deletedIds.map((id) => [id, { id, exists: false }] as const),
    ]);
  },
});

const storeToIndexedDB = (info: FileInfo) => {
  void IndexedDB.storeFileInfo({
    ...info,
    categoryIds: info.categories.map(({ id }) => id),
  });

  info.categories.forEach((category) => {
    void IndexedDB.storeCategoryInfo(category);
  });

  return { ...info, exists: true as const };
};

const bulkStoreToIndexedDB = (infos: FileInfo[]) => {
  // TODO: Bulk Upsert
  infos.forEach((info) => {
    void IndexedDB.storeFileInfo({
      ...info,
      categoryIds: info.categories.map(({ id }) => id),
    });
  });

  // TODO: Bulk Upsert
  new Map(
    infos.flatMap(({ categories }) => categories).map((category) => [category.id, category]),
  ).forEach((category) => {
    void IndexedDB.storeCategoryInfo(category);
  });

  return infos.map((info) => [info.id, { ...info, exists: true }] as const);
};

// Uses `serverResponse` instead of fetching the file from the server if given
export const getFileInfo = (id: number, options?: { serverResponse?: FileDto }) => {
  const serverResponse = options?.serverResponse;
  return cache.get(id, {
    fetchFromServer:
      serverResponse &&
      (async (cachedValue) =>
        storeToIndexedDB({
          categories: [],
          ...cachedValue,
          ...(await toFileInfo(serverResponse)),
        })),
  });
};

export const bulkGetFileInfo = (ids: number[]) => {
  return cache.bulkGet(new Set(ids));
};

export const useFile = (getId: () => number) => {
  return useResource(getId, (id) => getFileInfo(id));
};

export const invalidateFile = (id: number) => {
  cache.invalidate(id);
};

export const renameFile = async (
  file: { id: number; parentId: DirectoryId; dataKey?: DataKey },
  newName: string,
) => {
  if (!file.dataKey) {
    throw new Error("Data key not loaded");
  }

  await trpc.file.rename.mutate({
    id: file.id,
    dekVersion: file.dataKey.version,
    ...(await encryptName(newName, file.dataKey.key)),
  });
  invalidateDirectory(file.parentId);
  invalidateFile(file.id);
};

export const deleteFile = async (file: { id: number; parentId: DirectoryId }) => {
  await trpc.file.delete.mutate({ id: file.id });
  cache.evict(file.id);
  invalidateDirectory(file.parentId);

  await Promise.all([deleteFileCache(file.id), deleteFileThumbnailCache(file.id)]);
};

export const setFileFavorite = async (
  file: { id: number; parentId: DirectoryId },
  isFavorite: boolean,
) => {
  if (isFavorite) {
    await trpc.favorites.addFile.mutate({ id: file.id });
  } else {
    await trpc.favorites.removeFile.mutate({ id: file.id });
  }
  invalidateDirectory(file.parentId);
  invalidateFile(file.id);
};

// The most recently created media files among the files stored locally
export const getRecentMediaFileInfos = async (limit: number) => {
  const files = await IndexedDB.getAllFileInfos();
  return files
    .filter(
      ({ contentType }) => contentType.startsWith("image/") || contentType.startsWith("video/"),
    )
    .sort(
      (a, b) =>
        (b.createdAt ?? b.lastModifiedAt).getTime() - (a.createdAt ?? a.lastModifiedAt).getTime(),
    )
    .slice(0, limit);
};
