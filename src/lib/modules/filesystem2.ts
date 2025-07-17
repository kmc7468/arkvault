import { useQueryClient, createQuery, createMutation } from "@tanstack/svelte-query";
import { browser } from "$app/environment";
import { callGetApi, callPostApi } from "$lib/hooks";
import {
  getDirectoryInfos as getDirectoryInfosFromIndexedDB,
  getDirectoryInfo as getDirectoryInfoFromIndexedDB,
  storeDirectoryInfo,
  updateDirectoryInfo,
  deleteDirectoryInfo,
  getFileInfos as getFileInfosFromIndexedDB,
  getFileInfo as getFileInfoFromIndexedDB,
  storeFileInfo,
  deleteFileInfo,
  getCategoryInfos as getCategoryInfosFromIndexedDB,
  getCategoryInfo as getCategoryInfoFromIndexedDB,
  storeCategoryInfo,
  updateCategoryInfo as updateCategoryInfoInIndexedDB,
  deleteCategoryInfo,
  type DirectoryId,
  type CategoryId,
} from "$lib/indexedDB";
import {
  generateDataKey,
  wrapDataKey,
  unwrapDataKey,
  encryptString,
  decryptString,
} from "$lib/modules/crypto";
import type { DirectoryInfo } from "$lib/modules/filesystem";
import type {
  DirectoryCreateRequest,
  DirectoryCreateResponse,
  DirectoryInfoResponse,
  DirectoryRenameRequest,
} from "$lib/server/schemas";
import type { MasterKey } from "$lib/stores";

const initializedDirectoryIds = new Set<DirectoryId>();
let temporaryIdCounter = -1;

const getInitialDirectoryInfo = async (id: DirectoryId) => {
  if (!browser || initializedDirectoryIds.has(id)) {
    return undefined;
  } else {
    initializedDirectoryIds.add(id);
  }

  const [directory, subDirectories, files] = await Promise.all([
    id !== "root" ? getDirectoryInfoFromIndexedDB(id) : undefined,
    getDirectoryInfosFromIndexedDB(id),
    getFileInfosFromIndexedDB(id),
  ]);
  const subDirectoryIds = subDirectories.map(({ id }) => id);
  const fileIds = files.map(({ id }) => id);

  if (id === "root") {
    return { id, subDirectoryIds, fileIds };
  } else if (directory) {
    return { id, name: directory.name, subDirectoryIds, fileIds };
  }
  return undefined;
};

export const getDirectoryInfo = (id: DirectoryId, masterKey: CryptoKey) => {
  const queryClient = useQueryClient();
  getInitialDirectoryInfo(id).then((info) => {
    if (info && !queryClient.getQueryData(["directory", id])) {
      queryClient.setQueryData<DirectoryInfo>(["directory", id], info);
    }
  }); // Intended
  return createQuery<DirectoryInfo>({
    queryKey: ["directory", id],
    queryFn: async () => {
      const res = await callGetApi(`/api/directory/${id}`); // TODO: 404
      const {
        metadata,
        subDirectories: subDirectoryIds,
        files: fileIds,
      }: DirectoryInfoResponse = await res.json();

      if (id === "root") {
        return { id, subDirectoryIds, fileIds };
      } else {
        const { dataKey } = await unwrapDataKey(metadata!.dek, masterKey);
        const name = await decryptString(metadata!.name, metadata!.nameIv, dataKey);
        await storeDirectoryInfo({ id, parentId: metadata!.parent, name });
        return {
          id,
          dataKey,
          dataKeyVersion: new Date(metadata!.dekVersion),
          name,
          subDirectoryIds,
          fileIds,
        };
      }
    },
  });
};

export type DirectoryInfoStore = ReturnType<typeof getDirectoryInfo>;

export const useDirectoryCreate = (parentId: DirectoryId) => {
  const queryClient = useQueryClient();
  return createMutation<
    { id: number; dataKey: CryptoKey; dataKeyVersion: Date },
    Error,
    { name: string; masterKey: MasterKey },
    { prevParentInfo: DirectoryInfo | undefined; tempId: number }
  >({
    mutationFn: async ({ name, masterKey }) => {
      const { dataKey, dataKeyVersion } = await generateDataKey();
      const nameEncrypted = await encryptString(name, dataKey);

      const res = await callPostApi<DirectoryCreateRequest>(`/api/directory/create`, {
        parent: parentId,
        mekVersion: masterKey.version,
        dek: await wrapDataKey(dataKey, masterKey.key),
        dekVersion: dataKeyVersion.toISOString(),
        name: nameEncrypted.ciphertext,
        nameIv: nameEncrypted.iv,
      });
      const { directory: id }: DirectoryCreateResponse = await res.json();
      return { id, dataKey, dataKeyVersion };
    },
    onMutate: async ({ name }) => {
      await queryClient.cancelQueries({ queryKey: ["directory", parentId] });

      const prevParentInfo = queryClient.getQueryData<DirectoryInfo>(["directory", parentId]);
      const tempId = temporaryIdCounter--;
      if (prevParentInfo) {
        queryClient.setQueryData<DirectoryInfo>(["directory", parentId], {
          ...prevParentInfo,
          subDirectoryIds: [...prevParentInfo.subDirectoryIds, tempId],
        });
        queryClient.setQueryData<DirectoryInfo>(["directory", tempId], {
          id: tempId,
          name,
          subDirectoryIds: [],
          fileIds: [],
        });
      }

      return { prevParentInfo, tempId };
    },
    onSuccess: async ({ id, dataKey, dataKeyVersion }, { name }) => {
      queryClient.setQueryData<DirectoryInfo>(["directory", id], {
        id,
        name,
        dataKey,
        dataKeyVersion,
        subDirectoryIds: [],
        fileIds: [],
      });
      await storeDirectoryInfo({ id, parentId, name });
    },
    onError: (error, { name }, context) => {
      if (context?.prevParentInfo) {
        queryClient.setQueryData<DirectoryInfo>(["directory", parentId], context.prevParentInfo);
      }
      console.error(`Failed to create directory "${name}" in parent ${parentId}:`, error);
    },
    onSettled: (id) => {
      queryClient.invalidateQueries({ queryKey: ["directory", parentId] });
    },
  });
};

export const useDirectoryRename = () => {
  const queryClient = useQueryClient();
  return createMutation<
    void,
    Error,
    {
      id: number;
      dataKey: CryptoKey;
      dataKeyVersion: Date;
      newName: string;
    },
    { prevInfo: (DirectoryInfo & { id: number }) | undefined }
  >({
    mutationFn: async ({ id, dataKey, dataKeyVersion, newName }) => {
      const newNameEncrypted = await encryptString(newName, dataKey);
      await callPostApi<DirectoryRenameRequest>(`/api/directory/${id}/rename`, {
        dekVersion: dataKeyVersion.toISOString(),
        name: newNameEncrypted.ciphertext,
        nameIv: newNameEncrypted.iv,
      });
    },
    onMutate: async ({ id, newName }) => {
      await queryClient.cancelQueries({ queryKey: ["directory", id] });

      const prevInfo = queryClient.getQueryData<DirectoryInfo & { id: number }>(["directory", id]);
      if (prevInfo) {
        queryClient.setQueryData<DirectoryInfo>(["directory", id], {
          ...prevInfo,
          name: newName,
        });
        await updateDirectoryInfo(id, { name: newName });
      }

      return { prevInfo };
    },
    onSuccess: async (data, { id, newName }) => {
      await updateDirectoryInfo(id, { name: newName });
    },
    onError: (error, { id }, context) => {
      if (context?.prevInfo) {
        queryClient.setQueryData<DirectoryInfo>(["directory", id], context.prevInfo);
      }
      console.error("Failed to rename directory:", error);
    },
    onSettled: (data, error, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["directory", id] });
    },
  });
};

export const useDirectoryDelete = (parentId: DirectoryId) => {
  const queryClient = useQueryClient();
  return createMutation<
    void,
    Error,
    { id: number },
    { prevInfo: (DirectoryInfo & { id: number }) | undefined }
  >({
    mutationFn: async ({ id }) => {
      await callPostApi(`/api/directory/${id}/delete`);
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["directory", parentId] });

      const prevParentInfo = queryClient.getQueryData<DirectoryInfo>(["directory", parentId]);
      if (prevParentInfo) {
        queryClient.setQueryData<DirectoryInfo>(["directory", parentId], {
          ...prevParentInfo,
          subDirectoryIds: prevParentInfo.subDirectoryIds.filter((subId) => subId !== id),
        });
      }

      const prevInfo = queryClient.getQueryData<DirectoryInfo & { id: number }>(["directory", id]);
      return { prevInfo };
    },
    onSuccess: async (data, { id }) => {
      await deleteDirectoryInfo(id);
    },
    onError: (error, { id }, context) => {
      if (context?.prevInfo) {
        queryClient.setQueryData<DirectoryInfo>(["directory", parentId], context?.prevInfo);
      }
      console.error("Failed to delete directory:", error);
    },
    onSettled: (data, error, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["directory", parentId] });
    },
  });
};
