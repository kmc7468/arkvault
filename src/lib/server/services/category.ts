import { CategoryRepo, FileRepo } from "#lib/server/db/index.js";
import type { Ciphertext } from "#lib/server/db/schema/index.js";
import { AppError } from "#lib/server/errors.js";
import { ensureFreshDekVersion } from "./common";

export const getCategory = async (userId: number, categoryId: CategoryId, recurse: boolean) => {
  const category =
    categoryId !== "root" ? await CategoryRepo.getCategory(userId, categoryId) : undefined;
  if (category === null) {
    throw new AppError("NOT_FOUND", "Category not found");
  }

  const [subCategories, files] = await Promise.all([
    CategoryRepo.getAllCategoriesByParent(userId, categoryId),
    categoryId !== "root" ? FileRepo.getAllFilesByCategory(userId, categoryId, recurse) : undefined,
  ]);
  return { category, subCategories, files };
};

export const createCategory = async (params: CategoryRepo.NewCategory) => {
  ensureFreshDekVersion(params.dekVersion);
  await CategoryRepo.registerCategory(params);
};

export const renameCategory = async (
  userId: number,
  categoryId: number,
  dekVersion: Date,
  encName: Ciphertext,
) => {
  await CategoryRepo.setCategoryEncName(userId, categoryId, dekVersion, encName);
};

export const deleteCategory = async (userId: number, categoryId: number) => {
  await CategoryRepo.unregisterCategory(userId, categoryId);
};

const ensureCategoryAndFileExist = async (userId: number, categoryId: number, fileId: number) => {
  const [category, file] = await Promise.all([
    CategoryRepo.getCategory(userId, categoryId),
    FileRepo.getFile(userId, fileId),
  ]);
  if (!category) {
    throw new AppError("NOT_FOUND", "Category not found");
  } else if (!file) {
    throw new AppError("NOT_FOUND", "File not found");
  }
};

export const addFileToCategory = async (userId: number, categoryId: number, fileId: number) => {
  await ensureCategoryAndFileExist(userId, categoryId, fileId);
  await FileRepo.addFileToCategory(fileId, categoryId);
};

export const removeFileFromCategory = async (
  userId: number,
  categoryId: number,
  fileId: number,
) => {
  await ensureCategoryAndFileExist(userId, categoryId, fileId);
  await FileRepo.removeFileFromCategory(fileId, categoryId);
};
