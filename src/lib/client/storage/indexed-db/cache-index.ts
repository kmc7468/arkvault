import { Dexie, type EntityTable } from "dexie";

export interface FileCacheIndex {
  fileId: number;
  cachedAt: Date;
  lastRetrievedAt: Date;
  // Files are cached in chunks, possibly partially (e.g. videos which were partially played)
  size: number;
  totalSize: number;
  chunkCount: number;
  isComplete: boolean;
}

const cacheIndex = new Dexie("cacheIndex") as Dexie & {
  fileCache: EntityTable<FileCacheIndex, "fileId">;
};

// Files were cached as single files before version 2
cacheIndex
  .version(2)
  .stores({
    fileCache: "fileId",
  })
  .upgrade(async (trx) => {
    await trx.table("fileCache").clear();
  });

export const getFileCacheIndex = async () => {
  return await cacheIndex.fileCache.toArray();
};

export const getFileCacheIndexOf = async (fileId: number) => {
  return await cacheIndex.fileCache.get(fileId);
};

export const storeFileCacheIndex = async (fileCacheIndex: FileCacheIndex) => {
  await cacheIndex.fileCache.put(fileCacheIndex);
};

export const updateFileCacheRetrievedAt = async (fileId: number, lastRetrievedAt: Date) => {
  await cacheIndex.fileCache.update(fileId, { lastRetrievedAt });
};

export const deleteFileCacheIndex = async (fileId: number) => {
  await cacheIndex.fileCache.delete(fileId);
};
