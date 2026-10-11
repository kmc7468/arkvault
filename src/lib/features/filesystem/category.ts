import * as IndexedDB from "#lib/client/storage/indexed-db/index.ts";
import { isTRPCClientError, trpc } from "#trpc/client.ts";
import { FilesystemCache } from "./cache.svelte.ts";
import { invalidateFile } from "./file.ts";
import { toCategoryInfo, toFileInfo } from "./dto.ts";
import { encryptName, generateEntryKeys } from "./metadata.ts";
import { useResource } from "./resource.svelte.ts";
import type { CategoryInfo, DataKey, LocalCategoryInfo, MaybeCategoryInfo } from "./types.ts";

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
                  isFavorite: fileInfo.isFavorite,
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

  async fetchFromServer(id, cachedInfo) {
    try {
      const category = await trpc.category.get.query({ id, recurse: true });
      const [subCategories, files, metadata] = await Promise.all([
        Promise.all(category.subCategories.map(toCategoryInfo)),
        Promise.all(
          (category.files ?? []).map(async (file) => ({
            ...(await toFileInfo(file)),
            isRecursive: file.isRecursive,
          })),
        ),
        category.metadata && toCategoryInfo(category.metadata),
      ]);

      return storeToIndexedDB(
        metadata
          ? {
              ...metadata,
              subCategories,
              files,
              isFileRecursive: cachedInfo?.isFileRecursive ?? false,
            }
          : { id: "root", subCategories },
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

export const getCategoryInfo = (id: CategoryId) => {
  return cache.get(id);
};

export const useCategory = (getId: () => CategoryId) => {
  return useResource(getId, (id) => getCategoryInfo(id));
};

export const invalidateCategory = (id: CategoryId) => {
  cache.invalidate(id);
};

export const createCategory = async (parentId: CategoryId, name: string) => {
  await trpc.category.create.mutate({ parent: parentId, ...(await generateEntryKeys(name)) });
  invalidateCategory(parentId);
};

export const renameCategory = async (
  category: { id: number; parentId: CategoryId; dataKey?: DataKey },
  newName: string,
) => {
  if (!category.dataKey) {
    throw new Error("Data key not loaded");
  }

  await trpc.category.rename.mutate({
    id: category.id,
    dekVersion: category.dataKey.version,
    ...(await encryptName(newName, category.dataKey.key)),
  });
  invalidateCategory(category.parentId);
  invalidateCategory(category.id);
};

export const deleteCategory = async (category: { id: number; parentId: CategoryId }) => {
  await trpc.category.delete.mutate({ id: category.id });
  cache.evict(category.id);
  invalidateCategory(category.parentId);
};

export const addFileToCategory = async (fileId: number, categoryId: number) => {
  await trpc.category.addFile.mutate({ id: categoryId, file: fileId });
  invalidateFile(fileId);
  invalidateCategory(categoryId);
};

export const removeFileFromCategory = async (fileId: number, categoryId: number) => {
  await trpc.category.removeFile.mutate({ id: categoryId, file: fileId });
  invalidateFile(fileId);
  invalidateCategory(categoryId);
};

// Whether to show the files of subcategories is a local preference
export const setCategoryFileRecursive = async (category: LocalCategoryInfo, value: boolean) => {
  category.isFileRecursive = value;
  await IndexedDB.updateCategoryInfo(category.id, { isFileRecursive: value });
};
