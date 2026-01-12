import ExifReader from "exifreader";
import { limitFunction } from "p-limit";
import { CHUNK_SIZE } from "$lib/constants";
import {
  encodeToBase64,
  generateDataKey,
  wrapDataKey,
  encryptString,
  createHmacStream,
} from "$lib/modules/crypto";
import { Scheduler } from "$lib/modules/scheduler";
import { generateThumbnail } from "$lib/modules/thumbnail";
import { uploadBlob } from "$lib/modules/upload";
import type { MasterKey, HmacSecret } from "$lib/stores";
import { trpc } from "$trpc/client";

export interface FileUploadState {
  name: string;
  parentId: DirectoryId;
  status:
    | "queued"
    | "encryption-pending"
    | "encrypting"
    | "upload-pending"
    | "uploading"
    | "uploaded"
    | "canceled"
    | "error";
  progress?: number;
  rate?: number;
  estimated?: number;
}

export type LiveFileUploadState = FileUploadState & {
  status: "queued" | "encryption-pending" | "encrypting" | "upload-pending" | "uploading";
};

const scheduler = new Scheduler<
  { fileId: number; fileBuffer?: ArrayBuffer; thumbnailBuffer?: ArrayBuffer } | undefined
>();
let uploadingFiles: FileUploadState[] = $state([]);

const isFileUploading = (status: FileUploadState["status"]) =>
  ["queued", "encryption-pending", "encrypting", "upload-pending", "uploading"].includes(status);

export const getUploadingFiles = (parentId?: DirectoryId) => {
  return uploadingFiles.filter(
    (file) =>
      (parentId === undefined || file.parentId === parentId) && isFileUploading(file.status),
  );
};

export const clearUploadedFiles = () => {
  uploadingFiles = uploadingFiles.filter((file) => isFileUploading(file.status));
};

const requestDuplicateFileScan = limitFunction(
  async (file: File, hmacSecret: HmacSecret, onDuplicate: () => Promise<boolean>) => {
    const hmacStream = await createHmacStream(hmacSecret.secret);
    const reader = file.stream().getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      hmacStream.update(value);
    }

    const fileSigned = encodeToBase64(hmacStream.digest());
    const files = await trpc().file.listByHash.query({
      hskVersion: hmacSecret.version,
      contentHmac: fileSigned,
    });
    if (files.length === 0 || (await onDuplicate())) {
      return { fileSigned };
    } else {
      return {};
    }
  },
  { concurrency: 1 },
);

const getFileType = (file: File) => {
  if (file.type) return file.type;
  if (file.name.endsWith(".heic")) return "image/heic";
  throw new Error("Unknown file type");
};

const extractExifDateTime = (fileBuffer: ArrayBuffer) => {
  const exif = ExifReader.load(fileBuffer);
  const dateTimeOriginal = exif["DateTimeOriginal"]?.description;
  const offsetTimeOriginal = exif["OffsetTimeOriginal"]?.description;
  if (!dateTimeOriginal) return undefined;

  const [date, time] = dateTimeOriginal.split(" ");
  if (!date || !time) return undefined;

  const [year, month, day] = date.split(":").map(Number);
  const [hour, minute, second] = time.split(":").map(Number);
  if (!year || !month || !day || !hour || !minute || !second) return undefined;

  if (!offsetTimeOriginal) {
    // No timezone information.. Assume local timezone
    return new Date(year, month - 1, day, hour, minute, second);
  }

  const offsetSign = offsetTimeOriginal[0] === "+" ? 1 : -1;
  const [offsetHour, offsetMinute] = offsetTimeOriginal.slice(1).split(":").map(Number);

  const utcDate = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMs = offsetSign * ((offsetHour ?? 0) * 60 + (offsetMinute ?? 0)) * 60 * 1000;
  return new Date(utcDate - offsetMs);
};

const requestFileUpload2 = async (
  state: FileUploadState,
  file: Blob,
  fileSigned: string,
  fileMetadata: {
    parentId: "root" | number;
    name: string;
    createdAt?: Date;
    lastModifiedAt: Date;
  },
  masterKey: MasterKey,
  hmacSecret: HmacSecret,
) => {
  state.status = "encrypting";

  const { dataKey, dataKeyVersion } = await generateDataKey();
  const dataKeyWrapped = await wrapDataKey(dataKey, masterKey.key);

  const [nameEncrypted, createdAtEncrypted, lastModifiedAtEncrypted, thumbnailBuffer] =
    await Promise.all([
      encryptString(fileMetadata.name, dataKey),
      fileMetadata.createdAt && encryptString(fileMetadata.createdAt.getTime().toString(), dataKey),
      encryptString(fileMetadata.lastModifiedAt.getTime().toString(), dataKey),
      generateThumbnail(file).then((blob) => blob?.arrayBuffer()),
    ]);

  const { uploadId } = await trpc().upload.startFileUpload.mutate({
    chunks: Math.ceil(file.size / CHUNK_SIZE),
    parent: fileMetadata.parentId,
    mekVersion: masterKey.version,
    dek: dataKeyWrapped,
    dekVersion: dataKeyVersion,
    hskVersion: hmacSecret.version,
    contentType: file.type,
    name: nameEncrypted.ciphertext,
    nameIv: nameEncrypted.iv,
    createdAt: createdAtEncrypted?.ciphertext,
    createdAtIv: createdAtEncrypted?.iv,
    lastModifiedAt: lastModifiedAtEncrypted.ciphertext,
    lastModifiedAtIv: lastModifiedAtEncrypted.iv,
  });

  state.status = "uploading";

  await uploadBlob(uploadId, file, dataKey, {
    onProgress(s) {
      state.progress = s.progress;
      state.rate = s.rateBps;
    },
  });

  const { file: fileId } = await trpc().upload.completeFileUpload.mutate({
    uploadId,
    contentHmac: fileSigned,
  });

  if (thumbnailBuffer) {
    const { uploadId } = await trpc().upload.startFileThumbnailUpload.mutate({
      file: fileId,
      dekVersion: dataKeyVersion,
    });

    await uploadBlob(uploadId, new Blob([thumbnailBuffer]), dataKey);

    await trpc().upload.completeFileThumbnailUpload.mutate({ uploadId });
  }

  state.status = "uploaded";

  return { fileId, thumbnailBuffer };
};

export const uploadFile = async (
  file: File,
  parentId: "root" | number,
  masterKey: MasterKey,
  hmacSecret: HmacSecret,
  onDuplicate: () => Promise<boolean>,
) => {
  uploadingFiles.push({
    name: file.name,
    parentId,
    status: "queued",
  });
  const state = uploadingFiles.at(-1)!;

  return await scheduler.schedule(file.size, async () => {
    state.status = "encryption-pending";

    try {
      const { fileSigned } = await requestDuplicateFileScan(file, hmacSecret, onDuplicate);
      if (!fileSigned) {
        state.status = "canceled";
        uploadingFiles = uploadingFiles.filter((file) => file !== state);
        return;
      }

      const fileType = getFileType(file);
      if (fileType.startsWith("image/")) {
        const fileBuffer = await file.arrayBuffer();
        const fileCreatedAt = extractExifDateTime(fileBuffer);

        const { fileId, thumbnailBuffer } = await requestFileUpload2(
          state,
          new Blob([fileBuffer], { type: fileType }),
          fileSigned,
          {
            parentId,
            name: file.name,
            createdAt: fileCreatedAt,
            lastModifiedAt: new Date(file.lastModified),
          },
          masterKey,
          hmacSecret,
        );

        return { fileId, fileBuffer, thumbnailBuffer };
      } else {
        const { fileId, thumbnailBuffer } = await requestFileUpload2(
          state,
          file,
          fileSigned,
          {
            parentId,
            name: file.name,
            lastModifiedAt: new Date(file.lastModified),
          },
          masterKey,
          hmacSecret,
        );
        return { fileId, thumbnailBuffer };
      }
    } catch (e) {
      state.status = "error";
      throw e;
    }
  });
};
