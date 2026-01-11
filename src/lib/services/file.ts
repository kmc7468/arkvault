import { getAllFileInfos } from "$lib/indexedDB/filesystem";
import { encodeToBase64, digestMessage } from "$lib/modules/crypto";
import {
  getFileCache,
  storeFileCache,
  deleteFileCache,
  downloadFile,
  deleteFileThumbnailCache,
} from "$lib/modules/file";
import { trpc } from "$trpc/client";

export const requestFileDownload = async (
  fileId: number,
  dataKey: CryptoKey,
  isLegacy: boolean,
) => {
  const cache = await getFileCache(fileId);
  if (cache) return cache;

  const fileBuffer = await downloadFile(fileId, dataKey, isLegacy);
  storeFileCache(fileId, fileBuffer); // Intended
  return fileBuffer;
};

export const requestFileThumbnailUpload = async (
  fileId: number,
  dataKeyVersion: Date,
  thumbnailEncrypted: { ciphertext: ArrayBuffer; iv: ArrayBuffer },
) => {
  const { uploadId } = await trpc().upload.startFileThumbnailUpload.mutate({
    file: fileId,
    dekVersion: dataKeyVersion,
  });

  // Prepend IV to ciphertext (consistent with file download format)
  const ivAndCiphertext = new Uint8Array(
    thumbnailEncrypted.iv.byteLength + thumbnailEncrypted.ciphertext.byteLength,
  );
  ivAndCiphertext.set(new Uint8Array(thumbnailEncrypted.iv), 0);
  ivAndCiphertext.set(
    new Uint8Array(thumbnailEncrypted.ciphertext),
    thumbnailEncrypted.iv.byteLength,
  );

  const chunkHash = encodeToBase64(await digestMessage(ivAndCiphertext));

  const response = await fetch(`/api/upload/${uploadId}/chunks/0`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Digest": `sha-256=:${chunkHash}:`,
    },
    body: ivAndCiphertext,
  });

  if (!response.ok) {
    throw new Error(`Thumbnail upload failed: ${response.status} ${response.statusText}`);
  }

  await trpc().upload.completeFileThumbnailUpload.mutate({ uploadId });
  return response;
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
