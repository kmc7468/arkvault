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
    } = await trpc().category.get.query({ id });
    const [subCategories, files] = await Promise.all([
      Promise.all(
        subCategoriesRaw.map(async (category) => ({
          id: category.id,
          ...(await decryptCategoryMetadata(category, masterKey)),
        })),
      ),
      filesRaw
        ? Promise.all(
            filesRaw.map(async (file) => ({
              id: file.id,
              contentType: file.contentType,
              isRecursive: file.isRecursive,
              ...(await decryptFileMetadata(file, masterKey)),
            })),
          )
        : undefined,
    ]);

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
        ...(await decryptCategoryMetadata(metadata!, masterKey)),
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
