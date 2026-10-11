import type { DownloadProgressMessage } from "#lib/shared/serviceWorker.js";
import { createSpeedMeter } from "#lib/utils/speedMeter.js";

// Files are downloaded and decrypted by the service worker, which reports the progress

export interface FileDownloadState {
  id: number;
  status: "downloading" | "completed" | "error";
  progress?: number;
  rate?: number;
}

let downloadingFiles: FileDownloadState[] = $state([]);
const speedMeters = new WeakMap<FileDownloadState, ReturnType<typeof createSpeedMeter>>();

export const isFileDownloading = (status: FileDownloadState["status"]) => {
  return status === "downloading";
};

export const getFileDownloadState = (fileId: number) => {
  return downloadingFiles.find((file) => file.id === fileId && isFileDownloading(file.status));
};

export const getDownloadingFiles = () => {
  return downloadingFiles.filter((file) => isFileDownloading(file.status));
};

export const clearDownloadedFiles = () => {
  downloadingFiles = downloadingFiles.filter((file) => isFileDownloading(file.status));
};

export const handleDownloadProgress = ({
  fileId,
  status,
  loaded,
  total,
}: DownloadProgressMessage) => {
  let state = getFileDownloadState(fileId);
  if (!state) {
    if (status !== "downloading") return;

    downloadingFiles.push({ id: fileId, status });
    state = downloadingFiles.at(-1)!;
    speedMeters.set(state, createSpeedMeter());
  }

  if (status === "canceled") {
    downloadingFiles = downloadingFiles.filter((file) => file !== state);
    return;
  }

  state.status = status;
  state.progress = total > 0 ? loaded / total : 1;
  state.rate = speedMeters.get(state)?.(loaded);
};
