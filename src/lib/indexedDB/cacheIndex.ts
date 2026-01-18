import { Dexie, type EntityTable } from "dexie";

export interface FileCacheIndex {
  fileId: number;
  cachedAt: Date;
  lastRetrievedAt: Date;
  size: number;
}

const cacheIndex = new Dexie("cacheIndex") as Dexie & {
  fileCache: EntityTable<FileCacheIndex, "fileId">;
};

cacheIndex.version(1).stores({
  fileCache: "fileId",
});

export const getFileCacheIndex = async () => {
  return await cacheIndex.fileCache.toArray();
};

export const storeFileCacheIndex = async (fileCacheIndex: FileCacheIndex) => {
  await cacheIndex.fileCache.put({
    fileId: fileCacheIndex.fileId,
    cachedAt: fileCacheIndex.cachedAt,
    lastRetrievedAt: fileCacheIndex.lastRetrievedAt,
    size: fileCacheIndex.size,
  });
};

export const deleteFileCacheIndex = async (fileId: number) => {
  await cacheIndex.fileCache.delete(fileId);
};
