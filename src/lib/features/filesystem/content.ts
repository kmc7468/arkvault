import {
  deleteFileCache,
  deleteFileThumbnailCache,
  storeFileThumbnailCache,
} from "#lib/client/cache/index.ts";
import {
  getDecryptedFileUrl,
  prepareFileDecryption,
  saveDecryptedFile,
} from "#lib/client/service-worker.ts";
import { getAllFileInfos } from "#lib/client/storage/indexed-db/index.ts";
import { uploadBlob } from "#lib/client/transfer/chunked-upload.ts";
import { trpc } from "#trpc/client.ts";
import type { DataKey } from "./types.ts";

interface StreamableFile {
  id: number;
  isLegacy?: boolean;
  dataKey?: DataKey;
  contentType: string;
}

// Returns a URL from which the service worker streams the decrypted content of the file
export const getFileStreamUrl = async ({ id, isLegacy, dataKey, contentType }: StreamableFile) => {
  if (!dataKey) {
    throw new Error("Data key not loaded");
  }

  await prepareFileDecryption(id, { isLegacy: !!isLegacy, dataKey: dataKey.key, contentType });
  return getDecryptedFileUrl(id);
};

export const getFileBlob = async (file: StreamableFile) => {
  const res = await fetch(await getFileStreamUrl(file));
  if (!res.ok) {
    throw new Error("Failed to download the file");
  }
  return await res.blob();
};

export const saveFile = async (file: StreamableFile & { name: string }) => {
  await getFileStreamUrl(file);
  saveDecryptedFile(file.id, file.name);
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
