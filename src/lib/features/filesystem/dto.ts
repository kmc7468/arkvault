import type { RouterOutputs } from "#trpc/router.server.ts";
import {
  decryptCategoryMetadata,
  decryptDirectoryMetadata,
  decryptFileMetadata,
} from "./metadata.ts";
import type { FileInfo, SubCategoryInfo, SubDirectoryInfo, SummarizedFileInfo } from "./types.ts";

// Shapes of filesystem entries returned by the server
export type DirectoryDto = RouterOutputs["directory"]["get"]["subDirectories"][number];
export type FileDto = RouterOutputs["directory"]["get"]["files"][number];
export type CategoryDto = RouterOutputs["category"]["get"]["subCategories"][number];
export type FileWithCategoriesDto = RouterOutputs["file"]["get"];

export const toDirectoryInfo = async (directory: DirectoryDto): Promise<SubDirectoryInfo> => ({
  id: directory.id,
  parentId: directory.parent,
  isFavorite: directory.isFavorite,
  ...(await decryptDirectoryMetadata(directory)),
});

export const toFileInfo = async (file: FileDto): Promise<SummarizedFileInfo> => ({
  id: file.id,
  isLegacy: file.isLegacy,
  parentId: file.parent,
  contentType: file.contentType,
  isFavorite: file.isFavorite,
  ...(await decryptFileMetadata(file)),
});

export const toCategoryInfo = async (category: CategoryDto): Promise<SubCategoryInfo> => ({
  id: category.id,
  parentId: category.parent,
  ...(await decryptCategoryMetadata(category)),
});

export const toFileWithCategoriesInfo = async ({
  categories,
  ...file
}: FileWithCategoriesDto): Promise<FileInfo> => {
  const [fileInfo, categoryInfos] = await Promise.all([
    toFileInfo(file),
    Promise.all(categories.map(toCategoryInfo)),
  ]);
  return { ...fileInfo, categories: categoryInfos };
};
