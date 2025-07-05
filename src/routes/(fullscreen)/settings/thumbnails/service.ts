import { limitFunction } from "p-limit";
import { encryptData } from "$lib/modules/crypto";
import { getFileCache, storeFileCache, downloadFile, storeFileThumbnail } from "$lib/modules/file";
import { generateImageThumbnail, generateVideoThumbnail } from "$lib/modules/thumbnail";
import type { FileThumbnailUploadRequest } from "$lib/server/schemas";

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

export const generateThumbnail = limitFunction(
  async (fileBuffer: ArrayBuffer, fileType: string) => {
    let url;
    try {
      if (fileType.startsWith("image/")) {
        url = URL.createObjectURL(new Blob([fileBuffer], { type: fileType }));
        return await generateImageThumbnail(url);
      } else if (fileType.startsWith("video/")) {
        url = URL.createObjectURL(new Blob([fileBuffer], { type: fileType }));
        return await generateVideoThumbnail(url);
      }
      return null;
    } catch {
      // TODO: Error handling
      return null;
    } finally {
      if (url) {
        URL.revokeObjectURL(url);
      }
    }
  },
  { concurrency: 4 },
);

export const requestThumbnailUpload = limitFunction(
  async (fileId: number, thumbnail: ArrayBuffer, dataKey: CryptoKey, dataKeyVersion: Date) => {
    const thumbnailEncrypted = await encryptData(thumbnail, dataKey);
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

    storeFileThumbnail(fileId, thumbnail); // Intended
    return true;
  },
  { concurrency: 4 },
);
