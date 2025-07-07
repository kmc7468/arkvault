import { getContext, setContext } from "svelte";
import { callGetApi, callPostApi } from "$lib/hooks";
import { storeHmacSecrets } from "$lib/indexedDB";
import { generateDataKey, wrapDataKey, unwrapHmacSecret, encryptString } from "$lib/modules/crypto";
import {
  storeFileCache,
  deleteFileCache,
  storeFileThumbnailCache,
  deleteFileThumbnailCache,
  uploadFile,
} from "$lib/modules/file";
import type {
  DirectoryRenameRequest,
  DirectoryCreateRequest,
  FileRenameRequest,
  HmacSecretListResponse,
  DirectoryDeleteResponse,
} from "$lib/server/schemas";
import { hmacSecretStore, type MasterKey, type HmacSecret } from "$lib/stores";

export interface SelectedEntry {
  type: "directory" | "file";
  id: number;
  dataKey: CryptoKey;
  dataKeyVersion: Date;
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

  const res = await callGetApi("/api/hsk/list");
  if (!res.ok) return false;

  const { hsks: hmacSecretsWrapped }: HmacSecretListResponse = await res.json();
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

  const res = await callPostApi<DirectoryCreateRequest>("/api/directory/create", {
    parent: parentId,
    mekVersion: masterKey.version,
    dek: await wrapDataKey(dataKey, masterKey.key),
    dekVersion: dataKeyVersion.toISOString(),
    name: nameEncrypted.ciphertext,
    nameIv: nameEncrypted.iv,
  });
  return res.ok;
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
  const newNameEncrypted = await encryptString(newName, entry.dataKey);

  let res;
  if (entry.type === "directory") {
    res = await callPostApi<DirectoryRenameRequest>(`/api/directory/${entry.id}/rename`, {
      dekVersion: entry.dataKeyVersion.toISOString(),
      name: newNameEncrypted.ciphertext,
      nameIv: newNameEncrypted.iv,
    });
  } else {
    res = await callPostApi<FileRenameRequest>(`/api/file/${entry.id}/rename`, {
      dekVersion: entry.dataKeyVersion.toISOString(),
      name: newNameEncrypted.ciphertext,
      nameIv: newNameEncrypted.iv,
    });
  }
  return res.ok;
};

export const requestEntryDeletion = async (entry: SelectedEntry) => {
  const res = await callPostApi(`/api/${entry.type}/${entry.id}/delete`);
  if (!res.ok) return false;

  if (entry.type === "directory") {
    const { deletedFiles }: DirectoryDeleteResponse = await res.json();
    await Promise.all(
      deletedFiles.flatMap((fileId) => [deleteFileCache(fileId), deleteFileThumbnailCache(fileId)]),
    );
    return true;
  } else {
    await Promise.all([deleteFileCache(entry.id), deleteFileThumbnailCache(entry.id)]);
    return true;
  }
};
