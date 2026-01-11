import ExifReader from "exifreader";
import pLimit, { limitFunction } from "p-limit";
import { CHUNK_SIZE } from "$lib/constants";
import {
  encodeToBase64,
  generateDataKey,
  wrapDataKey,
  encryptData,
  encryptString,
  encryptChunk,
  digestMessage,
  createHmacStream,
} from "$lib/modules/crypto";
import { Scheduler } from "$lib/modules/scheduler";
import { generateThumbnail, generateThumbnailFromFile } from "$lib/modules/thumbnail";
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

const encryptImageFile = limitFunction(
  async (state: FileUploadState, file: File, masterKey: MasterKey) => {
    state.status = "encrypting";

    const fileBuffer = await file.arrayBuffer();
    const createdAt = extractExifDateTime(fileBuffer);

    const { dataKey, dataKeyVersion } = await generateDataKey();
    const dataKeyWrapped = await wrapDataKey(dataKey, masterKey.key);
    const chunksEncrypted = await encryptChunks(fileBuffer, dataKey);

    const nameEncrypted = await encryptString(file.name, dataKey);
    const createdAtEncrypted =
      createdAt && (await encryptString(createdAt.getTime().toString(), dataKey));
    const lastModifiedAtEncrypted = await encryptString(file.lastModified.toString(), dataKey);

    const thumbnail = await generateThumbnail(fileBuffer, getFileType(file));
    const thumbnailBuffer = await thumbnail?.arrayBuffer();
    const thumbnailEncrypted = thumbnailBuffer && (await encryptData(thumbnailBuffer, dataKey));

    state.status = "upload-pending";

    return {
      dataKeyWrapped,
      dataKeyVersion,
      chunksEncrypted,
      nameEncrypted,
      createdAtEncrypted,
      lastModifiedAtEncrypted,
      thumbnail: thumbnailEncrypted && { plaintext: thumbnailBuffer, ...thumbnailEncrypted },
    };
  },
  { concurrency: 4 },
);

const uploadThumbnail = async (
  fileId: number,
  thumbnailEncrypted: { ciphertext: ArrayBuffer; iv: ArrayBuffer },
  dataKeyVersion: Date,
) => {
  const { uploadId } = await trpc().upload.startFileThumbnailUpload.mutate({
    file: fileId,
    dekVersion: dataKeyVersion,
  });

  const ivAndCiphertext = new Uint8Array(
    thumbnailEncrypted.iv.byteLength + thumbnailEncrypted.ciphertext.byteLength,
  );
  ivAndCiphertext.set(new Uint8Array(thumbnailEncrypted.iv), 0);
  ivAndCiphertext.set(
    new Uint8Array(thumbnailEncrypted.ciphertext),
    thumbnailEncrypted.iv.byteLength,
  );

  const chunkHash = encodeToBase64(await digestMessage(ivAndCiphertext));

  const response = await fetch(`/api/upload/${uploadId}/chunks/0`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Digest": `sha-256=:${chunkHash}:`,
    },
    body: ivAndCiphertext,
  });

  if (!response.ok) {
    throw new Error(`Thumbnail upload failed: ${response.status} ${response.statusText}`);
  }

  await trpc().upload.completeFileThumbnailUpload.mutate({ uploadId });
};

const requestImageFileUpload = limitFunction(
  async (
    state: FileUploadState,
    metadata: RouterInputs["upload"]["startFileUpload"],
    chunksEncrypted: { chunkEncrypted: ArrayBuffer; chunkEncryptedHash: string }[],
    fileSigned: string | undefined,
    thumbnailData: { ciphertext: ArrayBuffer; iv: ArrayBuffer; plaintext: ArrayBuffer } | null,
    dataKeyVersion: Date,
  ) => {
    state.status = "uploading";

    const { uploadId } = await trpc().upload.startFileUpload.mutate(metadata);

    const totalBytes = chunksEncrypted.reduce((sum, c) => sum + c.chunkEncrypted.byteLength, 0);
    let uploadedBytes = 0;
    const startTime = Date.now();

    for (let i = 0; i < chunksEncrypted.length; i++) {
      const { chunkEncrypted, chunkEncryptedHash } = chunksEncrypted[i]!;

      const response = await fetch(`/api/upload/${uploadId}/chunks/${i}`, {
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

      const elapsed = (Date.now() - startTime) / 1000;
      const rate = uploadedBytes / elapsed;
      const remaining = totalBytes - uploadedBytes;
      const estimated = rate > 0 ? remaining / rate : undefined;

      state.progress = uploadedBytes / totalBytes;
      state.rate = rate;
      state.estimated = estimated;
    }

    const { file: fileId } = await trpc().upload.completeFileUpload.mutate({
      uploadId,
      contentHmac: fileSigned,
    });

    if (thumbnailData) {
      try {
        await uploadThumbnail(fileId, thumbnailData, dataKeyVersion);
      } catch (e) {
        // TODO: Error handling for thumbnail upload
        console.error(e);
      }
    }

    state.status = "uploaded";

    return { fileId, thumbnailBuffer: thumbnailData?.plaintext };
  },
  { concurrency: 1 },
);

const requestFileUpload = async (
  state: FileUploadState,
  file: File,
  masterKey: MasterKey,
  hmacSecret: HmacSecret,
  fileSigned: string,
  parentId: DirectoryId,
) => {
  state.status = "uploading";

  const fileType = getFileType(file);
  const { dataKey, dataKeyVersion } = await generateDataKey();
  const dataKeyWrapped = await wrapDataKey(dataKey, masterKey.key);

  const nameEncrypted = await encryptString(file.name, dataKey);
  const lastModifiedAtEncrypted = await encryptString(file.lastModified.toString(), dataKey);

  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const metadata = {
    chunks: totalChunks,
    parent: parentId,
    mekVersion: masterKey.version,
    dek: dataKeyWrapped,
    dekVersion: dataKeyVersion,
    hskVersion: hmacSecret.version,
    contentType: fileType,
    name: nameEncrypted.ciphertext,
    nameIv: nameEncrypted.iv,
    lastModifiedAt: lastModifiedAtEncrypted.ciphertext,
    lastModifiedAtIv: lastModifiedAtEncrypted.iv,
  };

  const { uploadId } = await trpc().upload.startFileUpload.mutate(metadata);

  const reader = file.stream().getReader();
  const limit = pLimit(4);
  let buffer = new Uint8Array(0);
  let chunkIndex = 0;
  const uploadPromises: Promise<void>[] = [];

  const totalBytes = file.size;
  let uploadedBytes = 0;
  const startTime = Date.now();

  const uploadChunk = async (
    index: number,
    encryptedChunk: ArrayBuffer,
    chunkHash: string,
    originalChunkSize: number,
  ) => {
    const response = await fetch(`/api/upload/${uploadId}/chunks/${index}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Digest": `sha-256=:${chunkHash}:`,
      },
      body: encryptedChunk,
    });

    if (!response.ok) {
      throw new Error(`Chunk upload failed: ${response.status} ${response.statusText}`);
    }

    uploadedBytes += originalChunkSize;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = uploadedBytes / elapsed;
    const remaining = totalBytes - uploadedBytes;
    const estimated = rate > 0 ? remaining / rate : undefined;

    state.progress = uploadedBytes / totalBytes;
    state.rate = rate;
    state.estimated = estimated;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done && buffer.length === 0) break;

    if (value) {
      const newBuffer = new Uint8Array(buffer.length + value.length);
      newBuffer.set(buffer);
      newBuffer.set(value, buffer.length);
      buffer = newBuffer;
    }

    while (buffer.length >= CHUNK_SIZE || (done && buffer.length > 0)) {
      const chunkSize = Math.min(CHUNK_SIZE, buffer.length);
      const chunk = buffer.slice(0, chunkSize);
      buffer = buffer.slice(chunkSize);

      const encryptedChunk = await encryptChunk(chunk.buffer.slice(0, chunk.byteLength), dataKey);
      const chunkHash = encodeToBase64(await digestMessage(encryptedChunk));
      const currentIndex = chunkIndex++;

      uploadPromises.push(
        limit(() => uploadChunk(currentIndex, encryptedChunk, chunkHash, chunkSize)),
      );
    }

    if (done) break;
  }

  await Promise.all(uploadPromises);

  const { file: fileId } = await trpc().upload.completeFileUpload.mutate({
    uploadId,
    contentHmac: fileSigned,
  });

  if (fileType.startsWith("video/")) {
    try {
      const thumbnail = await generateThumbnailFromFile(file);
      if (thumbnail) {
        const thumbnailBuffer = await thumbnail.arrayBuffer();
        const thumbnailEncrypted = await encryptData(thumbnailBuffer, dataKey);

        await uploadThumbnail(fileId, thumbnailEncrypted, dataKeyVersion);
      }
    } catch (e) {
      // Thumbnail upload failure is not critical
      console.error(e);
    }
  }

  state.status = "uploaded";

  return { fileId };
};

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
      const { fileSigned } = await requestDuplicateFileScan(file, hmacSecret, onDuplicate);
      if (!fileSigned) {
        state.status = "canceled";
        uploadingFiles = uploadingFiles.filter((file) => file !== state);
        return;
      }

      const fileType = getFileType(file);
      if (fileType.startsWith("image/")) {
        const fileBuffer = await file.arrayBuffer();
        const {
          dataKeyWrapped,
          dataKeyVersion,
          chunksEncrypted,
          nameEncrypted,
          createdAtEncrypted,
          lastModifiedAtEncrypted,
          thumbnail,
        } = await encryptImageFile(state, file, masterKey);

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

        const { fileId, thumbnailBuffer } = await requestImageFileUpload(
          state,
          metadata,
          chunksEncrypted,
          fileSigned,
          thumbnail ?? null,
          dataKeyVersion,
        );
        return { fileId, fileBuffer, thumbnailBuffer };
      } else {
        const { fileId } = await requestFileUpload(
          state,
          file,
          masterKey,
          hmacSecret,
          fileSigned,
          parentId,
        );
        return { fileId };
      }
    } catch (e) {
      state.status = "error";
      throw e;
    }
  });
};
