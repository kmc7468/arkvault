import {
  deleteFileCache,
  deleteFileThumbnailCache,
  getFileCache,
  storeFileCache,
  storeFileThumbnailCache,
} from "#lib/client/cache/index.js";
import { getDecryptedFileUrl, prepareFileDecryption } from "#lib/client/serviceWorker.js";
import { getAllFileInfos } from "#lib/client/storage/indexedDB/index.js";
import { uploadBlob } from "#lib/client/transfer/chunkedUpload.js";
import { downloadFile } from "#lib/client/transfer/index.js";
import { trpc } from "#trpc/client.js";
import type { DataKey } from "./types";

// Returns the decrypted content of the file, from the cache if available
export const getFileContent = async (fileId: number, dataKey: CryptoKey, isLegacy: boolean) => {
  const cache = await getFileCache(fileId);
  if (cache) return cache;

  const fileBuffer = await downloadFile(fileId, dataKey, isLegacy);
  void storeFileCache(fileId, fileBuffer);
  return fileBuffer;
};

// Returns a URL from which the service worker streams the decrypted file
export const getFileStreamUrl = async (fileId: number, dataKey: CryptoKey, contentType: string) => {
  const res = await fetch(`/api/file/${fileId}/download`, { method: "HEAD" });
  if (!res.ok) {
    throw new Error("Failed to get the file size");
  }

  const encContentSize = parseInt(res.headers.get("Content-Length") ?? "0", 10);
  if (encContentSize <= 0) {
    throw new Error("Invalid file size");
  }

  await prepareFileDecryption(fileId, { isLegacy: false, dataKey, encContentSize, contentType });
  return getDecryptedFileUrl(fileId);
};

export const uploadFileThumbnail = async (fileId: number, thumbnail: Blob, dataKey: DataKey) => {
  const { uploadId } = await trpc.upload.startFileThumbnailUpload.mutate({
    file: fileId,
    dekVersion: dataKey.version,
  });
  await uploadBlob(uploadId, thumbnail, dataKey.key);
  await trpc.upload.completeFileThumbnailUpload.mutate({ uploadId });

  await storeFileThumbnailCache(fileId, await thumbnail.arrayBuffer());
};

// Deletes local caches of files deleted on other devices
export const cleanupDeletedFileCaches = async () => {
  const liveFiles = new Set(await trpc.file.list.query());
  const maybeCachedFiles = await getAllFileInfos();

  await Promise.all(
    maybeCachedFiles
      .filter(({ id }) => !liveFiles.has(id))
      .flatMap(({ id }) => [deleteFileCache(id), deleteFileThumbnailCache(id)]),
  );
};
