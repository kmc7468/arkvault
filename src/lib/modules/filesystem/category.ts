import * as IndexedDB from "$lib/indexedDB";
import { trpc, isTRPCClientError } from "$trpc/client";
import { FilesystemCache, decryptFileMetadata, decryptCategoryMetadata } from "./internal.svelte";
import type { MaybeCategoryInfo } from "./types";

const cache = new FilesystemCache<CategoryId, MaybeCategoryInfo, Partial<MaybeCategoryInfo>>();

const fetchFromIndexedDB = async (id: CategoryId) => {
  const [category, subCategories] = await Promise.all([
    id !== "root" ? IndexedDB.getCategoryInfo(id) : undefined,
    IndexedDB.getCategoryInfos(id),
  ]);
  const files = category
    ? await Promise.all(
        category.files.map(async (file) => {
          const fileInfo = await IndexedDB.getFileInfo(file.id);
          return fileInfo
            ? {
                id: file.id,
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
      exists: true as const,
      subCategories,
    };
  } else if (category) {
    return {
      id,
      exists: true as const,
      name: category.name,
      subCategories,
      files: files!.filter((file) => !!file),
      isFileRecursive: category.isFileRecursive,
    };
  }
};

const fetchFromServer = async (id: CategoryId, masterKey: CryptoKey) => {
  try {
    const {
      metadata,
      subCategories: subCategoriesRaw,
      files: filesRaw,
    } = await trpc().category.get.query({ id, recurse: true });

    void IndexedDB.deleteDanglingCategoryInfos(id, new Set(subCategoriesRaw.map(({ id }) => id)));

    const subCategories = await Promise.all(
      subCategoriesRaw.map(async (category) => {
        const decrypted = await decryptCategoryMetadata(category, masterKey);
        const existing = await IndexedDB.getCategoryInfo(category.id);
        await IndexedDB.storeCategoryInfo({
          id: category.id,
          parentId: id,
          name: decrypted.name,
          files: existing?.files ?? [],
          isFileRecursive: existing?.isFileRecursive ?? false,
        });
        return {
          id: category.id,
          ...decrypted,
        };
      }),
    );

    const existingFiles = filesRaw
      ? await IndexedDB.bulkGetFileInfos(filesRaw.map((file) => file.id))
      : [];
    const files = filesRaw
      ? await Promise.all(
          filesRaw.map(async (file, index) => {
            const decrypted = await decryptFileMetadata(file, masterKey);
            const existing = existingFiles[index];
            if (existing) {
              const categoryIds = file.isRecursive
                ? existing.categoryIds
                : Array.from(new Set([...existing.categoryIds, id as number]));
              await IndexedDB.storeFileInfo({
                id: file.id,
                parentId: existing.parentId,
                contentType: file.contentType,
                name: decrypted.name,
                createdAt: decrypted.createdAt,
                lastModifiedAt: decrypted.lastModifiedAt,
                categoryIds,
              });
            }
            return {
              id: file.id,
              contentType: file.contentType,
              isRecursive: file.isRecursive,
              ...decrypted,
            };
          }),
        )
      : undefined;

    const decryptedMetadata = metadata
      ? await decryptCategoryMetadata(metadata, masterKey)
      : undefined;
    if (id !== "root" && metadata && decryptedMetadata) {
      const existingCategory = await IndexedDB.getCategoryInfo(id);
      await IndexedDB.storeCategoryInfo({
        id: id as number,
        parentId: metadata.parent,
        name: decryptedMetadata.name,
        files:
          files?.map((file) => ({
            id: file.id,
            isRecursive: file.isRecursive,
          })) ??
          existingCategory?.files ??
          [],
        isFileRecursive: existingCategory?.isFileRecursive ?? false,
      });
    }

    if (id === "root") {
      return {
        id,
        exists: true as const,
        subCategories,
      };
    } else {
      return {
        id,
        exists: true as const,
        subCategories,
        files,
        ...decryptedMetadata!,
      };
    }
  } catch (e) {
    if (isTRPCClientError(e) && e.data?.code === "NOT_FOUND") {
      await IndexedDB.deleteCategoryInfo(id as number);
      return { id, exists: false as const };
    }
    throw e;
  }
};

export const getCategoryInfo = async (id: CategoryId, masterKey: CryptoKey) => {
  return await cache.get(id, async (isInitial, resolve) => {
    if (isInitial) {
      const info = await fetchFromIndexedDB(id);
      if (info) {
        resolve(info);
      }
    }

    const info = await fetchFromServer(id, masterKey);
    if (info) {
      resolve(info);
    }
  });
};
