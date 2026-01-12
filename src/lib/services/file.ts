import { getAllFileInfos } from "$lib/indexedDB/filesystem";
import {
  getFileCache,
  storeFileCache,
  deleteFileCache,
  downloadFile,
  deleteFileThumbnailCache,
} from "$lib/modules/file";
import { uploadBlob } from "$lib/modules/upload";
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
  thumbnail: Blob,
  dataKey: CryptoKey,
  dataKeyVersion: Date,
) => {
  try {
    const { uploadId } = await trpc().upload.startFileThumbnailUpload.mutate({
      file: fileId,
      dekVersion: dataKeyVersion,
    });

    await uploadBlob(uploadId, thumbnail, dataKey);

    await trpc().upload.completeFileThumbnailUpload.mutate({ uploadId });
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
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
