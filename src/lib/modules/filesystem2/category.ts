import { useQueryClient, createQuery, createMutation } from "@tanstack/svelte-query";
import { callGetApi, callPostApi } from "$lib/hooks";
import {
  getCategoryInfos as getCategoryInfosFromIndexedDB,
  getCategoryInfo as getCategoryInfoFromIndexedDB,
  storeCategoryInfo,
  updateCategoryInfo,
  deleteCategoryInfo,
  type CategoryId,
} from "$lib/indexedDB";
import {
  generateDataKey,
  wrapDataKey,
  unwrapDataKey,
  encryptString,
  decryptString,
} from "$lib/modules/crypto";
import type {
  CategoryInfoResponse,
  CategoryFileListResponse,
  CategoryRenameRequest,
  CategoryCreateRequest,
  CategoryCreateResponse,
} from "$lib/server/schemas";
import type { MasterKey } from "$lib/stores";

export type CategoryInfo =
  | {
      id: "root";
      dataKey?: undefined;
      dataKeyVersion?: undefined;
      name?: undefined;
      subCategoryIds: number[];
      files?: undefined;
      isFileRecursive?: undefined;
    }
  | {
      id: number;
      dataKey?: CryptoKey;
      dataKeyVersion?: Date;
      name: string;
      subCategoryIds: number[];
      files: { id: number; isRecursive: boolean }[];
      isFileRecursive: boolean;
    };
export type SubCategoryInfo = CategoryInfo & { id: number };

let temporaryIdCounter = -1;

const getInitialCategoryInfo = async (id: CategoryId) => {
  const [category, subCategories] = await Promise.all([
    id !== "root" ? getCategoryInfoFromIndexedDB(id) : undefined,
    getCategoryInfosFromIndexedDB(id),
  ]);
  const subCategoryIds = subCategories.map(({ id }) => id);

  if (id === "root") {
    return { id, subCategoryIds };
  } else if (category) {
    return {
      id,
      name: category.name,
      subCategoryIds,
      files: category.files,
      isFileRecursive: category.isFileRecursive,
    };
  }
  return undefined;
};

export const getCategoryInfo = (id: CategoryId, masterKey: CryptoKey) => {
  return createQuery<CategoryInfo>({
    queryKey: ["category", id],
    queryFn: async ({ client, signal }) => {
      if (!client.getQueryData<CategoryInfo>(["category", id])) {
        const initialInfo = await getInitialCategoryInfo(id);
        if (initialInfo) {
          setTimeout(() => client.invalidateQueries({ queryKey: ["category", id] }), 0);
          return initialInfo;
        }
      }

      const res = await callGetApi(`/api/category/${id}`, { signal }); // TODO: 404
      const { metadata, subCategories }: CategoryInfoResponse = await res.json();

      if (id === "root") {
        return { id, subCategoryIds: subCategories };
      } else {
        const { dataKey } = await unwrapDataKey(metadata!.dek, masterKey);
        const name = await decryptString(metadata!.name, metadata!.nameIv, dataKey);

        const res = await callGetApi(`/api/category/${id}/file/list?recurse=true`); // TODO: Error Handling
        const { files }: CategoryFileListResponse = await res.json();
        const filesMapped = files.map(({ file, isRecursive }) => ({ id: file, isRecursive }));

        const prevInfo = client.getQueryData<CategoryInfo>(["category", id]);
        await storeCategoryInfo({
          id,
          parentId: metadata!.parent,
          name,
          files: filesMapped,
          isFileRecursive: prevInfo?.isFileRecursive ?? false,
        });
        return {
          id,
          dataKey,
          dataKeyVersion: new Date(metadata!.dekVersion),
          name,
          subCategoryIds: subCategories,
          files: filesMapped,
          isFileRecursive: prevInfo?.isFileRecursive ?? false,
        };
      }
    },
    staleTime: Infinity,
  });
};

export type CategoryInfoStore = ReturnType<typeof getCategoryInfo>;

export const useCategoryCreation = (parentId: CategoryId, masterKey: MasterKey) => {
  const queryClient = useQueryClient();
  return createMutation<void, Error, { name: string }, { tempId: number }>({
    mutationFn: async ({ name }) => {
      const { dataKey, dataKeyVersion } = await generateDataKey();
      const nameEncrypted = await encryptString(name, dataKey);

      const res = await callPostApi<CategoryCreateRequest>("/api/category/create", {
        parent: parentId,
        mekVersion: masterKey.version,
        dek: await wrapDataKey(dataKey, masterKey.key),
        dekVersion: dataKeyVersion.toISOString(),
        name: nameEncrypted.ciphertext,
        nameIv: nameEncrypted.iv,
      });
      if (!res.ok) throw new Error("Failed to create category");

      const { category: id }: CategoryCreateResponse = await res.json();
      queryClient.setQueryData<CategoryInfo>(["category", id], {
        id,
        name,
        dataKey,
        dataKeyVersion,
        subCategoryIds: [],
        files: [],
        isFileRecursive: false,
      });
      await storeCategoryInfo({ id, parentId, name, files: [], isFileRecursive: false });
    },
    onMutate: async ({ name }) => {
      const tempId = temporaryIdCounter--;
      queryClient.setQueryData<CategoryInfo>(["category", tempId], {
        id: tempId,
        name,
        subCategoryIds: [],
        files: [],
        isFileRecursive: false,
      });

      await queryClient.cancelQueries({ queryKey: ["category", parentId] });
      queryClient.setQueryData<CategoryInfo>(["category", parentId], (prevParentInfo) => {
        if (!prevParentInfo) return;
        return {
          ...prevParentInfo,
          subCategoryIds: [...prevParentInfo.subCategoryIds, tempId],
        };
      });

      return { tempId };
    },
    onError: (_error, _variables, context) => {
      if (context) {
        queryClient.setQueryData<CategoryInfo>(["category", parentId], (prevParentInfo) => {
          if (!prevParentInfo) return;
          return {
            ...prevParentInfo,
            subCategoryIds: prevParentInfo.subCategoryIds.filter((id) => id !== context.tempId),
          };
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["category", parentId] });
    },
  });
};

export const useCategoryRename = () => {
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
      const res = await callPostApi<CategoryRenameRequest>(`/api/category/${id}/rename`, {
        dekVersion: dataKeyVersion.toISOString(),
        name: newNameEncrypted.ciphertext,
        nameIv: newNameEncrypted.iv,
      });
      if (!res.ok) throw new Error("Failed to rename category");

      await updateCategoryInfo(id, { name: newName });
    },
    onMutate: async ({ id, newName }) => {
      await queryClient.cancelQueries({ queryKey: ["category", id] });

      const prevInfo = queryClient.getQueryData<SubCategoryInfo>(["category", id]);
      if (prevInfo) {
        queryClient.setQueryData<CategoryInfo>(["category", id], {
          ...prevInfo,
          name: newName,
        });
      }

      return { oldName: prevInfo?.name };
    },
    onError: (_error, { id }, context) => {
      if (context?.oldName) {
        queryClient.setQueryData<SubCategoryInfo>(["category", id], (prevInfo) => {
          if (!prevInfo) return;
          return { ...prevInfo, name: context.oldName! };
        });
      }
    },
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["category", id] });
    },
  });
};

export const useCategoryDeletion = (parentId: CategoryId) => {
  const queryClient = useQueryClient();
  return createMutation<void, Error, { id: number }, {}>({
    mutationFn: async ({ id }) => {
      const res = await callPostApi(`/api/category/${id}/delete`);
      if (!res.ok) throw new Error("Failed to delete category");

      await deleteCategoryInfo(id);

      // TODO: Update FileInfo
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["category", parentId] });
      queryClient.setQueryData<CategoryInfo>(["category", parentId], (prevParentInfo) => {
        if (!prevParentInfo) return;
        return {
          ...prevParentInfo,
          subCategoryIds: prevParentInfo.subCategoryIds.filter((categoryId) => categoryId !== id),
        };
      });
      return {};
    },
    onError: (_error, { id }, context) => {
      if (context) {
        queryClient.setQueryData<CategoryInfo>(["category", parentId], (prevParentInfo) => {
          if (!prevParentInfo) return;
          return {
            ...prevParentInfo,
            subCategoryIds: [...prevParentInfo.subCategoryIds, id],
          };
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["category", parentId] });
    },
  });
};

export const useCategoryFileRecursionToggle = () => {
  const queryClient = useQueryClient();
  return createMutation<void, Error, { id: number; isFileRecursive: boolean }, {}>({
    mutationFn: async ({ id, isFileRecursive }) => {
      await updateCategoryInfo(id, { isFileRecursive });
    },
    onMutate: async ({ id, isFileRecursive }) => {
      const prevInfo = queryClient.getQueryData<SubCategoryInfo>(["category", id]);
      if (prevInfo) {
        queryClient.setQueryData<CategoryInfo>(["category", id], {
          ...prevInfo,
          isFileRecursive,
        });
      }
    },
  });
};
