import { LRUCache } from "lru-cache";
import { writable, type Writable } from "svelte/store";
import { browser } from "$app/environment";
import { decryptChunk } from "$lib/modules/crypto";
import type { SummarizedFileInfo } from "$lib/modules/filesystem";
import { readFile, writeFile, deleteFile, deleteDirectory } from "$lib/modules/opfs";
import { getThumbnailUrl } from "$lib/modules/thumbnail";

const loadedThumbnails = new LRUCache<number, Writable<string>>({ max: 100 });
const loadingThumbnails = new Map<number, Writable<string | undefined>>();

const fetchFromOpfs = async (fileId: number) => {
  const thumbnailBuffer = await readFile(`/thumbnail/file/${fileId}`);
  if (thumbnailBuffer) {
    return getThumbnailUrl(thumbnailBuffer);
  }
};

const fetchFromServer = async (fileId: number, dataKey: CryptoKey) => {
  const res = await fetch(`/api/file/${fileId}/thumbnail/download`);
  if (!res.ok) return null;

  const thumbnailBuffer = await decryptChunk(await res.arrayBuffer(), dataKey);

  void writeFile(`/thumbnail/file/${fileId}`, thumbnailBuffer);
  return getThumbnailUrl(thumbnailBuffer);
};

export const getFileThumbnail = (file: SummarizedFileInfo) => {
  if (
    !browser ||
    !(file.contentType.startsWith("image/") || file.contentType.startsWith("video/"))
  ) {
    return undefined;
  }

  const thumbnail = loadedThumbnails.get(file.id);
  if (thumbnail) return thumbnail;

  let loadingThumbnail = loadingThumbnails.get(file.id);
  if (loadingThumbnail) return loadingThumbnail;

  loadingThumbnail = writable(undefined);
  loadingThumbnails.set(file.id, loadingThumbnail);

  fetchFromOpfs(file.id)
    .then((thumbnail) => thumbnail ?? (file.dataKey && fetchFromServer(file.id, file.dataKey.key)))
    .then((thumbnail) => {
      if (thumbnail) {
        loadingThumbnail.set(thumbnail);
        loadedThumbnails.set(file.id, loadingThumbnail as Writable<string>);
      }
      loadingThumbnails.delete(file.id);
    });
  return loadingThumbnail;
};

export const storeFileThumbnailCache = async (fileId: number, thumbnailBuffer: ArrayBuffer) => {
  await writeFile(`/thumbnail/file/${fileId}`, thumbnailBuffer);

  const oldThumbnail = loadedThumbnails.get(fileId);
  if (oldThumbnail) {
    oldThumbnail.set(getThumbnailUrl(thumbnailBuffer));
  } else {
    loadedThumbnails.set(fileId, writable(getThumbnailUrl(thumbnailBuffer)));
  }
};

export const deleteFileThumbnailCache = async (fileId: number) => {
  loadedThumbnails.delete(fileId);
  await deleteFile(`/thumbnail/file/${fileId}`);
};

export const deleteAllFileThumbnailCaches = async () => {
  loadedThumbnails.clear();
  await deleteDirectory(`/thumbnail/file`);
};
