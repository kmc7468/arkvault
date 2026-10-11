import { limitFunction } from "p-limit";
import { SvelteMap } from "svelte/reactivity";
import { generateThumbnail } from "#lib/client/media/thumbnail.js";
import {
  getFileContent,
  getFileInfo,
  uploadFileThumbnail,
  type FileInfo,
} from "#lib/features/filesystem/index.js";
import { Scheduler } from "#lib/utils/index.js";
import type { RouterOutputs } from "#trpc/router.server.js";

export type GenerationStatus =
  "queued" | "generation-pending" | "generating" | "uploading" | "uploaded" | "error";

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

export const requestMissingThumbnailFiles = async (
  filesRaw: RouterOutputs["file"]["listWithoutThumbnail"],
) => {
  const files = await Promise.all(
    filesRaw.map((file) => getFileInfo(file.id, { serverResponse: file })),
  );
  return files;
};

const generateAndUploadThumbnail = limitFunction(
  async (fileInfo: FileInfo, fileBuffer: ArrayBuffer) => {
    statuses.set(fileInfo.id, "generating");

    const thumbnail = await generateThumbnail(
      new Blob([fileBuffer], { type: fileInfo.contentType }),
    );
    if (!thumbnail) {
      throw new Error("Failed to generate thumbnail");
    }

    statuses.set(fileInfo.id, "uploading");
    await uploadFileThumbnail(fileInfo.id, thumbnail, fileInfo.dataKey!);
    statuses.set(fileInfo.id, "uploaded");
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
        file = await getFileContent(fileInfo.id, fileInfo.dataKey!.key, !!fileInfo.isLegacy);
        return file.byteLength;
      },
      () => generateAndUploadThumbnail(fileInfo, file!),
    );
  } catch (e) {
    console.error(e);
    statuses.set(fileInfo.id, "error");
  }
};
