export interface FileMetadata {
  isLegacy: boolean;
  dataKey: CryptoKey;
  encContentSize: number;
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

export type ServiceWorkerMessage = DecryptionPrepareMessage;
export type ServiceWorkerResponse = DecryptionReadyMessage;
