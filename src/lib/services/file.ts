import { callGetApi } from "$lib/hooks";
import { getAllFileInfos } from "$lib/indexedDB/filesystem";
import { decryptData } from "$lib/modules/crypto";
import {
  getFileCache,
  storeFileCache,
  deleteFileCache,
  getFileThumbnailCache,
  storeFileThumbnailCache,
  deleteFileThumbnailCache,
  downloadFile,
} from "$lib/modules/file";
import { getThumbnailUrl } from "$lib/modules/thumbnail";
import type { FileThumbnailInfoResponse, FileListResponse } from "$lib/server/schemas";

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

export const requestFileThumbnailDownload = async (fileId: number, dataKey: CryptoKey) => {
  const cache = await getFileThumbnailCache(fileId);
  if (cache) return cache;

  let res = await callGetApi(`/api/file/${fileId}/thumbnail`);
  if (!res.ok) return null;

  const { contentIv: thumbnailEncryptedIv }: FileThumbnailInfoResponse = await res.json();

  res = await callGetApi(`/api/file/${fileId}/thumbnail/download`);
  if (!res.ok) return null;

  const thumbnailEncrypted = await res.arrayBuffer();
  const thumbnailBuffer = await decryptData(thumbnailEncrypted, thumbnailEncryptedIv, dataKey);

  storeFileThumbnailCache(fileId, thumbnailBuffer); // Intended
  return getThumbnailUrl(thumbnailBuffer);
};

export const requestDeletedFilesCleanup = async () => {
  const res = await callGetApi("/api/file/list");
  if (!res.ok) return;

  const { files: liveFiles }: FileListResponse = await res.json();
  const liveFilesSet = new Set(liveFiles);
  const maybeCachedFiles = await getAllFileInfos();

  await Promise.all(
    maybeCachedFiles
      .filter(({ id }) => !liveFilesSet.has(id))
      .flatMap(({ id }) => [deleteFileCache(id), deleteFileThumbnailCache(id)]),
  );
};
