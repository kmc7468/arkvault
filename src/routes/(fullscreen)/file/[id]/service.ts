import { storeFileThumbnailCache } from "#lib/client/cache/index.js";
import { prepareFileDecryption, getDecryptedFileUrl } from "#lib/client/serviceWorker.js";
import { requestFileThumbnailUpload } from "#lib/services/file.js";
import { trpc } from "#trpc/client.js";

export { requestCategoryCreation, requestFileRemovalFromCategory } from "#lib/services/category.js";
export { requestFileDownload } from "#lib/services/file.js";

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
  const res = await requestFileThumbnailUpload(fileId, thumbnail, dataKey, dataKeyVersion);
  if (!res) return false;

  void thumbnail.arrayBuffer().then((buffer) => storeFileThumbnailCache(fileId, buffer));
  return true;
};

export const requestFileAdditionToCategory = async (fileId: number, categoryId: number) => {
  try {
    await trpc.category.addFile.mutate({ id: categoryId, file: fileId });
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};

export const requestFavoriteToggle = async (fileId: number, isFavorite: boolean) => {
  try {
    if (isFavorite) {
      await trpc.favorites.removeFile.mutate({ id: fileId });
    } else {
      await trpc.favorites.addFile.mutate({ id: fileId });
    }
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};
