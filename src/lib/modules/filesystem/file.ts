import * as IndexedDB from "$lib/indexedDB";
import { monotonicResolve } from "$lib/utils";
import { trpc, isTRPCClientError } from "$trpc/client";
import { FilesystemCache, decryptFileMetadata, decryptCategoryMetadata } from "./internal.svelte";
import type { MaybeFileInfo } from "./types";

const cache = new FilesystemCache<number, MaybeFileInfo>();

const fetchFromIndexedDB = async (id: number) => {
  const file = await IndexedDB.getFileInfo(id);
  const categories = file
    ? await Promise.all(
        file.categoryIds.map(async (categoryId) => {
          const category = await IndexedDB.getCategoryInfo(categoryId);
          return category ? { id: category.id, name: category.name } : undefined;
        }),
      )
    : undefined;

  if (file) {
    return {
      id,
      exists: true as const,
      parentId: file.parentId,
      contentType: file.contentType,
      name: file.name,
      createdAt: file.createdAt,
      lastModifiedAt: file.lastModifiedAt,
      categories: categories!.filter((category) => !!category),
    };
  }
};

const bulkFetchFromIndexedDB = async (ids: number[]) => {
  const files = await IndexedDB.bulkGetFileInfos(ids);
  const categories = await Promise.all(
    files.map(async (file) =>
      file
        ? await Promise.all(
            file.categoryIds.map(async (categoryId) => {
              const category = await IndexedDB.getCategoryInfo(categoryId);
              return category ? { id: category.id, name: category.name } : undefined;
            }),
          )
        : undefined,
    ),
  );
  return new Map(
    files
      .map((file, index) =>
        file
          ? ([
              file.id,
              {
                ...file,
                exists: true,
                categories: categories[index]!.filter((category) => !!category),
              },
            ] as const)
          : undefined,
      )
      .filter((file) => !!file),
  );
};

const fetchFromServer = async (id: number, masterKey: CryptoKey) => {
  try {
    const { categories: categoriesRaw, ...metadata } = await trpc().file.get.query({ id });
    const [categories] = await Promise.all([
      Promise.all(
        categoriesRaw.map(async (category) => ({
          id: category.id,
          ...(await decryptCategoryMetadata(category, masterKey)),
        })),
      ),
    ]);

    return {
      id,
      exists: true as const,
      parentId: metadata.parent,
      contentType: metadata.contentType,
      contentIv: metadata.contentIv,
      categories,
      ...(await decryptFileMetadata(metadata, masterKey)),
    };
  } catch (e) {
    if (isTRPCClientError(e) && e.data?.code === "NOT_FOUND") {
      await IndexedDB.deleteFileInfo(id);
      return { id, exists: false as const };
    }
    throw e;
  }
};

const bulkFetchFromServer = async (ids: number[], masterKey: CryptoKey) => {
  const filesRaw = await trpc().file.bulkGet.query({ ids });
  const files = await Promise.all(
    filesRaw.map(async (file) => {
      const categories = await Promise.all(
        file.categories.map(async (category) => ({
          id: category.id,
          ...(await decryptCategoryMetadata(category, masterKey)),
        })),
      );
      return {
        id: file.id,
        exists: true as const,
        parentId: file.parent,
        contentType: file.contentType,
        contentIv: file.contentIv,
        categories,
        ...(await decryptFileMetadata(file, masterKey)),
      };
    }),
  );

  const existingIds = new Set(filesRaw.map(({ id }) => id));
  return new Map<number, MaybeFileInfo>([
    ...files.map((file) => [file.id, file] as const),
    ...ids.filter((id) => !existingIds.has(id)).map((id) => [id, { id, exists: false }] as const),
  ]);
};

export const getFileInfo = async (id: number, masterKey: CryptoKey) => {
  return await cache.get(id, (isInitial, resolve) =>
    monotonicResolve(
      [isInitial && fetchFromIndexedDB(id), fetchFromServer(id, masterKey)],
      resolve,
    ),
  );
};

export const bulkGetFileInfo = async (ids: number[], masterKey: CryptoKey) => {
  return await cache.bulkGet(new Set(ids), (keys, resolve) =>
    monotonicResolve(
      [
        bulkFetchFromIndexedDB(
          Array.from(
            keys
              .entries()
              .filter(([, isInitial]) => isInitial)
              .map(([key]) => key),
          ),
        ),
        bulkFetchFromServer(Array.from(keys.keys()), masterKey),
      ],
      resolve,
    ),
  );
};
