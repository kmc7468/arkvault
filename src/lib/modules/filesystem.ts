import { get, writable, type Writable } from "svelte/store";
import { callGetApi } from "$lib/hooks";
import {
  getFileInfo as getFileInfoFromIndexedDB,
  storeFileInfo,
  deleteFileInfo,
  getCategoryInfos as getCategoryInfosFromIndexedDB,
  getCategoryInfo as getCategoryInfoFromIndexedDB,
  storeCategoryInfo,
  updateCategoryInfo as updateCategoryInfoInIndexedDB,
  deleteCategoryInfo,
  type CategoryId,
} from "$lib/indexedDB";
import { unwrapDataKey, decryptString } from "$lib/modules/crypto";
import type {
  CategoryInfoResponse,
  CategoryFileListResponse,
  FileInfoResponse,
} from "$lib/server/schemas";

export interface FileInfo {
  id: number;
  dataKey?: CryptoKey;
  dataKeyVersion?: Date;
  contentType: string;
  contentIv?: string;
  name: string;
  createdAt?: Date;
  lastModifiedAt: Date;
  categoryIds: number[];
}

export type CategoryInfo =
  | {
      id: "root";
      dataKey?: undefined;
      dataKeyVersion?: undefined;
      name?: undefined;
      subCategoryIds: number[];
      files?: undefined;
      isFileRecursive?: undefined;
    }
  | {
      id: number;
      dataKey?: CryptoKey;
      dataKeyVersion?: Date;
      name: string;
      subCategoryIds: number[];
      files: { id: number; isRecursive: boolean }[];
      isFileRecursive: boolean;
    };

const fileInfoStore = new Map<number, Writable<FileInfo | null>>();
const categoryInfoStore = new Map<CategoryId, Writable<CategoryInfo | null>>();

const fetchFileInfoFromIndexedDB = async (id: number, info: Writable<FileInfo | null>) => {
  if (get(info)) return;

  const file = await getFileInfoFromIndexedDB(id);
  if (!file) return;

  info.set(file);
};

const decryptDate = async (ciphertext: string, iv: string, dataKey: CryptoKey) => {
  return new Date(parseInt(await decryptString(ciphertext, iv, dataKey), 10));
};

const fetchFileInfoFromServer = async (
  id: number,
  info: Writable<FileInfo | null>,
  masterKey: CryptoKey,
) => {
  const res = await callGetApi(`/api/file/${id}`);
  if (res.status === 404) {
    info.set(null);
    await deleteFileInfo(id);
    return;
  } else if (!res.ok) {
    throw new Error("Failed to fetch file information");
  }

  const metadata: FileInfoResponse = await res.json();
  const { dataKey } = await unwrapDataKey(metadata.dek, masterKey);

  const name = await decryptString(metadata.name, metadata.nameIv, dataKey);
  const createdAt =
    metadata.createdAt && metadata.createdAtIv
      ? await decryptDate(metadata.createdAt, metadata.createdAtIv, dataKey)
      : undefined;
  const lastModifiedAt = await decryptDate(
    metadata.lastModifiedAt,
    metadata.lastModifiedAtIv,
    dataKey,
  );

  info.set({
    id,
    dataKey,
    dataKeyVersion: new Date(metadata.dekVersion),
    contentType: metadata.contentType,
    contentIv: metadata.contentIv,
    name,
    createdAt,
    lastModifiedAt,
    categoryIds: metadata.categories,
  });
  await storeFileInfo({
    id,
    parentId: metadata.parent,
    name,
    contentType: metadata.contentType,
    createdAt,
    lastModifiedAt,
    categoryIds: metadata.categories,
  });
};

const fetchFileInfo = async (id: number, info: Writable<FileInfo | null>, masterKey: CryptoKey) => {
  await fetchFileInfoFromIndexedDB(id, info);
  await fetchFileInfoFromServer(id, info, masterKey);
};

export const getFileInfo = (fileId: number, masterKey: CryptoKey) => {
  // TODO: MEK rotation

  let info = fileInfoStore.get(fileId);
  if (!info) {
    info = writable(null);
    fileInfoStore.set(fileId, info);
  }

  fetchFileInfo(fileId, info, masterKey); // Intended
  return info;
};

const fetchCategoryInfoFromIndexedDB = async (
  id: CategoryId,
  info: Writable<CategoryInfo | null>,
) => {
  if (get(info)) return;

  const [category, subCategories] = await Promise.all([
    id !== "root" ? getCategoryInfoFromIndexedDB(id) : undefined,
    getCategoryInfosFromIndexedDB(id),
  ]);
  const subCategoryIds = subCategories.map(({ id }) => id);

  if (id === "root") {
    info.set({ id, subCategoryIds });
  } else {
    if (!category) return;
    info.set({
      id,
      name: category.name,
      subCategoryIds,
      files: category.files,
      isFileRecursive: category.isFileRecursive,
    });
  }
};

const fetchCategoryInfoFromServer = async (
  id: CategoryId,
  info: Writable<CategoryInfo | null>,
  masterKey: CryptoKey,
) => {
  let res = await callGetApi(`/api/category/${id}`);
  if (res.status === 404) {
    info.set(null);
    await deleteCategoryInfo(id as number);
    return;
  } else if (!res.ok) {
    throw new Error("Failed to fetch category information");
  }

  const { metadata, subCategories }: CategoryInfoResponse = await res.json();

  if (id === "root") {
    info.set({ id, subCategoryIds: subCategories });
  } else {
    const { dataKey } = await unwrapDataKey(metadata!.dek, masterKey);
    const name = await decryptString(metadata!.name, metadata!.nameIv, dataKey);

    res = await callGetApi(`/api/category/${id}/file/list?recurse=true`);
    if (!res.ok) {
      throw new Error("Failed to fetch category files");
    }

    const { files }: CategoryFileListResponse = await res.json();
    const filesMapped = files.map(({ file, isRecursive }) => ({ id: file, isRecursive }));
    let isFileRecursive: boolean | undefined = undefined;

    info.update((value) => {
      const newValue = {
        isFileRecursive: false,
        ...value,
        id,
        dataKey,
        dataKeyVersion: new Date(metadata!.dekVersion),
        name,
        subCategoryIds: subCategories,
        files: filesMapped,
      };
      isFileRecursive = newValue.isFileRecursive;
      return newValue;
    });
    await storeCategoryInfo({
      id,
      parentId: metadata!.parent,
      name,
      files: filesMapped,
      isFileRecursive: isFileRecursive!,
    });
  }
};

const fetchCategoryInfo = async (
  id: CategoryId,
  info: Writable<CategoryInfo | null>,
  masterKey: CryptoKey,
) => {
  await fetchCategoryInfoFromIndexedDB(id, info);
  await fetchCategoryInfoFromServer(id, info, masterKey);
};

export const getCategoryInfo = (categoryId: CategoryId, masterKey: CryptoKey) => {
  // TODO: MEK rotation

  let info = categoryInfoStore.get(categoryId);
  if (!info) {
    info = writable(null);
    categoryInfoStore.set(categoryId, info);
  }

  fetchCategoryInfo(categoryId, info, masterKey); // Intended
  return info;
};

export const updateCategoryInfo = async (
  categoryId: number,
  changes: { isFileRecursive?: boolean },
) => {
  await updateCategoryInfoInIndexedDB(categoryId, changes);
  categoryInfoStore.get(categoryId)?.update((value) => {
    if (!value) return value;
    if (changes.isFileRecursive !== undefined) {
      value.isFileRecursive = changes.isFileRecursive;
    }
    return value;
  });
};
