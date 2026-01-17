import * as IndexedDB from "$lib/indexedDB";
import { trpc, isTRPCClientError } from "$trpc/client";
import { decryptFileMetadata, decryptCategoryMetadata } from "./common";
import { FilesystemCache, type FilesystemCacheOptions } from "./FilesystemCache.svelte";
import type { FileInfo, MaybeFileInfo } from "./types";

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
        isFavorite: file.isFavorite,
        categories: categories?.filter((category) => !!category) ?? [],
      };
    }
  },

  async fetchFromServer(id, _cachedInfo, masterKey) {
    try {
      const file = await trpc().file.get.query({ id });
      const [categories, metadata] = await Promise.all([
        Promise.all(
          file.categories.map(async (category) => ({
            id: category.id,
            parentId: category.parent,
            ...(await decryptCategoryMetadata(category, masterKey)),
          })),
        ),
        decryptFileMetadata(file, masterKey),
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
        isFavorite: file.isFavorite,
        categories,
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

  async bulkFetchFromServer(ids, masterKey) {
    const idsArray = [...ids.keys()];

    const filesRaw = await trpc().file.bulkGet.query({ ids: idsArray });
    const files = await Promise.all(
      filesRaw.map(async ({ id, categories: categoriesRaw, ...metadataRaw }) => {
        const [categories, metadata] = await Promise.all([
          Promise.all(
            categoriesRaw.map(async (category) => ({
              id: category.id,
              parentId: category.parent,
              ...(await decryptCategoryMetadata(category, masterKey)),
            })),
          ),
          decryptFileMetadata(metadataRaw, masterKey),
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
  masterKey: CryptoKey,
  options?: { fetchFromServer?: FilesystemCacheOptions<number, MaybeFileInfo>["fetchFromServer"] },
) => {
  return cache.get(id, masterKey, options);
};

export const bulkGetFileInfo = (ids: number[], masterKey: CryptoKey) => {
  return cache.bulkGet(new Set(ids), masterKey);
};
