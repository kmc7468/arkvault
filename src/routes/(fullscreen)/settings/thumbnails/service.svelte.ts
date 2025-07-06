import { limitFunction } from "p-limit";
import { get, writable, type Writable } from "svelte/store";
import { encryptData } from "$lib/modules/crypto";
import { storeFileThumbnail } from "$lib/modules/file";
import type { FileInfo } from "$lib/modules/filesystem";
import { generateImageThumbnail, generateVideoThumbnail } from "$lib/modules/thumbnail";
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

export const getGenerationStatus = (fileId: number): Writable<GenerationStatus> | undefined => {
  return workingFiles.get(fileId);
};

const generateThumbnail = limitFunction(
  async (
    status: Writable<GenerationStatus>,
    fileBuffer: ArrayBuffer,
    fileType: string,
    dataKey: CryptoKey,
  ) => {
    let url, thumbnail;
    status.set("generating");

    try {
      if (fileType === "image/heic") {
        const { default: heic2any } = await import("heic2any");
        url = URL.createObjectURL(
          (await heic2any({
            blob: new Blob([fileBuffer], { type: fileType }),
            toType: "image/png",
          })) as Blob,
        );
        thumbnail = await generateImageThumbnail(url);
      } else if (fileType.startsWith("image/")) {
        url = URL.createObjectURL(new Blob([fileBuffer], { type: fileType }));
        thumbnail = await generateImageThumbnail(url);
      } else if (fileType.startsWith("video/")) {
        url = URL.createObjectURL(new Blob([fileBuffer], { type: fileType }));
        thumbnail = await generateVideoThumbnail(url);
      } else {
        status.set("error");
        return null;
      }

      const thumbnailBuffer = await thumbnail.arrayBuffer();
      const thumbnailEncrypted = await encryptData(thumbnailBuffer, dataKey);
      status.set("upload-pending");
      return { plaintext: thumbnailBuffer, ...thumbnailEncrypted };
    } catch {
      status.set("error");
      return null;
    } finally {
      if (url) {
        URL.revokeObjectURL(url);
      }
    }
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

    storeFileThumbnail(fileId, thumbnail.plaintext); // Intended
    return true;
  },
  { concurrency: 4 },
);

export const requestFileThumbnailGeneration = async (fileInfo: FileInfo) => {
  let status = workingFiles.get(fileInfo.id);
  if (status && get(status) !== "error") return;

  status = writable("generation-pending");
  workingFiles.set(fileInfo.id, status);
  persistentStates.files = persistentStates.files.map((file) =>
    file.id === fileInfo.id ? { ...file, status } : file,
  );

  // TODO: Error Handling
  const file = await requestFileDownload(fileInfo.id, fileInfo.contentIv!, fileInfo.dataKey!);
  const thumbnail = await generateThumbnail(status, file, fileInfo.contentType, fileInfo.dataKey!);
  if (!thumbnail) return;

  await requestThumbnailUpload(status, fileInfo.id, fileInfo.dataKeyVersion!, thumbnail);
};
