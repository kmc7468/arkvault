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

interface FileInfo {
  id: number;
  parentId: DirectoryId;
  dataKey?: DataKey;
  contentType: string;
  contentIv: string | undefined;
  name: string;
  createdAt?: Date;
  lastModifiedAt: Date;
  categories: { id: number; name: string }[];
}

export type SummarizedFileInfo = Omit<FileInfo, "parentId" | "contentIv" | "categories">;

interface LocalCategoryInfo {
  id: number;
  dataKey: DataKey | undefined;
  name: string;
  subCategories: Omit<LocalCategoryInfo, "subCategories" | "files" | "isFileRecursive">[];
  files: { id: number; name: string; isRecursive: boolean }[];
  isFileRecursive: boolean;
}

interface RootCategoryInfo {
  id: "root";
  dataKey?: undefined;
  name?: undefined;
  subCategories: Omit<LocalCategoryInfo, "subCategories" | "files" | "isFileRecursive">[];
  files?: undefined;
}

export type CategoryInfo = LocalCategoryInfo | RootCategoryInfo;

const directoryInfoCache = new Map<DirectoryId, DirectoryInfo | Promise<DirectoryInfo>>();

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
