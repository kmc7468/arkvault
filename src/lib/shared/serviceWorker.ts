export const DECRYPTED_FILE_URL_PREFIX = "/_internal/decryptedFile/";

export interface FileMetadata {
  isLegacy: boolean;
  dataKey: CryptoKey;
  // Fetched by the worker when needed
  encContentSize?: number;
  contentType: string;
}

export interface DecryptionPrepareMessage extends FileMetadata {
  type: "decryption-prepare";
  fileId: number;
}

export interface DecryptionReadyMessage {
  type: "decryption-ready";
  fileId: number;
}

// Sent with a MessagePort to which the client replies with `FileMetadata | null`
export interface DecryptionMetadataRequestMessage {
  type: "decryption-metadata-request";
  fileId: number;
}

// Progress of the whole content of a file being streamed from the server
export interface DownloadProgressMessage {
  type: "download-progress";
  fileId: number;
  status: "downloading" | "completed" | "canceled" | "error";
  loaded: number;
  total: number;
}

export type ServiceWorkerMessage = DecryptionPrepareMessage;
export type ServiceWorkerResponse =
  DecryptionReadyMessage | DecryptionMetadataRequestMessage | DownloadProgressMessage;
