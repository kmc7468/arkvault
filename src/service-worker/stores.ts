import type { FileMetadata } from "#lib/shared/serviceWorker.js";

const MAX_FILE_METADATA_ENTRIES = 32;

const fileMetadata = new Map<number, FileMetadata>();

export const fileMetadataStore = {
  get(fileId: number) {
    const metadata = fileMetadata.get(fileId);
    if (metadata) {
      // Move to the end to keep the most recently used entries
      fileMetadata.delete(fileId);
      fileMetadata.set(fileId, metadata);
    }
    return metadata;
  },
  set(fileId: number, metadata: FileMetadata) {
    fileMetadata.delete(fileId);
    fileMetadata.set(fileId, metadata);

    while (fileMetadata.size > MAX_FILE_METADATA_ENTRIES) {
      fileMetadata.delete(fileMetadata.keys().next().value!);
    }
  },
};
