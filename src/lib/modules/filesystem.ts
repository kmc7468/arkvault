import { get, writable, type Writable } from "svelte/store";
import {
  getFileInfo as getFileInfoFromIndexedDB,
  storeFileInfo,
  deleteFileInfo,
} from "$lib/indexedDB";
import { unwrapDataKey, decryptString } from "$lib/modules/crypto";
import { trpc, isTRPCClientError } from "$trpc/client";

export interface FileInfo {
  id: number;
  parentId: DirectoryId;
  dataKey?: CryptoKey;
  dataKeyVersion?: Date;
  contentType: string;
  contentIv?: string;
  name: string;
  createdAt?: Date;
  lastModifiedAt: Date;
  categoryIds: number[];
}

const fileInfoStore = new Map<number, Writable<FileInfo | null>>();

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
  let metadata;
  try {
    metadata = await trpc().file.get.query({ id });
  } catch (e) {
    if (isTRPCClientError(e) && e.data?.code === "NOT_FOUND") {
      info.set(null);
      await deleteFileInfo(id);
      return;
    }
    throw new Error("Failed to fetch file information");
  }
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
    parentId: metadata.parent,
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
