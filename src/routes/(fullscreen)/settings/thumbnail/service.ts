import { limitFunction } from "p-limit";
import { SvelteMap } from "svelte/reactivity";
import { storeFileThumbnailCache } from "$lib/modules/file";
import type { FileInfo } from "$lib/modules/filesystem";
import { generateThumbnail } from "$lib/modules/thumbnail";
import { requestFileDownload, requestFileThumbnailUpload } from "$lib/services/file";
import { Scheduler } from "$lib/utils";

export type GenerationStatus =
  | "queued"
  | "generation-pending"
  | "generating"
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

const requestThumbnailUpload = limitFunction(
  async (fileInfo: FileInfo, fileBuffer: ArrayBuffer) => {
    statuses.set(fileInfo.id, "generating");

    const thumbnail = await generateThumbnail(
      new Blob([fileBuffer], { type: fileInfo.contentType }),
    );
    if (!thumbnail) return false;

    statuses.set(fileInfo.id, "uploading");

    const res = await requestFileThumbnailUpload(
      fileInfo.id,
      thumbnail,
      fileInfo.dataKey?.key!,
      fileInfo.dataKey?.version!,
    );
    if (!res) return false;

    statuses.set(fileInfo.id, "uploaded");
    void thumbnail.arrayBuffer().then((buffer) => storeFileThumbnailCache(fileInfo.id, buffer));
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
        if (!(await requestThumbnailUpload(fileInfo, file!))) {
          statuses.set(fileInfo.id, "error");
        }
      },
    );
  } catch (e) {
    statuses.set(fileInfo.id, "error");
    throw e;
  }
};
