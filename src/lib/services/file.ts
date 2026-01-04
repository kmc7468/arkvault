import { getAllFileInfos } from "$lib/indexedDB/filesystem";
import {
  getFileCache,
  storeFileCache,
  deleteFileCache,
  downloadFile,
  deleteFileThumbnailCache,
} from "$lib/modules/file";
import type { FileThumbnailUploadRequest } from "$lib/server/schemas";
import { trpc } from "$trpc/client";

export const requestFileDownload = async (
  fileId: number,
  fileEncryptedIv: string,
  dataKey: CryptoKey,
) => {
  const cache = await getFileCache(fileId);
  if (cache) return cache;

  const fileBuffer = await downloadFile(fileId, fileEncryptedIv, dataKey);
  storeFileCache(fileId, fileBuffer); // Intended
  return fileBuffer;
};

export const requestFileThumbnailUpload = async (
  fileId: number,
  dataKeyVersion: Date,
  thumbnailEncrypted: { ciphertext: ArrayBuffer; iv: string },
) => {
  const form = new FormData();
  form.set(
    "metadata",
    JSON.stringify({
      dekVersion: dataKeyVersion.toISOString(),
      contentIv: thumbnailEncrypted.iv,
    } satisfies FileThumbnailUploadRequest),
  );
  form.set("content", new Blob([thumbnailEncrypted.ciphertext]));

  return await fetch(`/api/file/${fileId}/thumbnail/upload`, { method: "POST", body: form });
};

export const requestDeletedFilesCleanup = async () => {
  let liveFiles;
  try {
    liveFiles = await trpc().file.list.query();
  } catch {
    // TODO: Error Handling
    return;
  }

  const liveFilesSet = new Set(liveFiles);
  const maybeCachedFiles = await getAllFileInfos();

  await Promise.all(
    maybeCachedFiles
      .filter(({ id }) => !liveFilesSet.has(id))
      .flatMap(({ id }) => [deleteFileCache(id), deleteFileThumbnailCache(id)]),
  );
};
