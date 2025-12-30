import { limitFunction } from "p-limit";
import { get, writable, type Writable } from "svelte/store";
import { encryptData } from "$lib/modules/crypto";
import { storeFileThumbnailCache } from "$lib/modules/file";
import type { FileInfo } from "$lib/modules/filesystem2.svelte";
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

interface File {
  id: number;
  info: FileInfo;
  status?: Writable<GenerationStatus>;
}

const workingFiles = new Map<number, Writable<GenerationStatus>>();

let queue: (() => void)[] = [];
let memoryUsage = 0;
const memoryLimit = 100 * 1024 * 1024; // 100 MiB

export const persistentStates = $state({
  files: [] as File[],
});

export const getGenerationStatus = (fileId: number) => {
  return workingFiles.get(fileId);
};

const generateThumbnail = limitFunction(
  async (
    status: Writable<GenerationStatus>,
    fileBuffer: ArrayBuffer,
    fileType: string,
    dataKey: CryptoKey,
  ) => {
    status.set("generating");

    const thumbnail = await doGenerateThumbnail(fileBuffer, fileType);
    if (!thumbnail) return null;

    const thumbnailBuffer = await thumbnail.arrayBuffer();
    const thumbnailEncrypted = await encryptData(thumbnailBuffer, dataKey);
    status.set("upload-pending");
    return { plaintext: thumbnailBuffer, ...thumbnailEncrypted };
  },
  { concurrency: 4 },
);

const requestThumbnailUpload = limitFunction(
  async (
    status: Writable<GenerationStatus>,
    fileId: number,
    dataKeyVersion: Date,
    thumbnail: { plaintext: ArrayBuffer; ciphertext: ArrayBuffer; iv: string },
  ) => {
    status.set("uploading");

    const res = await requestFileThumbnailUpload(fileId, dataKeyVersion, thumbnail);
    if (!res.ok) return false;

    status.set("uploaded");
    workingFiles.delete(fileId);
    persistentStates.files = persistentStates.files.filter(({ id }) => id != fileId);

    storeFileThumbnailCache(fileId, thumbnail.plaintext); // Intended
    return true;
  },
  { concurrency: 4 },
);

const enqueue = async (
  status: Writable<GenerationStatus> | undefined,
  fileInfo: FileInfo,
  priority = false,
) => {
  if (status) {
    status.set("queued");
  } else {
    status = writable("queued");
    workingFiles.set(fileInfo.id, status);
    persistentStates.files = persistentStates.files.map((file) =>
      file.id === fileInfo.id ? { ...file, status } : file,
    );
  }

  let resolver;
  const promise = new Promise((resolve) => {
    resolver = resolve;
  });

  if (priority) {
    queue = [resolver!, ...queue];
  } else {
    queue.push(resolver!);
  }

  await promise;
};

export const requestThumbnailGeneration = async (fileInfo: FileInfo) => {
  let status = workingFiles.get(fileInfo.id);
  if (status && get(status) !== "error") return;

  if (workingFiles.values().some((status) => get(status) !== "error")) {
    await enqueue(status, fileInfo);
  }
  while (memoryUsage >= memoryLimit) {
    await enqueue(status, fileInfo, true);
  }

  if (status) {
    status.set("generation-pending");
  } else {
    status = writable("generation-pending");
    workingFiles.set(fileInfo.id, status);
    persistentStates.files = persistentStates.files.map((file) =>
      file.id === fileInfo.id ? { ...file, status } : file,
    );
  }

  let fileSize = 0;
  try {
    const file = await requestFileDownload(
      fileInfo.id,
      fileInfo.contentIv!,
      fileInfo.dataKey?.key!,
    );
    fileSize = file.byteLength;

    memoryUsage += fileSize;
    if (memoryUsage < memoryLimit) {
      queue.shift()?.();
    }

    const thumbnail = await generateThumbnail(
      status,
      file,
      fileInfo.contentType,
      fileInfo.dataKey?.key!,
    );
    if (
      !thumbnail ||
      !(await requestThumbnailUpload(status, fileInfo.id, fileInfo.dataKey?.version!, thumbnail))
    ) {
      status.set("error");
    }
  } catch {
    status.set("error");
  } finally {
    memoryUsage -= fileSize;
    queue.shift()?.();
  }
};
