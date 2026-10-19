import {
  deleteFileCacheIndex,
  getFileCacheIndex as getAllFileCacheIndexes,
  getFileCacheIndexOf,
  storeFileCacheIndex,
  updateFileCacheRetrievedAt,
} from "#lib/client/storage/indexed-db/cache-index.ts";
import {
  createWritable,
  deleteDirectory,
  deleteFile,
  deleteFilesInDirectory,
  getFile,
  listDirectoryNames,
  listFileNames,
  moveFile,
} from "#lib/client/storage/opfs.ts";
import { CHUNK_SIZE, getChunkCount } from "#lib/shared/format/index.ts";

// Caches the plaintext of files in chunks, so that partially loaded files (e.g. videos which were
// partially played) can also be cached. Chunk `i` starts at `i * CHUNK_SIZE` of the plaintext,
// except that legacy files are cached as a single chunk. Used by both the pages and the service
// worker, so the index is always read from IndexedDB.

export interface FileCacheLayout {
  totalSize: number;
  chunkCount: number;
}

const getDirectoryPath = (fileId: number) => `/cache/file/${fileId}`;
const getChunkPath = (fileId: number, chunkIndex: number) =>
  `${getDirectoryPath(fileId)}/${chunkIndex}`;

const getChunkSize = ({ totalSize, chunkCount }: FileCacheLayout, chunkIndex: number) => {
  return chunkCount === 1 ? totalSize : Math.min(CHUNK_SIZE, totalSize - chunkIndex * CHUNK_SIZE);
};

export const getFileCacheIndex = async () => {
  return await getAllFileCacheIndexes();
};

export const getCachedChunkIndexes = async (fileId: number) => {
  const names = await listFileNames(getDirectoryPath(fileId));
  return new Set(names.filter((name) => /^\d+$/.test(name)).map(Number));
};

export const readCachedChunk = async (fileId: number, chunkIndex: number) => {
  return await getFile(getChunkPath(fileId, chunkIndex));
};

export const touchFileCache = async (fileId: number) => {
  await updateFileCacheRetrievedAt(fileId, new Date());
};

const updateIndex = async (fileId: number, layout: FileCacheLayout) => {
  const chunkIndexes = await getCachedChunkIndexes(fileId);
  const size = chunkIndexes
    .values()
    .filter((chunkIndex) => chunkIndex < layout.chunkCount)
    .reduce((size, chunkIndex) => size + getChunkSize(layout, chunkIndex), 0);
  const now = new Date();

  await storeFileCacheIndex({
    fileId,
    cachedAt: (await getFileCacheIndexOf(fileId))?.cachedAt ?? now,
    lastRetrievedAt: now,
    size,
    totalSize: layout.totalSize,
    chunkCount: layout.chunkCount,
    isComplete: size === layout.totalSize,
  });
};

// Writes of the same file are serialized so that the index isn't updated with a stale state
const writeQueues = new Map<number, Promise<unknown>>();

const enqueueWrite = <T>(fileId: number, write: () => Promise<T>) => {
  const result = (writeQueues.get(fileId) ?? Promise.resolve()).catch(() => {}).then(write);
  const settled = result.catch(() => {});
  writeQueues.set(fileId, settled);
  void settled.then(() => {
    if (writeQueues.get(fileId) === settled) {
      writeQueues.delete(fileId);
    }
  });
  return result;
};

export const storeCachedChunk = (
  fileId: number,
  chunkIndex: number,
  data: Uint8Array | Blob,
  layout: FileCacheLayout,
) => enqueueWrite(fileId, () => writeChunk(fileId, chunkIndex, data, layout));

const writeChunk = async (
  fileId: number,
  chunkIndex: number,
  data: Uint8Array | Blob,
  layout: FileCacheLayout,
) => {
  const path = getChunkPath(fileId, chunkIndex);
  const tempPath = `${path}.${crypto.randomUUID()}.tmp`;

  // Written to a temporary file first, so that incomplete chunks are never visible
  const writable = await createWritable(tempPath);
  try {
    await writable.write(data as FileSystemWriteChunkType);
    await writable.close();
    await moveFile(tempPath, path);
  } catch (e) {
    await writable.abort().catch(() => {});
    await deleteFile(tempPath).catch(() => {});
    throw e;
  }

  await updateIndex(fileId, layout);
};

const UPLOAD_CACHE_DIRECTORY = "/cache/upload";
const STALE_UPLOAD_CACHE_AGE = 24 * 3600 * 1000; // 24 hours

// Caches the plaintext of a file while it is being uploaded. Chunks are written to a temporary
// directory, and moved to the cache once the id of the file is known.
export const createUploadFileCache = (totalSize: number) => {
  const layout = { totalSize, chunkCount: getChunkCount(totalSize) };
  // Prefixed with the creation time to find stale ones (e.g. the tab was closed while uploading)
  const directoryPath = `${UPLOAD_CACHE_DIRECTORY}/${Date.now()}-${crypto.randomUUID()}`;
  const writtenChunkIndexes = new Set<number>();
  let isFailed = false;

  const discard = async () => {
    isFailed = true;
    await deleteDirectory(directoryPath).catch(() => {});
  };

  return {
    // Failing to cache shouldn't fail the upload, so errors are ignored
    async writeChunk(chunkIndex: number, data: ArrayBuffer) {
      if (isFailed) return;

      try {
        const writable = await createWritable(`${directoryPath}/${chunkIndex}`);
        await writable.write(data);
        await writable.close();
        writtenChunkIndexes.add(chunkIndex);
      } catch (e) {
        console.error(e);
        await discard();
      }
    },
    async commit(fileId: number) {
      if (isFailed || writtenChunkIndexes.size !== layout.chunkCount) {
        await discard();
        return;
      }

      await enqueueWrite(fileId, async () => {
        for (const chunkIndex of writtenChunkIndexes) {
          await moveFile(`${directoryPath}/${chunkIndex}`, getChunkPath(fileId, chunkIndex));
        }
        await updateIndex(fileId, layout);
      }).finally(discard);
    },
    discard,
  };
};

export const deleteFileCache = async (fileId: number) => {
  await deleteFileCacheIndex(fileId);
  await deleteDirectory(getDirectoryPath(fileId));
};

export const cleanupFileCaches = async () => {
  // Files were cached as single files directly under `/cache` before
  await deleteFilesInDirectory("/cache");

  // Uploads might be in progress in other tabs, so only stale ones are deleted
  for (const name of await listDirectoryNames(UPLOAD_CACHE_DIRECTORY)) {
    const createdAt = parseInt(name, 10);
    if (!(Date.now() - createdAt < STALE_UPLOAD_CACHE_AGE)) {
      await deleteDirectory(`${UPLOAD_CACHE_DIRECTORY}/${name}`);
    }
  }
};
