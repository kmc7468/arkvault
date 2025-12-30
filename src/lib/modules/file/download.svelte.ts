import axios from "axios";
import { limitFunction } from "p-limit";
import { decryptData } from "$lib/modules/crypto";

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

export type LiveFileDownloadState = FileDownloadState & {
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
  return downloadingFiles.filter((file): file is LiveFileDownloadState =>
    isFileDownloading(file.status),
  );
};

export const clearDownloadedFiles = () => {
  downloadingFiles = downloadingFiles.filter((file) => isFileDownloading(file.status));
};

const requestFileDownload = limitFunction(
  async (state: FileDownloadState, id: number) => {
    state.status = "download-pending";

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
    fileEncryptedIv: string,
    dataKey: CryptoKey,
  ) => {
    state.status = "decrypting";

    const fileBuffer = await decryptData(fileEncrypted, fileEncryptedIv, dataKey);

    state.status = "decrypted";
    state.result = fileBuffer;
    return fileBuffer;
  },
  { concurrency: 4 },
);

export const downloadFile = async (id: number, fileEncryptedIv: string, dataKey: CryptoKey) => {
  downloadingFiles.push({
    id,
    status: "download-pending",
  });
  const state = downloadingFiles.at(-1)!;

  try {
    return await decryptFile(state, await requestFileDownload(state, id), fileEncryptedIv, dataKey);
  } catch (e) {
    state.status = "error";
    throw e;
  }
};
