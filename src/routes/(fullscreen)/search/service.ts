import {
  getDirectoryInfo,
  getFileInfo,
  type LocalDirectoryInfo,
  type FileInfo,
  type LocalCategoryInfo,
} from "#lib/modules/filesystem/index.js";
import { HybridPromise } from "#lib/utils/index.js";
import { trpc } from "#trpc/client.js";

export interface SearchFilter {
  ancestorId: DirectoryId;
  inFavorites: boolean;
  categories: { info: LocalCategoryInfo; type: "include" | "exclude" }[];
}

export interface SearchResult {
  directories: LocalDirectoryInfo[];
  files: FileInfo[];
}

export const requestSearch = async (filter: SearchFilter) => {
  const { directories: directoriesRaw, files: filesRaw } = await trpc.search.search.query({
    ancestor: filter.ancestorId,
    inFavorites: filter.inFavorites,
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
        getDirectoryInfo(directory.id, { serverResponse: directory }),
      ),
    ),
    HybridPromise.all(filesRaw.map((file) => getFileInfo(file.id, { serverResponse: file }))),
  ]);
  return { directories, files } as SearchResult;
};
