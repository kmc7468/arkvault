import { ENCRYPTION_OVERHEAD, CHUNK_SIZE, ENCRYPTED_CHUNK_SIZE } from "./constants";

export * from "../../lib/modules/crypto";

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
