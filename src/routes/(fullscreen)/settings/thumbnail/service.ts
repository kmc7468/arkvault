import { limitFunction } from "p-limit";
import { SvelteMap } from "svelte/reactivity";
import { encryptData } from "$lib/modules/crypto";
import { storeFileThumbnailCache } from "$lib/modules/file";
import type { FileInfo } from "$lib/modules/filesystem";
import { Scheduler } from "$lib/modules/scheduler";
import { generateThumbnail as doGenerateThumbnail } from "$lib/modules/thumbnail";
import { requestFileDownload, requestFileThumbnailUpload } from "$lib/services/file";

export type GenerationStatus =
  | "queued"
  | "generation-pending"
  | "generating"
  | "upload-pending"
  | "uploading"
  | "uploaded"
  | "error";

const scheduler = new Scheduler();
const statuses = new SvelteMap<number, GenerationStatus>();

export const getThumbnailGenerationStatus = (fileId: number) => {
  return statuses.get(fileId);
};

export const clearThumbnailGenerationStatuses = () => {
  for (const [id, status] of statuses) {
    if (status === "uploaded" || status === "error") {
      statuses.delete(id);
    }
  }
};

const generateThumbnail = limitFunction(
  async (fileId: number, fileBuffer: ArrayBuffer, fileType: string, dataKey: CryptoKey) => {
    statuses.set(fileId, "generating");

    const thumbnail = await doGenerateThumbnail(new Blob([fileBuffer], { type: fileType }));
    if (!thumbnail) return null;

    const thumbnailBuffer = await thumbnail.arrayBuffer();
    const thumbnailEncrypted = await encryptData(thumbnailBuffer, dataKey);
    statuses.set(fileId, "upload-pending");
    return { plaintext: thumbnailBuffer, ...thumbnailEncrypted };
  },
  { concurrency: 4 },
);

const requestThumbnailUpload = limitFunction(
  async (
    fileId: number,
    dataKeyVersion: Date,
    thumbnail: { plaintext: ArrayBuffer; ciphertext: ArrayBuffer; iv: ArrayBuffer },
  ) => {
    statuses.set(fileId, "uploading");

    const res = await requestFileThumbnailUpload(fileId, dataKeyVersion, thumbnail);
    if (!res.ok) return false;
    statuses.set(fileId, "uploaded");
    storeFileThumbnailCache(fileId, thumbnail.plaintext); // Intended
    return true;
  },
  { concurrency: 4 },
);

export const requestThumbnailGeneration = async (fileInfo: FileInfo) => {
  const status = statuses.get(fileInfo.id);
  if (status) {
    if (status !== "error") return;
  } else {
    statuses.set(fileInfo.id, "queued");
  }

  try {
    let file: ArrayBuffer | undefined;

    await scheduler.schedule(
      async () => {
        statuses.set(fileInfo.id, "generation-pending");
        file = await requestFileDownload(fileInfo.id, fileInfo.dataKey?.key!, fileInfo.isLegacy!);
        return file.byteLength;
      },
      async () => {
        const thumbnail = await generateThumbnail(
          fileInfo.id,
          file!,
          fileInfo.contentType,
          fileInfo.dataKey?.key!,
        );
        if (
          !thumbnail ||
          !(await requestThumbnailUpload(fileInfo.id, fileInfo.dataKey?.version!, thumbnail))
        ) {
          statuses.set(fileInfo.id, "error");
        }
      },
    );
  } catch (e) {
    statuses.set(fileInfo.id, "error");
    throw e;
  }
};
