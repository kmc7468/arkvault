import {
  getFileCacheIndex as getFileCacheIndexFromIndexedDB,
  storeFileCacheIndex,
  deleteFileCacheIndex,
  type FileCacheIndex,
} from "$lib/indexedDB";
import { readFile, writeFile, deleteFile } from "$lib/modules/opfs";

const fileCacheIndex = new Map<number, FileCacheIndex>();

export const prepareFileCache = async () => {
  for (const cache of await getFileCacheIndexFromIndexedDB()) {
    fileCacheIndex.set(cache.fileId, cache);
  }
};

export const getFileCacheIndex = () => {
  return Array.from(fileCacheIndex.values());
};

export const getFileCache = async (fileId: number) => {
  const cacheIndex = fileCacheIndex.get(fileId);
  if (!cacheIndex) return null;

  cacheIndex.lastRetrievedAt = new Date();
  storeFileCacheIndex(cacheIndex); // Intended
  return await readFile(`/cache/${fileId}`);
};

export const storeFileCache = async (fileId: number, fileBuffer: ArrayBuffer) => {
  const now = new Date();
  await writeFile(`/cache/${fileId}`, fileBuffer);

  const cacheIndex: FileCacheIndex = {
    fileId,
    cachedAt: now,
    lastRetrievedAt: now,
    size: fileBuffer.byteLength,
  };
  fileCacheIndex.set(fileId, cacheIndex);
  await storeFileCacheIndex(cacheIndex);
};

export const deleteFileCache = async (fileId: number) => {
  if (!fileCacheIndex.has(fileId)) return;

  fileCacheIndex.delete(fileId);
  await deleteFile(`/cache/${fileId}`);
  await deleteFileCacheIndex(fileId);
};
