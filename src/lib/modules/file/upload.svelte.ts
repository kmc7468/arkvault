import axios from "axios";
import ExifReader from "exifreader";
import { limitFunction } from "p-limit";
import {
  encodeToBase64,
  generateDataKey,
  wrapDataKey,
  encryptData,
  encryptString,
  digestMessage,
  signMessageHmac,
} from "$lib/modules/crypto";
import { generateThumbnail } from "$lib/modules/thumbnail";
import type {
  FileThumbnailUploadRequest,
  FileUploadRequest,
  FileUploadResponse,
} from "$lib/server/schemas";
import type { MasterKey, HmacSecret } from "$lib/stores";
import { trpc } from "$trpc/client";

export interface FileUploadState {
  name: string;
  parentId: DirectoryId;
  status:
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
  status: "encryption-pending" | "encrypting" | "upload-pending" | "uploading";
};

let uploadingFiles: FileUploadState[] = $state([]);

const isFileUploading = (status: FileUploadState["status"]) =>
  ["encryption-pending", "encrypting", "upload-pending", "uploading"].includes(status);

export const getUploadingFiles = (parentId?: DirectoryId) => {
  return uploadingFiles.filter(
    (file): file is LiveFileUploadState =>
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

    const fileEncrypted = await encryptData(fileBuffer, dataKey);
    const fileEncryptedHash = encodeToBase64(await digestMessage(fileEncrypted.ciphertext));

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
      fileEncrypted,
      fileEncryptedHash,
      nameEncrypted,
      createdAtEncrypted,
      lastModifiedAtEncrypted,
      thumbnail: thumbnailEncrypted && { plaintext: thumbnailBuffer, ...thumbnailEncrypted },
    };
  },
  { concurrency: 4 },
);

const requestFileUpload = limitFunction(
  async (state: FileUploadState, form: FormData, thumbnailForm: FormData | null) => {
    state.status = "uploading";

    const res = await axios.post("/api/file/upload", form, {
      onUploadProgress: ({ progress, rate, estimated }) => {
        state.progress = progress;
        state.rate = rate;
        state.estimated = estimated;
      },
    });
    const { file }: FileUploadResponse = res.data;

    if (thumbnailForm) {
      try {
        await axios.post(`/api/file/${file}/thumbnail/upload`, thumbnailForm);
      } catch (e) {
        // TODO
        console.error(e);
      }
    }

    state.status = "uploaded";

    return { fileId: file };
  },
  { concurrency: 1 },
);

export const uploadFile = async (
  file: File,
  parentId: "root" | number,
  hmacSecret: HmacSecret,
  masterKey: MasterKey,
  onDuplicate: () => Promise<boolean>,
): Promise<
  { fileId: number; fileBuffer: ArrayBuffer; thumbnailBuffer?: ArrayBuffer } | undefined
> => {
  uploadingFiles.push({
    name: file.name,
    parentId,
    status: "encryption-pending",
  });
  const state = uploadingFiles.at(-1)!;

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
      fileEncrypted,
      fileEncryptedHash,
      nameEncrypted,
      createdAtEncrypted,
      lastModifiedAtEncrypted,
      thumbnail,
    } = await encryptFile(state, file, fileBuffer, masterKey);

    const form = new FormData();
    form.set(
      "metadata",
      JSON.stringify({
        parent: parentId,
        mekVersion: masterKey.version,
        dek: dataKeyWrapped,
        dekVersion: dataKeyVersion.toISOString(),
        hskVersion: hmacSecret.version,
        contentHmac: fileSigned,
        contentType: fileType,
        contentIv: fileEncrypted.iv,
        name: nameEncrypted.ciphertext,
        nameIv: nameEncrypted.iv,
        createdAt: createdAtEncrypted?.ciphertext,
        createdAtIv: createdAtEncrypted?.iv,
        lastModifiedAt: lastModifiedAtEncrypted.ciphertext,
        lastModifiedAtIv: lastModifiedAtEncrypted.iv,
      } satisfies FileUploadRequest),
    );
    form.set("content", new Blob([fileEncrypted.ciphertext]));
    form.set("checksum", fileEncryptedHash);

    let thumbnailForm = null;
    if (thumbnail) {
      thumbnailForm = new FormData();
      thumbnailForm.set(
        "metadata",
        JSON.stringify({
          dekVersion: dataKeyVersion.toISOString(),
          contentIv: thumbnail.iv,
        } satisfies FileThumbnailUploadRequest),
      );
      thumbnailForm.set("content", new Blob([thumbnail.ciphertext]));
    }

    const { fileId } = await requestFileUpload(state, form, thumbnailForm);
    return { fileId, fileBuffer, thumbnailBuffer: thumbnail?.plaintext };
  } catch (e) {
    state.status = "error";
    throw e;
  }
};
