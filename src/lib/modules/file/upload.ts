import axios from "axios";
import ExifReader from "exifreader";
import { limitFunction } from "p-limit";
import { writable, type Writable } from "svelte/store";
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
import {
  fileUploadStatusStore,
  type MasterKey,
  type HmacSecret,
  type FileUploadStatus,
} from "$lib/stores";
import { useTRPC } from "$trpc/client";

const requestDuplicateFileScan = limitFunction(
  async (file: File, hmacSecret: HmacSecret, onDuplicate: () => Promise<boolean>) => {
    const trpc = useTRPC();
    const fileBuffer = await file.arrayBuffer();
    const fileSigned = encodeToBase64(await signMessageHmac(fileBuffer, hmacSecret.secret));

    const files = await trpc.file.listByHash.query({
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
  async (
    status: Writable<FileUploadStatus>,
    file: File,
    fileBuffer: ArrayBuffer,
    masterKey: MasterKey,
  ) => {
    status.update((value) => {
      value.status = "encrypting";
      return value;
    });

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

    status.update((value) => {
      value.status = "upload-pending";
      return value;
    });

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
  async (status: Writable<FileUploadStatus>, form: FormData, thumbnailForm: FormData | null) => {
    status.update((value) => {
      value.status = "uploading";
      return value;
    });

    const res = await axios.post("/api/file/upload", form, {
      onUploadProgress: ({ progress, rate, estimated }) => {
        status.update((value) => {
          value.progress = progress;
          value.rate = rate;
          value.estimated = estimated;
          return value;
        });
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

    status.update((value) => {
      value.status = "uploaded";
      return value;
    });

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
  const status = writable<FileUploadStatus>({
    name: file.name,
    parentId,
    status: "encryption-pending",
  });
  fileUploadStatusStore.update((value) => {
    value.push(status);
    return value;
  });

  try {
    const { fileBuffer, fileSigned } = await requestDuplicateFileScan(
      file,
      hmacSecret,
      onDuplicate,
    );
    if (!fileBuffer || !fileSigned) {
      status.update((value) => {
        value.status = "canceled";
        return value;
      });
      fileUploadStatusStore.update((value) => {
        value = value.filter((v) => v !== status);
        return value;
      });
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
    } = await encryptFile(status, file, fileBuffer, masterKey);

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

    const { fileId } = await requestFileUpload(status, form, thumbnailForm);
    return { fileId, fileBuffer, thumbnailBuffer: thumbnail?.plaintext };
  } catch (e) {
    status.update((value) => {
      value.status = "error";
      return value;
    });
    throw e;
  }
};
