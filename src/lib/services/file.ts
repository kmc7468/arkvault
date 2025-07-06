import { callGetApi } from "$lib/hooks";
import { decryptData } from "$lib/modules/crypto";
import { getFileCache, storeFileCache, downloadFile, storeFileThumbnail } from "$lib/modules/file";
import { getThumbnailUrl } from "$lib/modules/thumbnail";
import type { FileThumbnailInfoResponse } from "$lib/server/schemas";

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
  let res = await callGetApi(`/api/file/${fileId}/thumbnail`);
  if (!res.ok) return null;

  const { contentIv: thumbnailEncryptedIv }: FileThumbnailInfoResponse = await res.json();

  res = await callGetApi(`/api/file/${fileId}/thumbnail/download`);
  if (!res.ok) return null;

  const thumbnailEncrypted = await res.arrayBuffer();
  const thumbnail = await decryptData(thumbnailEncrypted, thumbnailEncryptedIv, dataKey);

  storeFileThumbnail(fileId, thumbnail); // Intended
  return getThumbnailUrl(thumbnail);
};
