import { getContext, setContext } from "svelte";
import { storeHmacSecrets } from "$lib/indexedDB";
import { generateDataKey, wrapDataKey, unwrapHmacSecret, encryptString } from "$lib/modules/crypto";
import {
  storeFileCache,
  deleteFileCache,
  storeFileThumbnailCache,
  deleteFileThumbnailCache,
  uploadFile,
} from "$lib/modules/file";
import { hmacSecretStore, type MasterKey, type HmacSecret } from "$lib/stores";
import { trpc } from "$trpc/client";

export interface SelectedEntry {
  type: "directory" | "file";
  id: number;
  dataKey: { key: CryptoKey; version: Date } | undefined;
  name: string;
}

export const createContext = () => {
  const context = $state({
    selectedEntry: undefined as SelectedEntry | undefined,
  });
  return setContext("context", context);
};

export const useContext = () => {
  return getContext<ReturnType<typeof createContext>>("context");
};

export const requestHmacSecretDownload = async (masterKey: CryptoKey) => {
  // TODO: MEK rotation

  let hmacSecretsWrapped;
  try {
    hmacSecretsWrapped = await trpc().hsk.list.query();
  } catch {
    // TODO: Error Handling
    return false;
  }

  const hmacSecrets = await Promise.all(
    hmacSecretsWrapped.map(async ({ version, state, hsk: hmacSecretWrapped }) => {
      const { hmacSecret } = await unwrapHmacSecret(hmacSecretWrapped, masterKey);
      return { version, state, secret: hmacSecret };
    }),
  );

  await storeHmacSecrets(hmacSecrets);
  hmacSecretStore.set(new Map(hmacSecrets.map((hmacSecret) => [hmacSecret.version, hmacSecret])));

  return true;
};

export const requestDirectoryCreation = async (
  name: string,
  parentId: "root" | number,
  masterKey: MasterKey,
) => {
  const { dataKey, dataKeyVersion } = await generateDataKey();
  const nameEncrypted = await encryptString(name, dataKey);

  try {
    await trpc().directory.create.mutate({
      parent: parentId,
      mekVersion: masterKey.version,
      dek: await wrapDataKey(dataKey, masterKey.key),
      dekVersion: dataKeyVersion,
      name: nameEncrypted.ciphertext,
      nameIv: nameEncrypted.iv,
    });
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};

export const requestFileUpload = async (
  file: File,
  parentId: "root" | number,
  hmacSecret: HmacSecret,
  masterKey: MasterKey,
  onDuplicate: () => Promise<boolean>,
) => {
  const res = await uploadFile(file, parentId, hmacSecret, masterKey, onDuplicate);
  if (!res) return false;

  storeFileCache(res.fileId, res.fileBuffer); // Intended
  if (res.thumbnailBuffer) {
    storeFileThumbnailCache(res.fileId, res.thumbnailBuffer); // Intended
  }

  return true;
};

export const requestEntryRename = async (entry: SelectedEntry, newName: string) => {
  if (!entry.dataKey) {
    // TODO: Error Handling
    return false;
  }

  const newNameEncrypted = await encryptString(newName, entry.dataKey.key);

  try {
    if (entry.type === "directory") {
      await trpc().directory.rename.mutate({
        id: entry.id,
        dekVersion: entry.dataKey.version,
        name: newNameEncrypted.ciphertext,
        nameIv: newNameEncrypted.iv,
      });
    } else {
      await trpc().file.rename.mutate({
        id: entry.id,
        dekVersion: entry.dataKey.version,
        name: newNameEncrypted.ciphertext,
        nameIv: newNameEncrypted.iv,
      });
    }
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};

export const requestEntryDeletion = async (entry: SelectedEntry) => {
  try {
    if (entry.type === "directory") {
      const { deletedFiles } = await trpc().directory.delete.mutate({ id: entry.id });
      await Promise.all(
        deletedFiles.flatMap((fileId) => [
          deleteFileCache(fileId),
          deleteFileThumbnailCache(fileId),
        ]),
      );
    } else {
      await trpc().file.delete.mutate({ id: entry.id });
      await Promise.all([deleteFileCache(entry.id), deleteFileThumbnailCache(entry.id)]);
    }
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};
