import { writable, type Writable } from "svelte/store";

export interface FileDownloadStatus {
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

export const fileDownloadStatusStore = writable<Writable<FileDownloadStatus>[]>([]);

export const isFileDownloading = (
  status: FileDownloadStatus["status"],
): status is "download-pending" | "downloading" | "decryption-pending" | "decrypting" => {
  return ["download-pending", "downloading", "decryption-pending", "decrypting"].includes(status);
};
