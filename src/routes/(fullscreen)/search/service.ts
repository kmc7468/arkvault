import type { DataKey, LocalCategoryInfo } from "$lib/modules/filesystem";
import {
  decryptDirectoryMetadata,
  decryptFileMetadata,
} from "$lib/modules/filesystem/internal.svelte";
import { trpc } from "$trpc/client";

export interface SearchFilter {
  ancestorId: DirectoryId;
  categories: { info: LocalCategoryInfo; type: "include" | "exclude" }[];
}

interface SearchedDirectory {
  type: "directory";
  id: number;
  parentId: DirectoryId;
  dataKey?: DataKey;
  name: string;
}

interface SearchedFile {
  type: "file";
  id: number;
  parentId: DirectoryId;
  dataKey?: DataKey;
  contentType: string;
  name: string;
  createdAt?: Date;
  lastModifiedAt: Date;
}

export interface SearchResult {
  directories: SearchedDirectory[];
  files: SearchedFile[];
}

export const requestSearch = async (filter: SearchFilter, masterKey: CryptoKey) => {
  const { directories: directoriesRaw, files: filesRaw } = await trpc().search.search.query({
    ancestor: filter.ancestorId,
    includeCategories: filter.categories
      .filter(({ type }) => type === "include")
      .map(({ info }) => info.id),
    excludeCategories: filter.categories
      .filter(({ type }) => type === "exclude")
      .map(({ info }) => info.id),
  });

  // TODO: FIXME
  const [directories, files] = await Promise.all([
    Promise.all(
      directoriesRaw.map(async (dir) => {
        const metadata = await decryptDirectoryMetadata(
          { dek: dir.dek, dekVersion: dir.dekVersion, name: dir.name, nameIv: dir.nameIv },
          masterKey,
        );
        return {
          type: "directory" as const,
          id: dir.id,
          parentId: dir.parent,
          dataKey: metadata.dataKey,
          name: metadata.name,
        };
      }),
    ),
    Promise.all(
      filesRaw.map(async (file) => {
        const metadata = await decryptFileMetadata(
          {
            dek: file.dek,
            dekVersion: file.dekVersion,
            name: file.name,
            nameIv: file.nameIv,
            createdAt: file.createdAt,
            createdAtIv: file.createdAtIv,
            lastModifiedAt: file.lastModifiedAt,
            lastModifiedAtIv: file.lastModifiedAtIv,
          },
          masterKey,
        );
        return {
          type: "file" as const,
          id: file.id,
          parentId: file.parent,
          dataKey: metadata.dataKey,
          contentType: file.contentType,
          name: metadata.name,
          createdAt: metadata.createdAt,
          lastModifiedAt: metadata.lastModifiedAt,
        };
      }),
    ),
  ]);

  return { directories, files } satisfies SearchResult;
};
