import { unwrapDataKey, decryptString } from "$lib/modules/crypto";

export const decryptDirectoryMetadata = async (
  metadata: { dek: string; dekVersion: Date; name: string; nameIv: string },
  masterKey: CryptoKey,
) => {
  const { dataKey } = await unwrapDataKey(metadata.dek, masterKey);
  const name = await decryptString(metadata.name, metadata.nameIv, dataKey);

  return {
    dataKey: { key: dataKey, version: metadata.dekVersion },
    name,
  };
};

const decryptDate = async (ciphertext: string, iv: string, dataKey: CryptoKey) => {
  return new Date(parseInt(await decryptString(ciphertext, iv, dataKey), 10));
};

export const decryptFileMetadata = async (
  metadata: {
    dek: string;
    dekVersion: Date;
    name: string;
    nameIv: string;
    createdAt?: string;
    createdAtIv?: string;
    lastModifiedAt: string;
    lastModifiedAtIv: string;
  },
  masterKey: CryptoKey,
) => {
  const { dataKey } = await unwrapDataKey(metadata.dek, masterKey);
  const [name, createdAt, lastModifiedAt] = await Promise.all([
    decryptString(metadata.name, metadata.nameIv, dataKey),
    metadata.createdAt
      ? decryptDate(metadata.createdAt, metadata.createdAtIv!, dataKey)
      : undefined,
    decryptDate(metadata.lastModifiedAt, metadata.lastModifiedAtIv, dataKey),
  ]);

  return {
    dataKey: { key: dataKey, version: metadata.dekVersion },
    name,
    createdAt,
    lastModifiedAt,
  };
};

export const decryptCategoryMetadata = decryptDirectoryMetadata;
