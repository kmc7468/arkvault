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
  deleteFileInfo,
  type DirectoryId,
} from "$lib/indexedDB";
import {
  generateDataKey,
  wrapDataKey,
  unwrapDataKey,
  encryptString,
  decryptString,
} from "$lib/modules/crypto";
import type {
  DirectoryInfoResponse,
  DirectoryDeleteResponse,
  DirectoryRenameRequest,
  DirectoryCreateRequest,
  DirectoryCreateResponse,
} from "$lib/server/schemas";
import type { MasterKey } from "$lib/stores";

export type DirectoryInfo =
  | {
      id: "root";
      dataKey?: undefined;
      dataKeyVersion?: undefined;
      name?: undefined;
      subDirectoryIds: number[];
      fileIds: number[];
    }
  | {
      id: number;
      dataKey?: CryptoKey;
      dataKeyVersion?: Date;
      name: string;
      subDirectoryIds: number[];
      fileIds: number[];
    };

const initializedIds = new Set<DirectoryId>();
let temporaryIdCounter = -1;

const getInitialDirectoryInfo = async (id: DirectoryId) => {
  if (!browser || initializedIds.has(id)) {
    return undefined;
  } else {
    initializedIds.add(id);
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

export const useDirectoryCreation = (parentId: DirectoryId, masterKey: MasterKey) => {
  const queryClient = useQueryClient();
  return createMutation<void, Error, { name: string }, { tempId: number }>({
    mutationFn: async ({ name }) => {
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
      if (!res.ok) throw new Error("Failed to create directory");

      const { directory: id }: DirectoryCreateResponse = await res.json();
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
    onMutate: async ({ name }) => {
      const tempId = temporaryIdCounter--;
      queryClient.setQueryData<DirectoryInfo>(["directory", tempId], {
        id: tempId,
        name,
        subDirectoryIds: [],
        fileIds: [],
      });

      await queryClient.cancelQueries({ queryKey: ["directory", parentId] });
      queryClient.setQueryData<DirectoryInfo>(["directory", parentId], (prevParentInfo) => {
        if (!prevParentInfo) return undefined;
        return {
          ...prevParentInfo,
          subDirectoryIds: [...prevParentInfo.subDirectoryIds, tempId],
        };
      });

      return { tempId };
    },
    onError: (_error, _variables, context) => {
      if (context) {
        queryClient.setQueryData<DirectoryInfo>(["directory", parentId], (prevParentInfo) => {
          if (!prevParentInfo) return undefined;
          return {
            ...prevParentInfo,
            subDirectoryIds: prevParentInfo.subDirectoryIds.filter((id) => id !== context.tempId),
          };
        });
      }
    },
    onSettled: () => {
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
    { oldName: string | undefined }
  >({
    mutationFn: async ({ id, dataKey, dataKeyVersion, newName }) => {
      const newNameEncrypted = await encryptString(newName, dataKey);
      const res = await callPostApi<DirectoryRenameRequest>(`/api/directory/${id}/rename`, {
        dekVersion: dataKeyVersion.toISOString(),
        name: newNameEncrypted.ciphertext,
        nameIv: newNameEncrypted.iv,
      });
      if (!res.ok) throw new Error("Failed to rename directory");

      await updateDirectoryInfo(id, { name: newName });
    },
    onMutate: async ({ id, newName }) => {
      await queryClient.cancelQueries({ queryKey: ["directory", id] });

      const prevInfo = queryClient.getQueryData<DirectoryInfo & { id: number }>(["directory", id]);
      if (prevInfo) {
        queryClient.setQueryData<DirectoryInfo>(["directory", id], {
          ...prevInfo,
          name: newName,
        });
      }

      return { oldName: prevInfo?.name };
    },
    onError: (_error, { id }, context) => {
      if (context?.oldName) {
        queryClient.setQueryData<DirectoryInfo & { id: number }>(["directory", id], (prevInfo) => {
          if (!prevInfo) return undefined;
          return { ...prevInfo, name: context.oldName! };
        });
      }
    },
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["directory", id] });
    },
  });
};

export const useDirectoryDeletion = (parentId: DirectoryId) => {
  const queryClient = useQueryClient();
  return createMutation<{ deletedFiles: number[] }, Error, { id: number }, {}>({
    mutationFn: async ({ id }) => {
      const res = await callPostApi(`/api/directory/${id}/delete`);
      if (!res.ok) throw new Error("Failed to delete directory");

      const { deletedDirectories, deletedFiles }: DirectoryDeleteResponse = await res.json();
      await Promise.all([
        ...deletedDirectories.map(deleteDirectoryInfo),
        ...deletedFiles.map(deleteFileInfo),
      ]);

      return { deletedFiles };
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["directory", parentId] });
      queryClient.setQueryData<DirectoryInfo>(["directory", parentId], (prevParentInfo) => {
        if (!prevParentInfo) return undefined;
        return {
          ...prevParentInfo,
          subDirectoryIds: prevParentInfo.subDirectoryIds.filter(
            (subDirectoryId) => subDirectoryId !== id,
          ),
        };
      });
      return {};
    },
    onError: (_error, { id }, context) => {
      if (context) {
        queryClient.setQueryData<DirectoryInfo>(["directory", parentId], (prevParentInfo) => {
          if (!prevParentInfo) return undefined;
          return {
            ...prevParentInfo,
            subDirectoryIds: [...prevParentInfo.subDirectoryIds, id],
          };
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["directory", parentId] });
    },
  });
};
