import {
  getDirectoryInfos as getDirectoryInfosFromIndexedDB,
  getDirectoryInfo as getDirectoryInfoFromIndexedDB,
  storeDirectoryInfo,
  deleteDirectoryInfo,
  getFileInfos as getFileInfosFromIndexedDB,
  getFileInfo as getFileInfoFromIndexedDB,
  storeFileInfo,
  deleteFileInfo,
  getCategoryInfos as getCategoryInfosFromIndexedDB,
  getCategoryInfo as getCategoryInfoFromIndexedDB,
  storeCategoryInfo,
  updateCategoryInfo as updateCategoryInfoInIndexedDB,
  deleteCategoryInfo,
} from "$lib/indexedDB";
import { unwrapDataKey, decryptString } from "$lib/modules/crypto";
import { monotonicResolve } from "$lib/utils";
import { trpc, isTRPCClientError } from "$trpc/client";

type DataKey = { key: CryptoKey; version: Date };

interface LocalDirectoryInfo {
  id: number;
  parentId: DirectoryId;
  dataKey?: DataKey;
  name: string;
  subDirectories: SubDirectoryInfo[];
  files: SummarizedFileInfo[];
}

interface RootDirectoryInfo {
  id: "root";
  parentId?: undefined;
  dataKey?: undefined;
  dataKeyVersion?: undefined;
  name?: undefined;
  subDirectories: SubDirectoryInfo[];
  files: SummarizedFileInfo[];
}

export type DirectoryInfo = LocalDirectoryInfo | RootDirectoryInfo;
export type SubDirectoryInfo = Omit<LocalDirectoryInfo, "parentId" | "subDirectories" | "files">;

export interface FileInfo {
  id: number;
  parentId: DirectoryId;
  dataKey?: DataKey;
  contentType: string;
  contentIv?: string;
  name: string;
  createdAt?: Date;
  lastModifiedAt: Date;
  categories: { id: number; name: string }[];
}

export type SummarizedFileInfo = Omit<FileInfo, "parentId" | "contentIv" | "categories">;
export type CategoryFileInfo = SummarizedFileInfo & { isRecursive: boolean };

interface LocalCategoryInfo {
  id: number;
  dataKey?: DataKey | undefined;
  name: string;
  subCategories: SubCategoryInfo[];
  files: CategoryFileInfo[];
  isFileRecursive: boolean;
}

interface RootCategoryInfo {
  id: "root";
  dataKey?: undefined;
  name?: undefined;
  subCategories: SubCategoryInfo[];
  files?: undefined;
  isFileRecursive?: undefined;
}

export type CategoryInfo = LocalCategoryInfo | RootCategoryInfo;
export type SubCategoryInfo = Omit<
  LocalCategoryInfo,
  "subCategories" | "files" | "isFileRecursive"
>;

const directoryInfoCache = new Map<DirectoryId, DirectoryInfo | Promise<DirectoryInfo>>();
const fileInfoCache = new Map<number, FileInfo | Promise<FileInfo>>();
const categoryInfoCache = new Map<CategoryId, CategoryInfo | Promise<CategoryInfo>>();

export const getDirectoryInfo = async (id: DirectoryId, masterKey: CryptoKey) => {
  const info = directoryInfoCache.get(id);
  if (info instanceof Promise) {
    return info;
  }

  const { promise, resolve } = Promise.withResolvers<DirectoryInfo>();
  if (!info) {
    directoryInfoCache.set(id, promise);
  }

  monotonicResolve(
    [!info && fetchDirectoryInfoFromIndexedDB(id), fetchDirectoryInfoFromServer(id, masterKey)],
    (directoryInfo) => {
      let info = directoryInfoCache.get(id);
      if (info instanceof Promise) {
        const state = $state(directoryInfo);
        directoryInfoCache.set(id, state);
        resolve(state);
      } else {
        Object.assign(info!, directoryInfo);
        resolve(info!);
      }
    },
  );
  return info ?? promise;
};

const fetchDirectoryInfoFromIndexedDB = async (
  id: DirectoryId,
): Promise<DirectoryInfo | undefined> => {
  const [directory, subDirectories, files] = await Promise.all([
    id !== "root" ? getDirectoryInfoFromIndexedDB(id) : undefined,
    getDirectoryInfosFromIndexedDB(id),
    getFileInfosFromIndexedDB(id),
  ]);

  if (id === "root") {
    return { id, subDirectories, files };
  } else if (directory) {
    return { id, parentId: directory.parentId, name: directory.name, subDirectories, files };
  }
};

const fetchDirectoryInfoFromServer = async (
  id: DirectoryId,
  masterKey: CryptoKey,
): Promise<DirectoryInfo | undefined> => {
  try {
    const {
      metadata,
      subDirectories: subDirectoriesRaw,
      files: filesRaw,
    } = await trpc().directory.get.query({ id });
    const [subDirectories, files] = await Promise.all([
      Promise.all(
        subDirectoriesRaw.map(async (directory) => {
          const { dataKey } = await unwrapDataKey(directory.dek, masterKey);
          const name = await decryptString(directory.name, directory.nameIv, dataKey);
          return {
            id: directory.id,
            dataKey: { key: dataKey, version: directory.dekVersion },
            name,
          };
        }),
      ),
      Promise.all(
        filesRaw.map(async (file) => {
          const { dataKey } = await unwrapDataKey(file.dek, masterKey);
          const [name, createdAt, lastModifiedAt] = await Promise.all([
            decryptString(file.name, file.nameIv, dataKey),
            file.createdAt ? decryptDate(file.createdAt, file.createdAtIv!, dataKey) : undefined,
            decryptDate(file.lastModifiedAt, file.lastModifiedAtIv, dataKey),
          ]);
          return {
            id: file.id,
            dataKey: { key: dataKey, version: file.dekVersion },
            contentType: file.contentType,
            name,
            createdAt,
            lastModifiedAt,
          };
        }),
      ),
    ]);

    if (id === "root") {
      return { id, subDirectories, files };
    } else {
      const { dataKey } = await unwrapDataKey(metadata!.dek, masterKey);
      const name = await decryptString(metadata!.name, metadata!.nameIv, dataKey);
      return {
        id,
        parentId: metadata!.parent,
        dataKey: { key: dataKey, version: metadata!.dekVersion },
        name,
        subDirectories,
        files,
      };
    }
  } catch (e) {
    if (isTRPCClientError(e) && e.data?.code === "NOT_FOUND") {
      directoryInfoCache.delete(id);
      await deleteDirectoryInfo(id as number);
      return;
    }
    throw new Error("Failed to fetch directory information");
  }
};

const decryptDate = async (ciphertext: string, iv: string, dataKey: CryptoKey) => {
  return new Date(parseInt(await decryptString(ciphertext, iv, dataKey), 10));
};

export const getFileInfo = async (id: number, masterKey: CryptoKey) => {
  const info = fileInfoCache.get(id);
  if (info instanceof Promise) {
    return info;
  }

  const { promise, resolve } = Promise.withResolvers<FileInfo>();
  if (!info) {
    fileInfoCache.set(id, promise);
  }

  monotonicResolve(
    [!info && fetchFileInfoFromIndexedDB(id), fetchFileInfoFromServer(id, masterKey)],
    (fileInfo) => {
      let info = fileInfoCache.get(id);
      if (info instanceof Promise) {
        const state = $state(fileInfo);
        fileInfoCache.set(id, state);
        resolve(state);
      } else {
        Object.assign(info!, fileInfo);
        resolve(info!);
      }
    },
  );
  return info ?? promise;
};

const fetchFileInfoFromIndexedDB = async (id: number): Promise<FileInfo | undefined> => {
  const file = await getFileInfoFromIndexedDB(id);
  const categories = await Promise.all(
    file?.categoryIds.map(async (categoryId) => {
      const categoryInfo = await getCategoryInfoFromIndexedDB(categoryId);
      return categoryInfo ? { id: categoryId, name: categoryInfo.name } : undefined;
    }) ?? [],
  );

  if (file) {
    return {
      id,
      parentId: file.parentId,
      contentType: file.contentType,
      name: file.name,
      createdAt: file.createdAt,
      lastModifiedAt: file.lastModifiedAt,
      categories: categories.filter((category) => !!category),
    };
  }
};

const fetchFileInfoFromServer = async (
  id: number,
  masterKey: CryptoKey,
): Promise<FileInfo | undefined> => {
  try {
    const { categories: categoriesRaw, ...metadata } = await trpc().file.get.query({ id });
    const categories = await Promise.all(
      categoriesRaw.map(async (category) => {
        const { dataKey } = await unwrapDataKey(category.dek, masterKey);
        const name = await decryptString(category.name, category.nameIv, dataKey);
        return { id: category.id, name };
      }),
    );

    const { dataKey } = await unwrapDataKey(metadata.dek, masterKey);
    const [name, createdAt, lastModifiedAt] = await Promise.all([
      decryptString(metadata.name, metadata.nameIv, dataKey),
      metadata.createdAt
        ? decryptDate(metadata.createdAt, metadata.createdAtIv!, dataKey)
        : undefined,
      decryptDate(metadata.lastModifiedAt, metadata.lastModifiedAtIv, dataKey),
    ]);

    return {
      id,
      parentId: metadata.parent,
      dataKey: { key: dataKey, version: new Date(metadata.dekVersion) },
      contentType: metadata.contentType,
      contentIv: metadata.contentIv,
      name,
      createdAt,
      lastModifiedAt,
      categories,
    };
  } catch (e) {
    if (isTRPCClientError(e) && e.data?.code === "NOT_FOUND") {
      fileInfoCache.delete(id);
      await deleteFileInfo(id);
      return;
    }
    throw new Error("Failed to fetch file information");
  }
};

export const getCategoryInfo = async (id: CategoryId, masterKey: CryptoKey) => {
  const info = categoryInfoCache.get(id);
  if (info instanceof Promise) {
    return info;
  }

  const { promise, resolve } = Promise.withResolvers<CategoryInfo>();
  if (!info) {
    categoryInfoCache.set(id, promise);
    const categoryInfo = await fetchCategoryInfoFromIndexedDB(id);
    if (categoryInfo) {
      const state = $state(categoryInfo);
      categoryInfoCache.set(id, state);
      resolve(state);
    }
  }

  fetchCategoryInfoFromServer(id, masterKey).then((categoryInfo) => {
    if (!categoryInfo) return;

    let info = categoryInfoCache.get(id);
    if (info instanceof Promise) {
      const state = $state(categoryInfo);
      categoryInfoCache.set(id, state);
      resolve(state);
    } else {
      Object.assign(info!, categoryInfo);
      resolve(info!);
    }
  });

  return info ?? promise;
};

const fetchCategoryInfoFromIndexedDB = async (
  id: CategoryId,
): Promise<CategoryInfo | undefined> => {
  const [category, subCategories] = await Promise.all([
    id !== "root" ? getCategoryInfoFromIndexedDB(id) : undefined,
    getCategoryInfosFromIndexedDB(id),
  ]);
  const files = category
    ? await Promise.all(
        category.files.map(async (file) => {
          const fileInfo = await getFileInfoFromIndexedDB(file.id);
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
    return { id, subCategories };
  } else if (category) {
    return {
      id,
      name: category.name,
      subCategories,
      files: files!.filter((file) => !!file),
      isFileRecursive: category.isFileRecursive,
    };
  }
};

const fetchCategoryInfoFromServer = async (
  id: CategoryId,
  masterKey: CryptoKey,
): Promise<CategoryInfo | undefined> => {
  try {
    const {
      metadata,
      subCategories: subCategoriesRaw,
      files: filesRaw,
    } = await trpc().category.get.query({ id, recurse: true });
    const [subCategories, files] = await Promise.all([
      Promise.all(
        subCategoriesRaw.map(async (category) => {
          const { dataKey } = await unwrapDataKey(category.dek, masterKey);
          const name = await decryptString(category.name, category.nameIv, dataKey);
          return {
            id: category.id,
            dataKey: { key: dataKey, version: category.dekVersion },
            name,
          };
        }),
      ),
      id !== "root"
        ? Promise.all(
            filesRaw!.map(async (file) => {
              const { dataKey } = await unwrapDataKey(file.dek, masterKey);
              const [name, createdAt, lastModifiedAt] = await Promise.all([
                decryptString(file.name, file.nameIv, dataKey),
                file.createdAt
                  ? decryptDate(file.createdAt, file.createdAtIv!, dataKey)
                  : undefined,
                decryptDate(file.lastModifiedAt, file.lastModifiedAtIv, dataKey),
              ]);
              return {
                id: file.id,
                dataKey: { key: dataKey, version: file.dekVersion },
                contentType: file.contentType,
                name,
                createdAt,
                lastModifiedAt,
                isRecursive: file.isRecursive,
              };
            }),
          )
        : undefined,
    ]);

    if (id === "root") {
      return { id, subCategories };
    } else {
      const { dataKey } = await unwrapDataKey(metadata!.dek, masterKey);
      const name = await decryptString(metadata!.name, metadata!.nameIv, dataKey);
      return {
        id,
        dataKey: { key: dataKey, version: metadata!.dekVersion },
        name,
        subCategories,
        files: files!,
        isFileRecursive: false,
      };
    }
  } catch (e) {
    if (isTRPCClientError(e) && e.data?.code === "NOT_FOUND") {
      categoryInfoCache.delete(id);
      await deleteCategoryInfo(id as number);
      return;
    }
    throw new Error("Failed to fetch category information");
  }
};
