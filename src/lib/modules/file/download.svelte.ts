import axios from "axios";
import { limitFunction } from "p-limit";
import { CHUNK_SIZE, ENCRYPTION_OVERHEAD } from "$lib/constants";
import { decryptChunk, concatenateBuffers } from "$lib/modules/crypto";

export interface FileDownloadState {
  id: number;
  status:
    | "download-pending"
    | "downloading"
    | "decryption-pending"
    | "decrypting"
    | "decrypted"
    | "canceled"
    | "error";
  progress?: number;
  rate?: number;
  estimated?: number;
  result?: ArrayBuffer;
}

type LiveFileDownloadState = FileDownloadState & {
  status: "download-pending" | "downloading" | "decryption-pending" | "decrypting";
};

let downloadingFiles: FileDownloadState[] = $state([]);

export const isFileDownloading = (
  status: FileDownloadState["status"],
): status is LiveFileDownloadState["status"] =>
  ["download-pending", "downloading", "decryption-pending", "decrypting"].includes(status);

export const getFileDownloadState = (fileId: number) => {
  return downloadingFiles.find((file) => file.id === fileId && isFileDownloading(file.status));
};

export const getDownloadingFiles = () => {
  return downloadingFiles.filter((file) => isFileDownloading(file.status));
};

export const clearDownloadedFiles = () => {
  downloadingFiles = downloadingFiles.filter((file) => isFileDownloading(file.status));
};

const requestFileDownload = limitFunction(
  async (state: FileDownloadState, id: number) => {
    state.status = "downloading";

    const res = await axios.get(`/api/file/${id}/download`, {
      responseType: "arraybuffer",
      onDownloadProgress: ({ progress, rate, estimated }) => {
        state.progress = progress;
        state.rate = rate;
        state.estimated = estimated;
      },
    });
    const fileEncrypted: ArrayBuffer = res.data;

    state.status = "decryption-pending";
    return fileEncrypted;
  },
  { concurrency: 1 },
);

const decryptFile = limitFunction(
  async (
    state: FileDownloadState,
    fileEncrypted: ArrayBuffer,
    encryptedChunkSize: number,
    dataKey: CryptoKey,
  ) => {
    state.status = "decrypting";

    const chunks: ArrayBuffer[] = [];
    let offset = 0;

    while (offset < fileEncrypted.byteLength) {
      const nextOffset = Math.min(offset + encryptedChunkSize, fileEncrypted.byteLength);
      chunks.push(await decryptChunk(fileEncrypted.slice(offset, nextOffset), dataKey));
      offset = nextOffset;
    }

    const fileBuffer = concatenateBuffers(...chunks).buffer;
    state.status = "decrypted";
    state.result = fileBuffer;
    return fileBuffer;
  },
  { concurrency: 4 },
);

export const downloadFile = async (id: number, dataKey: CryptoKey, isLegacy: boolean) => {
  downloadingFiles.push({
    id,
    status: "download-pending",
  });
  const state = downloadingFiles.at(-1)!;

  try {
    const fileEncrypted = await requestFileDownload(state, id);
    return await decryptFile(
      state,
      fileEncrypted,
      isLegacy ? fileEncrypted.byteLength : CHUNK_SIZE + ENCRYPTION_OVERHEAD,
      dataKey,
    );
  } catch (e) {
    state.status = "error";
    throw e;
  }
};
