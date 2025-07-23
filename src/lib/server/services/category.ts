import { error } from "@sveltejs/kit";
import {
  registerCategory,
  getAllCategoriesByParent,
  getCategory,
  setCategoryEncName,
  unregisterCategory,
  type CategoryId,
  type NewCategory,
} from "$lib/server/db/category";
import { IntegrityError } from "$lib/server/db/error";
import {
  getAllFilesByCategory,
  getFile,
  addFileToCategory,
  removeFileFromCategory,
} from "$lib/server/db/file";
import type { Ciphertext } from "$lib/server/db/schema";

export const getCategoryInformation = async (userId: number, categoryId: CategoryId) => {
  const category = categoryId !== "root" ? await getCategory(userId, categoryId) : undefined;
  if (category === null) {
    error(404, "Invalid category id");
  }

  const categories = await getAllCategoriesByParent(userId, categoryId);
  return {
    metadata: category && {
      parentId: category.parentId ?? ("root" as const),
      mekVersion: category.mekVersion,
      encDek: category.encDek,
      dekVersion: category.dekVersion,
      encName: category.encName,
    },
    categories: categories.map(({ id }) => id),
  };
};

export const deleteCategory = async (userId: number, categoryId: number) => {
  try {
    await unregisterCategory(userId, categoryId);
  } catch (e) {
    if (e instanceof IntegrityError && e.message === "Category not found") {
      error(404, "Invalid category id");
    }
    throw e;
  }
};

export const addCategoryFile = async (userId: number, categoryId: number, fileId: number) => {
  const category = await getCategory(userId, categoryId);
  const file = await getFile(userId, fileId);
  if (!category) {
    error(404, "Invalid category id");
  } else if (!file) {
    error(404, "Invalid file id");
  }

  try {
    await addFileToCategory(fileId, categoryId);
  } catch (e) {
    if (e instanceof IntegrityError && e.message === "File already added to category") {
      error(400, "File already added");
    }
    throw e;
  }
};

export const getCategoryFiles = async (userId: number, categoryId: number, recurse: boolean) => {
  const category = await getCategory(userId, categoryId);
  if (!category) {
    error(404, "Invalid category id");
  }

  const files = await getAllFilesByCategory(userId, categoryId, recurse);
  return { files };
};

export const removeCategoryFile = async (userId: number, categoryId: number, fileId: number) => {
  const category = await getCategory(userId, categoryId);
  const file = await getFile(userId, fileId);
  if (!category) {
    error(404, "Invalid category id");
  } else if (!file) {
    error(404, "Invalid file id");
  }

  try {
    await removeFileFromCategory(fileId, categoryId);
  } catch (e) {
    if (e instanceof IntegrityError && e.message === "File not found in category") {
      error(400, "File not added");
    }
    throw e;
  }
};

export const renameCategory = async (
  userId: number,
  categoryId: number,
  dekVersion: Date,
  newEncName: Ciphertext,
) => {
  try {
    await setCategoryEncName(userId, categoryId, dekVersion, newEncName);
  } catch (e) {
    if (e instanceof IntegrityError) {
      if (e.message === "Category not found") {
        error(404, "Invalid category id");
      } else if (e.message === "Invalid DEK version") {
        error(400, "Invalid DEK version");
      }
    }
    throw e;
  }
};

export const createCategory = async (params: NewCategory) => {
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  const oneMinuteLater = new Date(Date.now() + 60 * 1000);
  if (params.dekVersion <= oneMinuteAgo || params.dekVersion >= oneMinuteLater) {
    error(400, "Invalid DEK version");
  }

  try {
    const { id } = await registerCategory(params);
    return { id };
  } catch (e) {
    if (e instanceof IntegrityError && e.message === "Inactive MEK version") {
      error(400, "Inactive MEK version");
    }
    throw e;
  }
};
