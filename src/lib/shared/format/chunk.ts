import { AES_GCM_IV_SIZE, AES_GCM_TAG_SIZE } from "#lib/shared/crypto/index.ts";

// Files are encrypted in chunks of `CHUNK_SIZE` bytes, each of which is stored as
// `IV || ciphertext || tag`. Legacy files are encrypted as a single chunk.

export const ENCRYPTION_OVERHEAD = AES_GCM_IV_SIZE + AES_GCM_TAG_SIZE;

export const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MiB
export const ENCRYPTED_CHUNK_SIZE = CHUNK_SIZE + ENCRYPTION_OVERHEAD;

export const getChunkCount = (size: number) => {
  return Math.ceil(size / CHUNK_SIZE);
};

export const getEncryptedSize = (size: number) => {
  return size + getChunkCount(size) * ENCRYPTION_OVERHEAD;
};

export const getDecryptedSize = (encryptedSize: number, isLegacy: boolean) => {
  if (isLegacy) {
    return encryptedSize - ENCRYPTION_OVERHEAD;
  }

  const fullChunks = Math.floor(encryptedSize / ENCRYPTED_CHUNK_SIZE);
  const lastChunkEncSize = encryptedSize % ENCRYPTED_CHUNK_SIZE;
  return (
    fullChunks * CHUNK_SIZE + (lastChunkEncSize > 0 ? lastChunkEncSize - ENCRYPTION_OVERHEAD : 0)
  );
};

// Maps a range of the plaintext to the range of the encrypted chunks that contain it
export const getEncryptedRange = (
  start: number,
  end: number,
  totalEncryptedSize: number,
  isLegacy: boolean,
) => {
  if (isLegacy) {
    return {
      firstChunkIndex: 0,
      lastChunkIndex: 0,
      start: 0,
      end: totalEncryptedSize - 1,
    };
  }

  const firstChunkIndex = Math.floor(start / CHUNK_SIZE);
  const lastChunkIndex = Math.floor(end / CHUNK_SIZE);
  return {
    firstChunkIndex,
    lastChunkIndex,
    start: firstChunkIndex * ENCRYPTED_CHUNK_SIZE,
    end: Math.min((lastChunkIndex + 1) * ENCRYPTED_CHUNK_SIZE - 1, totalEncryptedSize - 1),
  };
};
