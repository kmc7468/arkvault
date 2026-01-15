import * as IndexedDB from "$lib/indexedDB";
import { trpc, isTRPCClientError } from "$trpc/client";
import { decryptFileMetadata, decryptCategoryMetadata } from "./common";
import { FilesystemCache } from "./FilesystemCache.svelte";
import type { CategoryInfo, MaybeCategoryInfo } from "./types";

const cache = new FilesystemCache<CategoryId, MaybeCategoryInfo>({
  async fetchFromIndexedDB(id) {
    const [category, subCategories] = await Promise.all([
      id !== "root" ? IndexedDB.getCategoryInfo(id) : undefined,
      IndexedDB.getCategoryInfos(id),
    ]);
    const files = category?.files
      ? await Promise.all(
          category.files.map(async (file) => {
            const fileInfo = await IndexedDB.getFileInfo(file.id);
            return fileInfo
              ? {
                  id: file.id,
                  parentId: fileInfo.parentId,
                  contentType: fileInfo.contentType,
                  name: fileInfo.name,
                  createdAt: fileInfo.createdAt,
                  lastModifiedAt: fileInfo.lastModifiedAt,
                  isRecursive: file.isRecursive,
                }
              : undefined;
          }),
        )
      : undefined;

    if (id === "root") {
      return {
        id,
        exists: true,
        subCategories,
      };
    } else if (category) {
      return {
        id,
        exists: true,
        parentId: category.parentId,
        name: category.name,
        subCategories,
        files: files?.filter((file) => !!file) ?? [],
        isFileRecursive: category.isFileRecursive ?? false,
      };
    }
  },

  async fetchFromServer(id, cachedInfo, masterKey) {
    try {
      const category = await trpc().category.get.query({ id, recurse: true });
      const [subCategories, files, metadata] = await Promise.all([
        Promise.all(
          category.subCategories.map(async (category) => ({
            id: category.id,
            parentId: id,
            ...(await decryptCategoryMetadata(category, masterKey)),
          })),
        ),
        category.files &&
          Promise.all(
            category.files.map(async (file) => ({
              id: file.id,
              parentId: file.parent,
              contentType: file.contentType,
              isRecursive: file.isRecursive,
              ...(await decryptFileMetadata(file, masterKey)),
            })),
          ),
        category.metadata && decryptCategoryMetadata(category.metadata, masterKey),
      ]);

      return storeToIndexedDB(
        id !== "root"
          ? {
              id,
              parentId: category.metadata!.parent,
              subCategories,
              files: files!,
              isFileRecursive: cachedInfo?.isFileRecursive ?? false,
              ...metadata!,
            }
          : { id, subCategories },
      );
    } catch (e) {
      if (isTRPCClientError(e) && e.data?.code === "NOT_FOUND") {
        await IndexedDB.deleteCategoryInfo(id as number);
        return { id, exists: false };
      }
      throw e;
    }
  },
});

const storeToIndexedDB = (info: CategoryInfo) => {
  if (info.id !== "root") {
    void IndexedDB.storeCategoryInfo(info);

    // TODO: Bulk Upsert
    new Map(info.files.map((file) => [file.id, file])).forEach((file) => {
      void IndexedDB.storeFileInfo(file);
    });
  }

  // TODO: Bulk Upsert
  info.subCategories.forEach((category) => {
    void IndexedDB.storeCategoryInfo(category);
  });

  void IndexedDB.deleteDanglingCategoryInfos(
    info.id,
    new Set(info.subCategories.map(({ id }) => id)),
  );

  return { ...info, exists: true as const };
};

export const getCategoryInfo = (id: CategoryId, masterKey: CryptoKey) => {
  return cache.get(id, masterKey);
};
