import {
  getDirectoryInfo,
  getFileInfo,
  isExistingFileInfo,
  isLocalDirectoryInfo,
  type FileInfo,
  type LocalCategoryInfo,
  type LocalDirectoryInfo,
} from "#lib/features/filesystem/index.ts";
import { trpc } from "#trpc/client.ts";

export interface SearchFilter {
  ancestorId: DirectoryId;
  inFavorites: boolean;
  categories: { info: LocalCategoryInfo; type: "include" | "exclude" }[];
}

export interface SearchResult {
  directories: LocalDirectoryInfo[];
  files: FileInfo[];
}

const getCategoryIds = (filter: SearchFilter, type: "include" | "exclude") => {
  return filter.categories.filter((category) => category.type === type).map(({ info }) => info.id);
};

export const search = async (filter: SearchFilter) => {
  const { directories: directoriesRaw, files: filesRaw } = await trpc.search.search.query({
    ancestor: filter.ancestorId,
    inFavorites: filter.inFavorites,
    includeCategories: getCategoryIds(filter, "include"),
    excludeCategories: getCategoryIds(filter, "exclude"),
  });
  const [directories, files] = await Promise.all([
    Promise.all(
      directoriesRaw.map((directory) =>
        getDirectoryInfo(directory.id, { serverResponse: directory }),
      ),
    ),
    Promise.all(filesRaw.map((file) => getFileInfo(file.id, { serverResponse: file }))),
  ]);
  return {
    directories: directories.filter(isLocalDirectoryInfo),
    files: files.filter(isExistingFileInfo),
  } satisfies SearchResult;
};
