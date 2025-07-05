import { LRUCache } from "lru-cache";
import { readFile, writeFile, deleteFile } from "$lib/modules/opfs";
import { getThumbnailUrl } from "$lib/modules/thumbnail";

const loadedThumbnails = new LRUCache<number, string>({ max: 100 });

export const getFileThumbnail = async (fileId: number) => {
  const thumbnail = loadedThumbnails.get(fileId);
  if (thumbnail) {
    return thumbnail;
  }

  const thumbnailBuffer = await readFile(`/thumbnails/${fileId}`);
  if (!thumbnailBuffer) return null;

  const thumbnailUrl = getThumbnailUrl(thumbnailBuffer);
  loadedThumbnails.set(fileId, thumbnailUrl);
  return thumbnailUrl;
};

export const storeFileThumbnail = async (fileId: number, thumbnailBuffer: ArrayBuffer) => {
  await writeFile(`/thumbnails/${fileId}`, thumbnailBuffer);
  loadedThumbnails.set(fileId, getThumbnailUrl(thumbnailBuffer));
};

export const deleteFileThumbnail = async (fileId: number) => {
  loadedThumbnails.delete(fileId);
  await deleteFile(`/thumbnails/${fileId}`);
};
