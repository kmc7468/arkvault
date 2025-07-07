import { LRUCache } from "lru-cache";
import {
  getFileCacheIndex as getFileCacheIndexFromIndexedDB,
  storeFileCacheIndex,
  deleteFileCacheIndex,
  type FileCacheIndex,
} from "$lib/indexedDB";
import { readFile, writeFile, deleteFile, deleteDirectory } from "$lib/modules/opfs";
import { getThumbnailUrl } from "$lib/modules/thumbnail";

const fileCacheIndex = new Map<number, FileCacheIndex>();
const loadedThumbnails = new LRUCache<number, string>({ max: 100 });

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

export const getFileThumbnailCache = async (fileId: number) => {
  const thumbnail = loadedThumbnails.get(fileId);
  if (thumbnail) {
    return thumbnail;
  }

  const thumbnailBuffer = await readFile(`/thumbnail/file/${fileId}`);
  if (!thumbnailBuffer) return null;

  const thumbnailUrl = getThumbnailUrl(thumbnailBuffer);
  loadedThumbnails.set(fileId, thumbnailUrl);
  return thumbnailUrl;
};

export const storeFileThumbnailCache = async (fileId: number, thumbnailBuffer: ArrayBuffer) => {
  await writeFile(`/thumbnail/file/${fileId}`, thumbnailBuffer);
  loadedThumbnails.set(fileId, getThumbnailUrl(thumbnailBuffer));
};

export const deleteFileThumbnailCache = async (fileId: number) => {
  loadedThumbnails.delete(fileId);
  await deleteFile(`/thumbnail/file/${fileId}`);
};

export const deleteAllFileThumbnailCaches = async () => {
  loadedThumbnails.clear();
  await deleteDirectory("/thumbnail/file");
};
