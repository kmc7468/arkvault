import { limitFunction } from "p-limit";
import { get, writable, type Writable } from "svelte/store";
import { encryptData } from "$lib/modules/crypto";
import { storeFileThumbnailCache } from "$lib/modules/file";
import type { FileInfo } from "$lib/modules/filesystem";
import { generateThumbnail as doGenerateThumbnail } from "$lib/modules/thumbnail";
import type { FileThumbnailUploadRequest } from "$lib/server/schemas";
import { requestFileDownload } from "$lib/services/file";

export type GenerationStatus =
  | "generation-pending"
  | "generating"
  | "upload-pending"
  | "uploading"
  | "uploaded"
  | "error";

interface File {
  id: number;
  info: Writable<FileInfo | null>;
  status?: Writable<GenerationStatus>;
}

const workingFiles = new Map<number, Writable<GenerationStatus>>();

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
    if (!thumbnail) {
      status.set("error");
      return null;
    }

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

    const form = new FormData();
    form.set(
      "metadata",
      JSON.stringify({
        dekVersion: dataKeyVersion.toISOString(),
        contentIv: thumbnail.iv,
      } satisfies FileThumbnailUploadRequest),
    );
    form.set("content", new Blob([thumbnail.ciphertext]));

    const res = await fetch(`/api/file/${fileId}/thumbnail/upload`, { method: "POST", body: form });
    if (!res.ok) return false;

    status.set("uploaded");
    workingFiles.delete(fileId);
    persistentStates.files = persistentStates.files.filter(({ id }) => id != fileId);

    storeFileThumbnailCache(fileId, thumbnail.plaintext); // Intended
    return true;
  },
  { concurrency: 4 },
);

export const requestThumbnailGeneration = async (fileInfo: FileInfo) => {
  let status = workingFiles.get(fileInfo.id);
  if (status && get(status) !== "error") return;

  status = writable("generation-pending");
  workingFiles.set(fileInfo.id, status);
  persistentStates.files = persistentStates.files.map((file) =>
    file.id === fileInfo.id ? { ...file, status } : file,
  );

  try {
    const file = await requestFileDownload(fileInfo.id, fileInfo.contentIv!, fileInfo.dataKey!);
    const thumbnail = await generateThumbnail(
      status,
      file,
      fileInfo.contentType,
      fileInfo.dataKey!,
    );
    if (!thumbnail) return;
    if (!(await requestThumbnailUpload(status, fileInfo.id, fileInfo.dataKeyVersion!, thumbnail))) {
      status.set("error");
    }
  } catch {
    status.set("error");
  }
};
