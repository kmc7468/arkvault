import { limitFunction } from "p-limit";
import { SvelteMap } from "svelte/reactivity";
import { generateThumbnailFromUrl } from "#lib/client/media/thumbnail.ts";
import {
  getFileInfo,
  getFileStreamUrl,
  uploadFileThumbnail,
  type FileInfo,
} from "#lib/features/filesystem/index.ts";
import type { RouterOutputs } from "#trpc/router.server.ts";

export type GenerationStatus = "queued" | "generating" | "uploading" | "uploaded" | "error";

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

// The content is streamed by the service worker, so only the decoded media occupy the memory
const generateAndUploadThumbnail = limitFunction(
  async (fileInfo: FileInfo) => {
    statuses.set(fileInfo.id, "generating");

    const url = await getFileStreamUrl(fileInfo);
    const thumbnail = await generateThumbnailFromUrl(url, fileInfo.contentType);
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
  if (status && status !== "error") return;

  statuses.set(fileInfo.id, "queued");
  try {
    await generateAndUploadThumbnail(fileInfo);
  } catch (e) {
    console.error(e);
    statuses.set(fileInfo.id, "error");
  }
};
