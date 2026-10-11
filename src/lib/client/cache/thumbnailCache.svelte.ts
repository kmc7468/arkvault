/* eslint-disable svelte/prefer-svelte-reactivity -- Lookup tables of reactive entries */
import { LRUCache } from "lru-cache";
import { deleteDirectory, deleteFile, readFile, writeFile } from "#lib/client/storage/opfs.js";
import { decryptChunk, encodeToBase64 } from "#lib/shared/crypto/index.js";

export interface Thumbnail {
  url?: string;
}

const getThumbnailUrl = (thumbnailBuffer: ArrayBuffer) => {
  return `data:image/webp;base64,${encodeToBase64(thumbnailBuffer)}`;
};

// Thumbnails are reactive so that they can be updated in place
const loadedThumbnails = new LRUCache<number, Thumbnail>({ max: 100 });
const loadingThumbnails = new Map<number, Thumbnail>();

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

export const getFileThumbnail = (file: {
  id: number;
  contentType: string;
  dataKey?: { key: CryptoKey };
}) => {
  if (!(file.contentType.startsWith("image/") || file.contentType.startsWith("video/"))) {
    return undefined;
  }

  const thumbnail = loadedThumbnails.get(file.id) ?? loadingThumbnails.get(file.id);
  if (thumbnail) return thumbnail;

  const loadingThumbnail: Thumbnail = $state({});
  loadingThumbnails.set(file.id, loadingThumbnail);

  fetchFromOpfs(file.id)
    .then((url) => url ?? (file.dataKey && fetchFromServer(file.id, file.dataKey.key)))
    .then((url) => {
      if (url) {
        loadingThumbnail.url = url;
        loadedThumbnails.set(file.id, loadingThumbnail);
      }
    })
    .catch(console.error)
    .finally(() => {
      loadingThumbnails.delete(file.id);
    });
  return loadingThumbnail;
};

export const storeFileThumbnailCache = async (fileId: number, thumbnailBuffer: ArrayBuffer) => {
  await writeFile(`/thumbnail/file/${fileId}`, thumbnailBuffer);

  const url = getThumbnailUrl(thumbnailBuffer);
  const thumbnail = loadedThumbnails.get(fileId) ?? loadingThumbnails.get(fileId);
  if (thumbnail) {
    thumbnail.url = url;
  } else {
    const newThumbnail: Thumbnail = $state({ url });
    loadedThumbnails.set(fileId, newThumbnail);
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
