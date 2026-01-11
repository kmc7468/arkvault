import { encryptData } from "$lib/modules/crypto";
import { storeFileThumbnailCache } from "$lib/modules/file";
import { prepareFileDecryption, getDecryptedFileUrl } from "$lib/serviceWorker";
import { requestFileThumbnailUpload } from "$lib/services/file";
import { trpc } from "$trpc/client";

export { requestCategoryCreation, requestFileRemovalFromCategory } from "$lib/services/category";
export { requestFileDownload } from "$lib/services/file";

export const requestVideoStream = async (
  fileId: number,
  dataKey: CryptoKey,
  contentType: string,
) => {
  const res = await fetch(`/api/file/${fileId}/download`, { method: "HEAD" });
  if (!res.ok) return null;

  const encContentSize = parseInt(res.headers.get("Content-Length") ?? "0", 10);
  if (encContentSize <= 0) return null;

  try {
    await prepareFileDecryption(fileId, { isLegacy: false, dataKey, encContentSize, contentType });
    return getDecryptedFileUrl(fileId);
  } catch {
    // TODO: Error Handling
    return null;
  }
};

export const requestThumbnailUpload = async (
  fileId: number,
  thumbnail: Blob,
  dataKey: CryptoKey,
  dataKeyVersion: Date,
) => {
  const thumbnailBuffer = await thumbnail.arrayBuffer();
  const thumbnailEncrypted = await encryptData(thumbnailBuffer, dataKey);
  const res = await requestFileThumbnailUpload(fileId, dataKeyVersion, thumbnailEncrypted);
  if (!res.ok) return false;

  storeFileThumbnailCache(fileId, thumbnailBuffer); // Intended
  return true;
};

export const requestFileAdditionToCategory = async (fileId: number, categoryId: number) => {
  try {
    await trpc().category.addFile.mutate({ id: categoryId, file: fileId });
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};
