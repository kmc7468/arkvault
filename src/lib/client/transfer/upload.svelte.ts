import { limitFunction } from "p-limit";
import { createUploadFileCache } from "#lib/client/cache/index.ts";
import { signMessageHmac } from "#lib/client/crypto/hmac.ts";
import {
  ensureHmacSecrets,
  keyring,
  type HmacSecret,
  type MasterKey,
} from "#lib/client/keys/index.ts";
import { readExifDateTime } from "#lib/client/media/exif.ts";
import { generateThumbnail } from "#lib/client/media/thumbnail.ts";
import { uploadBlob } from "#lib/client/transfer/chunked-upload.ts";
import {
  encodeToBase64,
  generateDataKey,
  wrapDataKey,
  encryptString,
} from "#lib/shared/crypto/index.ts";
import { getChunkCount } from "#lib/shared/format/index.ts";
import { Scheduler } from "#lib/utils/index.ts";
import { trpc } from "#trpc/client.ts";

const LIVE_STATUSES = [
  "queued",
  "encryption-pending",
  "encrypting",
  "upload-pending",
  "uploading",
] as const;

type LiveStatus = (typeof LIVE_STATUSES)[number];

export interface FileUploadState {
  id: string;
  name: string;
  parentId: DirectoryId;
  status: LiveStatus | "uploaded" | "canceled" | "error";
  progress?: number;
  rate?: number;
  estimated?: number;
}

export type LiveFileUploadState = FileUploadState & { status: LiveStatus };

const scheduler = new Scheduler<{ fileId: number; thumbnailBuffer?: ArrayBuffer } | undefined>();
let uploadingFiles: FileUploadState[] = $state([]);

const isFileUploading = (file: FileUploadState): file is LiveFileUploadState => {
  return (LIVE_STATUSES as readonly string[]).includes(file.status);
};

export const getUploadingFiles = (parentId?: DirectoryId) => {
  return uploadingFiles
    .filter(isFileUploading)
    .filter((file) => parentId === undefined || file.parentId === parentId);
};

export const clearUploadedFiles = () => {
  uploadingFiles = uploadingFiles.filter(isFileUploading);
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
    const files = await trpc.file.listByHash.query({
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

    const { uploadId } = await trpc.upload.startFileUpload.mutate({
      chunks: getChunkCount(file.size),
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

    // The file is cached while uploading, so that it doesn't have to be read again
    const cache = createUploadFileCache(file.size);

    let fileId;
    try {
      const { encContentHash } = await uploadBlob(uploadId, file, dataKey, {
        onProgress(s) {
          state.progress = s.progress;
          state.rate = s.rate;
        },
        onPlaintextChunk: cache.writeChunk,
      });

      ({ file: fileId } = await trpc.upload.completeFileUpload.mutate({
        uploadId,
        contentHmac: fileSigned,
        encContentHash,
      }));
    } catch (e) {
      await cache.discard();
      throw e;
    }

    await cache.commit(fileId).catch(console.error);

    if (thumbnailBuffer) {
      try {
        const { uploadId } = await trpc.upload.startFileThumbnailUpload.mutate({
          file: fileId,
          dekVersion: dataKeyVersion,
        });

        await uploadBlob(uploadId, new Blob([thumbnailBuffer]), dataKey);

        await trpc.upload.completeFileThumbnailUpload.mutate({ uploadId });
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
  onDuplicate: () => Promise<boolean>,
) => {
  uploadingFiles.push({
    id: crypto.randomUUID(),
    name: file.name,
    parentId,
    status: "queued",
  });
  const state = uploadingFiles.at(-1)!;

  return await scheduler.schedule(file.size, async () => {
    try {
      await ensureHmacSecrets();
      const masterKey = keyring.activeMasterKey;
      const hmacSecret = keyring.activeHmacSecret;

      const { fileSigned } = await requestDuplicateFileScan(state, file, hmacSecret, onDuplicate);

      if (!fileSigned) {
        state.status = "canceled";
        uploadingFiles = uploadingFiles.filter((file) => file !== state);
        return;
      }

      const fileType = getFileType(file);
      const fileMetadata: FileMetadata = {
        parentId,
        name: file.name,
        lastModifiedAt: new Date(file.lastModified),
      };

      if (fileType.startsWith("image/")) {
        fileMetadata.createdAt = await readExifDateTime(file);
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

      return { fileId, thumbnailBuffer };
    } catch (e) {
      state.status = "error";
      throw e;
    }
  });
};
