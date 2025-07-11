import { callPostApi } from "$lib/hooks";
import { encryptData } from "$lib/modules/crypto";
import { storeFileThumbnailCache } from "$lib/modules/file";
import type { CategoryFileAddRequest, FileThumbnailUploadRequest } from "$lib/server/schemas";

export { requestCategoryCreation, requestFileRemovalFromCategory } from "$lib/services/category";
export { requestFileDownload } from "$lib/services/file";

export const requestThumbnailUpload = async (
  fileId: number,
  thumbnail: Blob,
  dataKey: CryptoKey,
  dataKeyVersion: Date,
) => {
  const thumbnailBuffer = await thumbnail.arrayBuffer();
  const thumbnailEncrypted = await encryptData(thumbnailBuffer, dataKey);

  const form = new FormData();
  form.set(
    "metadata",
    JSON.stringify({
      dekVersion: dataKeyVersion.toISOString(),
      contentIv: thumbnailEncrypted.iv,
    } satisfies FileThumbnailUploadRequest),
  );
  form.set("content", new Blob([thumbnailEncrypted.ciphertext]));

  const res = await fetch(`/api/file/${fileId}/thumbnail/upload`, { method: "POST", body: form });
  if (!res.ok) return false;

  storeFileThumbnailCache(fileId, thumbnailBuffer); // Intended
  return true;
};

export const requestFileAdditionToCategory = async (fileId: number, categoryId: number) => {
  const res = await callPostApi<CategoryFileAddRequest>(`/api/category/${categoryId}/file/add`, {
    file: fileId,
  });
  return res.ok;
};
