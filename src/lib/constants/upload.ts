export const AES_GCM_IV_SIZE = 12;
export const AES_GCM_TAG_SIZE = 16;
export const ENCRYPTION_OVERHEAD = AES_GCM_IV_SIZE + AES_GCM_TAG_SIZE;

export const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MiB
export const ENCRYPTED_CHUNK_SIZE = CHUNK_SIZE + ENCRYPTION_OVERHEAD;

export const MAX_FILE_SIZE = 512 * 1024 * 1024; // 512 MiB
export const MAX_CHUNKS = Math.ceil(MAX_FILE_SIZE / CHUNK_SIZE); // 128 chunks
