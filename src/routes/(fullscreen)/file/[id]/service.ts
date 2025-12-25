import { encryptData } from "$lib/modules/crypto";
import { storeFileThumbnailCache } from "$lib/modules/file";
import { requestFileThumbnailUpload } from "$lib/services/file";
import { useTRPC } from "$trpc/client";

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
  const res = await requestFileThumbnailUpload(fileId, dataKeyVersion, thumbnailEncrypted);
  if (!res.ok) return false;

  storeFileThumbnailCache(fileId, thumbnailBuffer); // Intended
  return true;
};

export const requestFileAdditionToCategory = async (fileId: number, categoryId: number) => {
  const trpc = useTRPC();

  try {
    await trpc.category.addFile.mutate({ id: categoryId, file: fileId });
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};
