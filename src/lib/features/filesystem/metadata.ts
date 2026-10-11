import { keyring } from "#lib/client/keys/index.ts";
import {
  decryptString,
  encryptString,
  generateDataKey,
  unwrapDataKey,
  wrapDataKey,
} from "#lib/shared/crypto/index.ts";

const unwrapEntryDataKey = async (metadata: { mekVersion: number; dek: string }) => {
  const { dataKey } = await unwrapDataKey(
    metadata.dek,
    keyring.getMasterKey(metadata.mekVersion).key,
  );
  return dataKey;
};

export const decryptDirectoryMetadata = async (metadata: {
  mekVersion: number;
  dek: string;
  dekVersion: Date;
  name: string;
  nameIv: string;
}) => {
  const dataKey = await unwrapEntryDataKey(metadata);
  const name = await decryptString(metadata.name, metadata.nameIv, dataKey);

  return {
    dataKey: { key: dataKey, version: metadata.dekVersion },
    name,
  };
};

const decryptDate = async (ciphertext: string, iv: string, dataKey: CryptoKey) => {
  return new Date(parseInt(await decryptString(ciphertext, iv, dataKey), 10));
};

export const decryptFileMetadata = async (metadata: {
  mekVersion: number;
  dek: string;
  dekVersion: Date;
  name: string;
  nameIv: string;
  createdAt?: string;
  createdAtIv?: string;
  lastModifiedAt: string;
  lastModifiedAtIv: string;
}) => {
  const dataKey = await unwrapEntryDataKey(metadata);
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

export const encryptName = async (name: string, dataKey: CryptoKey) => {
  const { ciphertext, iv } = await encryptString(name, dataKey);
  return { name: ciphertext, nameIv: iv };
};

// Generates the keys of a new directory or category encrypted with the active master key
export const generateEntryKeys = async (name: string) => {
  const masterKey = keyring.activeMasterKey;
  const { dataKey, dataKeyVersion } = await generateDataKey();
  return {
    mekVersion: masterKey.version,
    dek: await wrapDataKey(dataKey, masterKey.key),
    dekVersion: dataKeyVersion,
    ...(await encryptName(name, dataKey)),
  };
};
