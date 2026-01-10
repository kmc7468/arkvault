export const CHUNK_SIZE = 4 * 1024 * 1024;

export const AES_GCM_IV_SIZE = 12;
export const AES_GCM_TAG_SIZE = 16;
export const ENCRYPTION_OVERHEAD = AES_GCM_IV_SIZE + AES_GCM_TAG_SIZE;
