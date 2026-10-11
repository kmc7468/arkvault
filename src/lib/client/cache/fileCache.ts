import {
  deleteFileCacheIndex,
  getFileCacheIndex as getAllFileCacheIndexes,
  getFileCacheIndexOf,
  storeFileCacheIndex,
  updateFileCacheRetrievedAt,
} from "#lib/client/storage/indexedDB/cacheIndex.js";
import { createWritable, deleteFile, getFile } from "#lib/client/storage/opfs.js";

// Used by both the pages and the service worker, so the index is always read from IndexedDB

const getPath = (fileId: number) => `/cache/${fileId}`;

export const getFileCacheIndex = async () => {
  return await getAllFileCacheIndexes();
};

// The index is written only after the whole content is written
export const getFileCache = async (fileId: number) => {
  if (!(await getFileCacheIndexOf(fileId))) return null;

  const file = await getFile(getPath(fileId));
  if (file) {
    void updateFileCacheRetrievedAt(fileId, new Date());
  }
  return file;
};

export const storeFileCache = async (fileId: number, stream: ReadableStream<Uint8Array>) => {
  const path = getPath(fileId);
  try {
    await stream.pipeTo(await createWritable(path));
  } catch (e) {
    await deleteFile(path).catch(() => {});
    throw e;
  }

  const now = new Date();
  await storeFileCacheIndex({
    fileId,
    cachedAt: now,
    lastRetrievedAt: now,
    size: (await getFile(path))?.size ?? 0,
  });
};

export const deleteFileCache = async (fileId: number) => {
  await deleteFileCacheIndex(fileId);
  await deleteFile(getPath(fileId));
};
