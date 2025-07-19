import { useQueryClient, createQuery, createMutation } from "@tanstack/svelte-query";
import { callGetApi, callPostApi } from "$lib/hooks";
import {
  getFileInfo as getFileInfoFromIndexedDB,
  storeFileInfo,
  updateFileInfo,
  deleteFileInfo,
  type DirectoryId,
} from "$lib/indexedDB";
import { unwrapDataKey, encryptString, decryptString } from "$lib/modules/crypto";
import { uploadFile } from "$lib/modules/file";
import type { FileInfoResponse, FileRenameRequest } from "$lib/server/schemas";
import type { MasterKey, HmacSecret } from "$lib/stores";
import type { DirectoryInfo } from "./directory";

export interface FileInfo {
  id: number;
  dataKey?: CryptoKey;
  dataKeyVersion?: Date;
  contentType: string;
  contentIv?: string;
  name: string;
  createdAt?: Date;
  lastModifiedAt: Date;
  categoryIds: number[];
}

const decryptDate = async (ciphertext: string, iv: string, dataKey: CryptoKey) => {
  return new Date(parseInt(await decryptString(ciphertext, iv, dataKey), 10));
};

export const getFileInfo = (id: number, masterKey: CryptoKey) => {
  return createQuery<FileInfo>({
    queryKey: ["file", id],
    queryFn: async ({ client, signal }) => {
      if (!client.getQueryData(["file", id])) {
        const initialInfo = await getFileInfoFromIndexedDB(id);
        if (initialInfo) {
          setTimeout(() => client.invalidateQueries({ queryKey: ["file", id] }), 0);
          return initialInfo;
        }
      }

      const res = await callGetApi(`/api/file/${id}`, { signal }); // TODO: 404
      const metadata: FileInfoResponse = await res.json();

      const { dataKey } = await unwrapDataKey(metadata.dek, masterKey);
      const name = await decryptString(metadata.name, metadata.nameIv, dataKey);
      const createdAt =
        metadata.createdAt && metadata.createdAtIv
          ? await decryptDate(metadata.createdAt, metadata.createdAtIv, dataKey)
          : undefined;
      const lastModifiedAt = await decryptDate(
        metadata.lastModifiedAt,
        metadata.lastModifiedAtIv,
        dataKey,
      );

      await storeFileInfo({
        id,
        parentId: metadata.parent,
        name,
        contentType: metadata.contentType,
        createdAt,
        lastModifiedAt,
        categoryIds: metadata.categories,
      });
      return {
        id,
        dataKey,
        dataKeyVersion: new Date(metadata.dekVersion),
        contentType: metadata.contentType,
        contentIv: metadata.contentIv,
        name,
        createdAt,
        lastModifiedAt,
        categoryIds: metadata.categories,
      };
    },
    staleTime: Infinity,
  });
};

export type FileInfoStore = ReturnType<typeof getFileInfo>;

export const useFileUpload = (
  parentId: DirectoryId,
  masterKey: MasterKey,
  hmacSecret: HmacSecret,
) => {
  const queryClient = useQueryClient();
  return createMutation<
    { fileId: number; fileBuffer: ArrayBuffer; thumbnailBuffer?: ArrayBuffer },
    Error,
    { file: File; onDuplicate: () => Promise<boolean> },
    { tempId: number }
  >({
    mutationFn: async ({ file, onDuplicate }) => {
      const res = await uploadFile(file, parentId, hmacSecret, masterKey, onDuplicate);
      if (!res) throw new Error("Failed to upload file");

      queryClient.setQueryData<FileInfo>(["file", res.fileId], {
        id: res.fileId,
        dataKey: res.fileDataKey,
        dataKeyVersion: res.fileDataKeyVersion,
        contentType: res.fileType,
        contentIv: res.fileEncryptedIv,
        name: file.name,
        createdAt: res.fileCreatedAt,
        lastModifiedAt: new Date(file.lastModified),
        categoryIds: [],
      });
      await storeFileInfo({
        id: res.fileId,
        parentId,
        name: file.name,
        contentType: res.fileType,
        createdAt: res.fileCreatedAt,
        lastModifiedAt: new Date(file.lastModified),
        categoryIds: [],
      });
      return {
        fileId: res.fileId,
        fileBuffer: res.fileBuffer,
        thumbnailBuffer: res.thumbnailBuffer,
      };
    },
    onSuccess: async ({ fileId }) => {
      await queryClient.cancelQueries({ queryKey: ["directory", parentId] });
      queryClient.setQueryData<DirectoryInfo>(["directory", parentId], (prevParentInfo) => {
        if (!prevParentInfo) return undefined;
        return {
          ...prevParentInfo,
          fileIds: [...prevParentInfo.fileIds, fileId],
        };
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["directory", parentId] });
    },
  });
};

export const useFileRename = () => {
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
      const res = await callPostApi<FileRenameRequest>(`/api/file/${id}/rename`, {
        dekVersion: dataKeyVersion.toISOString(),
        name: newNameEncrypted.ciphertext,
        nameIv: newNameEncrypted.iv,
      });
      if (!res.ok) throw new Error("Failed to rename file");

      await updateFileInfo(id, { name: newName });
    },
    onMutate: async ({ id, newName }) => {
      await queryClient.cancelQueries({ queryKey: ["file", id] });

      const prevInfo = queryClient.getQueryData<FileInfo>(["file", id]);
      if (prevInfo) {
        queryClient.setQueryData<FileInfo>(["file", id], {
          ...prevInfo,
          name: newName,
        });
      }

      return { oldName: prevInfo?.name };
    },
    onError: (_error, { id }, context) => {
      if (context?.oldName) {
        queryClient.setQueryData<FileInfo>(["file", id], (prevInfo) => {
          if (!prevInfo) return undefined;
          return { ...prevInfo, name: context.oldName! };
        });
      }
    },
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["file", id] });
    },
  });
};

export const useFileDeletion = (parentId: DirectoryId) => {
  const queryClient = useQueryClient();
  return createMutation<void, Error, { id: number }, {}>({
    mutationFn: async ({ id }) => {
      const res = await callPostApi(`/api/file/${id}/delete`);
      if (!res.ok) throw new Error("Failed to delete file");

      await deleteFileInfo(id);
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["directory", parentId] });
      queryClient.setQueryData<DirectoryInfo>(["directory", parentId], (prevParentInfo) => {
        if (!prevParentInfo) return undefined;
        return {
          ...prevParentInfo,
          fileIds: prevParentInfo.fileIds.filter((fileId) => fileId !== id),
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
            fileIds: [...prevParentInfo.fileIds, id],
          };
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["directory", parentId] });
    },
  });
};
