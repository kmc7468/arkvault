import axios from "axios";
import ExifReader from "exifreader";
import { limitFunction } from "p-limit";
import { CHUNK_SIZE } from "$lib/constants";
import {
  encodeToBase64,
  generateDataKey,
  wrapDataKey,
  encryptData,
  encryptString,
  encryptChunk,
  digestMessage,
  signMessageHmac,
} from "$lib/modules/crypto";
import { Scheduler } from "$lib/modules/scheduler";
import { generateThumbnail } from "$lib/modules/thumbnail";
import type { FileThumbnailUploadRequest } from "$lib/server/schemas";
import type { MasterKey, HmacSecret } from "$lib/stores";
import { trpc } from "$trpc/client";
import type { RouterInputs } from "$trpc/router.server";

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
  { fileId: number; fileBuffer: ArrayBuffer; thumbnailBuffer?: ArrayBuffer } | undefined
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
    const fileBuffer = await file.arrayBuffer();
    const fileSigned = encodeToBase64(await signMessageHmac(fileBuffer, hmacSecret.secret));

    const files = await trpc().file.listByHash.query({
      hskVersion: hmacSecret.version,
      contentHmac: fileSigned,
    });
    if (files.length === 0 || (await onDuplicate())) {
      return { fileBuffer, fileSigned };
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

const encryptChunks = async (fileBuffer: ArrayBuffer, dataKey: CryptoKey) => {
  const chunksEncrypted: { chunkEncrypted: ArrayBuffer; chunkEncryptedHash: string }[] = [];
  let offset = 0;

  while (offset < fileBuffer.byteLength) {
    const nextOffset = Math.min(offset + CHUNK_SIZE, fileBuffer.byteLength);
    const chunkEncrypted = await encryptChunk(fileBuffer.slice(offset, nextOffset), dataKey);
    chunksEncrypted.push({
      chunkEncrypted: chunkEncrypted,
      chunkEncryptedHash: encodeToBase64(await digestMessage(chunkEncrypted)),
    });
    offset = nextOffset;
  }

  return chunksEncrypted;
};

const encryptFile = limitFunction(
  async (state: FileUploadState, file: File, fileBuffer: ArrayBuffer, masterKey: MasterKey) => {
    state.status = "encrypting";

    const fileType = getFileType(file);

    let createdAt;
    if (fileType.startsWith("image/")) {
      createdAt = extractExifDateTime(fileBuffer);
    }

    const { dataKey, dataKeyVersion } = await generateDataKey();
    const dataKeyWrapped = await wrapDataKey(dataKey, masterKey.key);
    const chunksEncrypted = await encryptChunks(fileBuffer, dataKey);

    const nameEncrypted = await encryptString(file.name, dataKey);
    const createdAtEncrypted =
      createdAt && (await encryptString(createdAt.getTime().toString(), dataKey));
    const lastModifiedAtEncrypted = await encryptString(file.lastModified.toString(), dataKey);

    const thumbnail = await generateThumbnail(fileBuffer, fileType);
    const thumbnailBuffer = await thumbnail?.arrayBuffer();
    const thumbnailEncrypted = thumbnailBuffer && (await encryptData(thumbnailBuffer, dataKey));

    state.status = "upload-pending";

    return {
      dataKeyWrapped,
      dataKeyVersion,
      fileType,
      chunksEncrypted,
      nameEncrypted,
      createdAtEncrypted,
      lastModifiedAtEncrypted,
      thumbnail: thumbnailEncrypted && { plaintext: thumbnailBuffer, ...thumbnailEncrypted },
    };
  },
  { concurrency: 4 },
);

const requestFileUpload = limitFunction(
  async (
    state: FileUploadState,
    metadata: RouterInputs["file"]["startUpload"],
    chunksEncrypted: { chunkEncrypted: ArrayBuffer; chunkEncryptedHash: string }[],
    fileSigned: string | undefined,
    thumbnailForm: FormData | null,
  ) => {
    state.status = "uploading";

    const { uploadId } = await trpc().file.startUpload.mutate(metadata);

    // Upload chunks with progress tracking
    const totalBytes = chunksEncrypted.reduce((sum, c) => sum + c.chunkEncrypted.byteLength, 0);
    let uploadedBytes = 0;
    const startTime = Date.now();

    for (let i = 0; i < chunksEncrypted.length; i++) {
      const { chunkEncrypted, chunkEncryptedHash } = chunksEncrypted[i]!;

      const response = await fetch(`/api/file/upload/${uploadId}/chunks/${i}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Digest": `sha-256=:${chunkEncryptedHash}:`,
        },
        body: chunkEncrypted,
      });

      if (!response.ok) {
        throw new Error(`Chunk upload failed: ${response.status} ${response.statusText}`);
      }

      uploadedBytes += chunkEncrypted.byteLength;

      // Calculate progress, rate, estimated
      const elapsed = (Date.now() - startTime) / 1000; // seconds
      const rate = uploadedBytes / elapsed; // bytes per second
      const remaining = totalBytes - uploadedBytes;
      const estimated = rate > 0 ? remaining / rate : undefined;

      state.progress = uploadedBytes / totalBytes;
      state.rate = rate;
      state.estimated = estimated;
    }

    // Complete upload
    const { file: fileId } = await trpc().file.completeUpload.mutate({
      uploadId,
      contentHmac: fileSigned,
    });

    // Upload thumbnail if exists
    if (thumbnailForm) {
      try {
        await axios.post(`/api/file/${fileId}/thumbnail/upload`, thumbnailForm);
      } catch (e) {
        // TODO: Error handling for thumbnail upload
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
  hmacSecret: HmacSecret,
  masterKey: MasterKey,
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
      const { fileBuffer, fileSigned } = await requestDuplicateFileScan(
        file,
        hmacSecret,
        onDuplicate,
      );
      if (!fileBuffer || !fileSigned) {
        state.status = "canceled";
        uploadingFiles = uploadingFiles.filter((file) => file !== state);
        return undefined;
      }

      const {
        dataKeyWrapped,
        dataKeyVersion,
        fileType,
        chunksEncrypted,
        nameEncrypted,
        createdAtEncrypted,
        lastModifiedAtEncrypted,
        thumbnail,
      } = await encryptFile(state, file, fileBuffer, masterKey);

      const metadata = {
        chunks: chunksEncrypted.length,
        parent: parentId,
        mekVersion: masterKey.version,
        dek: dataKeyWrapped,
        dekVersion: dataKeyVersion,
        hskVersion: hmacSecret.version,
        contentType: fileType,
        name: nameEncrypted.ciphertext,
        nameIv: nameEncrypted.iv,
        createdAt: createdAtEncrypted?.ciphertext,
        createdAtIv: createdAtEncrypted?.iv,
        lastModifiedAt: lastModifiedAtEncrypted.ciphertext,
        lastModifiedAtIv: lastModifiedAtEncrypted.iv,
      };

      let thumbnailForm = null;
      if (thumbnail) {
        thumbnailForm = new FormData();
        thumbnailForm.set(
          "metadata",
          JSON.stringify({
            dekVersion: dataKeyVersion.toISOString(),
            contentIv: encodeToBase64(thumbnail.iv),
          } satisfies FileThumbnailUploadRequest),
        );
        thumbnailForm.set("content", new Blob([thumbnail.ciphertext]));
      }

      const { fileId } = await requestFileUpload(
        state,
        metadata,
        chunksEncrypted,
        fileSigned,
        thumbnailForm,
      );
      return { fileId, fileBuffer, thumbnailBuffer: thumbnail?.plaintext };
    } catch (e) {
      state.status = "error";
      throw e;
    }
  });
};
