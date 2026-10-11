import { DirectoryRepo, FileRepo } from "#lib/server/db/index.ts";

export const search = async (
  userId: number,
  filters: {
    ancestorId: DirectoryId;
    inFavorites: boolean;
    includeCategoryIds: number[];
    excludeCategoryIds: number[];
  },
) => {
  // Directories can't belong to categories
  const hasCategoryFilter =
    filters.includeCategoryIds.length > 0 || filters.excludeCategoryIds.length > 0;

  const [directories, files] = await Promise.all([
    !hasCategoryFilter
      ? DirectoryRepo.searchDirectories(userId, {
          parentId: filters.ancestorId,
          inFavorites: filters.inFavorites,
        })
      : [],
    FileRepo.searchFiles(userId, {
      parentId: filters.ancestorId,
      inFavorites: filters.inFavorites,
      includeCategoryIds: filters.includeCategoryIds,
      excludeCategoryIds: filters.excludeCategoryIds,
    }),
  ]);
  return { directories, files };
};
