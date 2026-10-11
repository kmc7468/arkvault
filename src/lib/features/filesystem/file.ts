import { deleteFileCache, deleteFileThumbnailCache } from "#lib/client/cache/index.ts";
import * as IndexedDB from "#lib/client/storage/indexed-db/index.ts";
import { isTRPCClientError, trpc } from "#trpc/client.ts";
import { FilesystemCache } from "./cache.svelte.ts";
import { invalidateDirectory } from "./directory.ts";
import { decryptCategoryMetadata, decryptFileMetadata, encryptName } from "./metadata.ts";
import { useResource } from "./resource.svelte.ts";
import type { DataKey, FileInfo, MaybeFileInfo } from "./types.ts";

const cache = new FilesystemCache<number, MaybeFileInfo>({
  async fetchFromIndexedDB(id) {
    const file = await IndexedDB.getFileInfo(id);
    const categories = file?.categoryIds
      ? await Promise.all(
          file.categoryIds.map(async (categoryId) => {
            const category = await IndexedDB.getCategoryInfo(categoryId);
            return category
              ? { id: category.id, parentId: category.parentId, name: category.name }
              : undefined;
          }),
        )
      : undefined;

    if (file) {
      return {
        id,
        exists: true,
        parentId: file.parentId,
        contentType: file.contentType,
        name: file.name,
        createdAt: file.createdAt,
        lastModifiedAt: file.lastModifiedAt,
        categories: categories?.filter((category) => !!category) ?? [],
        isFavorite: file.isFavorite,
      };
    }
  },

  async fetchFromServer(id) {
    try {
      const file = await trpc.file.get.query({ id });
      const [categories, metadata] = await Promise.all([
        Promise.all(
          file.categories.map(async (category) => ({
            id: category.id,
            parentId: category.parent,
            ...(await decryptCategoryMetadata(category)),
          })),
        ),
        decryptFileMetadata(file),
      ]);

      return storeToIndexedDB({
        id,
        isLegacy: file.isLegacy,
        parentId: file.parent,
        dataKey: metadata.dataKey,
        contentType: file.contentType,
        name: metadata.name,
        createdAt: metadata.createdAt,
        lastModifiedAt: metadata.lastModifiedAt,
        categories,
        isFavorite: file.isFavorite,
      });
    } catch (e) {
      if (isTRPCClientError(e) && e.data?.code === "NOT_FOUND") {
        await IndexedDB.deleteFileInfo(id);
        return { id, exists: false as const };
      }
      throw e;
    }
  },

  async bulkFetchFromIndexedDB(ids) {
    const files = await IndexedDB.bulkGetFileInfos([...ids]);
    const categories = await Promise.all(
      files.map(async (file) =>
        file?.categoryIds
          ? await Promise.all(
              file.categoryIds.map(async (categoryId) => {
                const category = await IndexedDB.getCategoryInfo(categoryId);
                return category
                  ? { id: category.id, parentId: category.parentId, name: category.name }
                  : undefined;
              }),
            )
          : undefined,
      ),
    );

    return new Map(
      files
        .filter((file) => !!file)
        .map((file, index) => [
          file.id,
          {
            ...file,
            exists: true,
            categories: categories[index]?.filter((category) => !!category) ?? [],
          },
        ]),
    );
  },

  async bulkFetchFromServer(ids) {
    const idsArray = [...ids.keys()];

    const filesRaw = await trpc.file.bulkGet.query({ ids: idsArray });
    const files = await Promise.all(
      filesRaw.map(async ({ id, categories: categoriesRaw, ...metadataRaw }) => {
        const [categories, metadata] = await Promise.all([
          Promise.all(
            categoriesRaw.map(async (category) => ({
              id: category.id,
              parentId: category.parent,
              ...(await decryptCategoryMetadata(category)),
            })),
          ),
          decryptFileMetadata(metadataRaw),
        ]);

        return {
          id,
          exists: true as const,
          isLegacy: metadataRaw.isLegacy,
          parentId: metadataRaw.parent,
          contentType: metadataRaw.contentType,
          categories,
          isFavorite: metadataRaw.isFavorite,
          ...metadata,
        };
      }),
    );

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

export const getFileInfo = (
  id: number,
  options?: {
    serverResponse?: {
      parent: DirectoryId;
      mekVersion: number;
      dek: string;
      dekVersion: Date;
      contentType: string;
      name: string;
      nameIv: string;
      createdAt?: string;
      createdAtIv?: string;
      lastModifiedAt: string;
      lastModifiedAtIv: string;
      isFavorite: boolean;
    };
  },
) => {
  return cache.get(id, {
    fetchFromServer:
      options?.serverResponse &&
      (async (cachedValue) => {
        const metadata = await decryptFileMetadata(options!.serverResponse!);
        return storeToIndexedDB({
          categories: [],
          ...cachedValue,
          id,
          parentId: options!.serverResponse!.parent,
          contentType: options!.serverResponse!.contentType,
          isFavorite: options!.serverResponse!.isFavorite,
          ...metadata,
        });
      }),
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
