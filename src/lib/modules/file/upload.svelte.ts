import ExifReader from "exifreader";
import { limitFunction } from "p-limit";
import { CHUNK_SIZE } from "$lib/constants";
import { encodeToBase64, generateDataKey, wrapDataKey, encryptString } from "$lib/modules/crypto";
import { signMessageHmac } from "$lib/modules/crypto";
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
  async (
    state: FileUploadState,
    file: File,
    hmacSecret: HmacSecret,
    onDuplicate: () => Promise<boolean>,
  ) => {
    state.status = "encryption-pending";

    const fileSigned = encodeToBase64(await signMessageHmac(file, hmacSecret.secret));
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

interface FileMetadata {
  parentId: "root" | number;
  name: string;
  createdAt?: Date;
  lastModifiedAt: Date;
}

const requestFileMetadataEncryption = limitFunction(
  async (
    state: FileUploadState,
    file: Blob,
    fileMetadata: FileMetadata,
    masterKey: MasterKey,
    hmacSecret: HmacSecret,
  ) => {
    state.status = "encrypting";

    const { dataKey, dataKeyVersion } = await generateDataKey();
    const dataKeyWrapped = await wrapDataKey(dataKey, masterKey.key);

    const [nameEncrypted, createdAtEncrypted, lastModifiedAtEncrypted, thumbnailBuffer] =
      await Promise.all([
        encryptString(fileMetadata.name, dataKey),
        fileMetadata.createdAt &&
          encryptString(fileMetadata.createdAt.getTime().toString(), dataKey),
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

    state.status = "upload-pending";
    return { uploadId, thumbnailBuffer, dataKey, dataKeyVersion };
  },
  { concurrency: 4 },
);

const requestFileUpload = limitFunction(
  async (
    state: FileUploadState,
    uploadId: string,
    file: Blob,
    fileSigned: string,
    thumbnailBuffer: ArrayBuffer | undefined,
    dataKey: CryptoKey,
    dataKeyVersion: Date,
  ) => {
    state.status = "uploading";

    await uploadBlob(uploadId, file, dataKey, {
      onProgress(s) {
        state.progress = s.progress;
        state.rate = s.rate;
      },
    });

    const { file: fileId } = await trpc().upload.completeFileUpload.mutate({
      uploadId,
      contentHmac: fileSigned,
    });

    if (thumbnailBuffer) {
      try {
        const { uploadId } = await trpc().upload.startFileThumbnailUpload.mutate({
          file: fileId,
          dekVersion: dataKeyVersion,
        });

        await uploadBlob(uploadId, new Blob([thumbnailBuffer]), dataKey);

        await trpc().upload.completeFileThumbnailUpload.mutate({ uploadId });
      } catch (e) {
        console.error(e);
      }
    }

    state.status = "uploaded";
    return { fileId };
  },
  { concurrency: 1 },
);

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
    try {
      const { fileSigned } = await requestDuplicateFileScan(state, file, hmacSecret, onDuplicate);

      if (!fileSigned) {
        state.status = "canceled";
        uploadingFiles = uploadingFiles.filter((file) => file !== state);
        return;
      }

      let fileBuffer;
      const fileType = getFileType(file);
      const fileMetadata: FileMetadata = {
        parentId,
        name: file.name,
        lastModifiedAt: new Date(file.lastModified),
      };

      if (fileType.startsWith("image/")) {
        fileBuffer = await file.arrayBuffer();
        fileMetadata.createdAt = extractExifDateTime(fileBuffer);
      }

      const blob = new Blob([file], { type: fileType });

      const { uploadId, thumbnailBuffer, dataKey, dataKeyVersion } =
        await requestFileMetadataEncryption(state, blob, fileMetadata, masterKey, hmacSecret);

      const { fileId } = await requestFileUpload(
        state,
        uploadId,
        blob,
        fileSigned,
        thumbnailBuffer,
        dataKey,
        dataKeyVersion,
      );

      return { fileId, fileBuffer, thumbnailBuffer };
    } catch (e) {
      state.status = "error";
      throw e;
    }
  });
};
