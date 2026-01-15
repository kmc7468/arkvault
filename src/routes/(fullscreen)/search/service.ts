import {
  decryptDirectoryMetadata,
  decryptFileMetadata,
  getDirectoryInfo,
  getFileInfo,
  type LocalDirectoryInfo,
  type FileInfo,
  type LocalCategoryInfo,
} from "$lib/modules/filesystem";
import { HybridPromise } from "$lib/utils";
import { trpc } from "$trpc/client";

export interface SearchFilter {
  ancestorId: DirectoryId;
  categories: { info: LocalCategoryInfo; type: "include" | "exclude" }[];
}

export interface SearchResult {
  directories: LocalDirectoryInfo[];
  files: FileInfo[];
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

  const [directories, files] = await HybridPromise.all([
    HybridPromise.all(
      directoriesRaw.map((directory) =>
        HybridPromise.resolve(
          getDirectoryInfo(directory.id, masterKey, {
            async fetchFromServer(id, cachedInfo, masterKey) {
              const metadata = await decryptDirectoryMetadata(directory, masterKey);
              return {
                subDirectories: [],
                files: [],
                ...cachedInfo,
                id: id as number,
                exists: true,
                parentId: directory.parent,
                ...metadata,
              };
            },
          }),
        ),
      ),
    ),
    HybridPromise.all(
      filesRaw.map((file) =>
        HybridPromise.resolve(
          getFileInfo(file.id, masterKey, {
            async fetchFromServer(id, cachedInfo, masterKey) {
              const metadata = await decryptFileMetadata(file, masterKey);
              return {
                categories: [],
                ...cachedInfo,
                id: id as number,
                exists: true,
                parentId: file.parent,
                contentType: file.contentType,
                ...metadata,
              };
            },
          }),
        ),
      ),
    ),
  ]);
  return { directories, files } as SearchResult;
};
