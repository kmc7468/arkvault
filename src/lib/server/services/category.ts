import {
  CategoryRepo,
  FileRepo,
  LogRepo,
  db,
  isUniqueViolation,
  transaction,
  type Tx,
} from "#lib/server/db/index.ts";
import type { Ciphertext } from "#lib/server/db/schema/index.ts";
import { AppError } from "#lib/server/errors.ts";
import {
  dekVersionMismatchOrNotFound,
  ensureActiveMekVersion,
  ensureFreshDekVersion,
} from "./common.ts";

const categoryNotFoundError = () => new AppError("NOT_FOUND", "Category not found");

export const getCategory = async (userId: number, categoryId: CategoryId, recurse: boolean) => {
  const category =
    categoryId !== "root" ? await CategoryRepo.getCategory(db, userId, categoryId) : undefined;
  if (category === null) {
    throw categoryNotFoundError();
  }

  const [subCategories, files] = await Promise.all([
    CategoryRepo.getAllCategoriesByParent(db, userId, categoryId),
    categoryId !== "root"
      ? FileRepo.getAllFilesByCategory(db, userId, categoryId, recurse)
      : undefined,
  ]);
  return { category, subCategories, files };
};

export const createCategory = async (params: CategoryRepo.NewCategory) => {
  ensureFreshDekVersion(params.dekVersion);

  await transaction(async (trx) => {
    await ensureActiveMekVersion(trx, params.userId, params.mekVersion);
    if (
      params.parentId !== "root" &&
      !(await CategoryRepo.lockCategory(trx, params.userId, params.parentId))
    ) {
      throw categoryNotFoundError();
    }

    const { id } = await CategoryRepo.createCategory(trx, params);
    await LogRepo.appendCategoryLog(trx, {
      category_id: id,
      action: "create",
      new_name: params.encName,
    });
  });
};

export const renameCategory = async (
  userId: number,
  categoryId: number,
  dekVersion: Date,
  encName: Ciphertext,
) => {
  await transaction(async (trx) => {
    if (!(await CategoryRepo.setCategoryEncName(trx, userId, categoryId, dekVersion, encName))) {
      throw await dekVersionMismatchOrNotFound(
        CategoryRepo.getCategory(trx, userId, categoryId),
        "Category not found",
      );
    }

    await LogRepo.appendCategoryLog(trx, {
      category_id: categoryId,
      action: "rename",
      new_name: encName,
    });
  });
};

export const deleteCategory = async (userId: number, categoryId: number) => {
  if (!(await CategoryRepo.deleteCategory(db, userId, categoryId))) {
    throw categoryNotFoundError();
  }
};

// Locks the category and the file so that they aren't deleted until the transaction ends
const lockCategoryAndFile = async (trx: Tx, userId: number, categoryId: number, fileId: number) => {
  if (!(await CategoryRepo.lockCategory(trx, userId, categoryId))) {
    throw categoryNotFoundError();
  } else if (!(await FileRepo.lockFile(trx, userId, fileId))) {
    throw new AppError("NOT_FOUND", "File not found");
  }
};

export const addFileToCategory = async (userId: number, categoryId: number, fileId: number) => {
  try {
    await transaction(async (trx) => {
      await lockCategoryAndFile(trx, userId, categoryId, fileId);
      await FileRepo.addFileToCategory(trx, fileId, categoryId);
      await LogRepo.appendFileLog(trx, {
        file_id: fileId,
        action: "add-to-category",
        category_id: categoryId,
      });
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new AppError("BAD_REQUEST", "File already added to category");
    }
    throw e;
  }
};

export const removeFileFromCategory = async (
  userId: number,
  categoryId: number,
  fileId: number,
) => {
  await transaction(async (trx) => {
    await lockCategoryAndFile(trx, userId, categoryId, fileId);
    if (!(await FileRepo.removeFileFromCategory(trx, fileId, categoryId))) {
      throw new AppError("BAD_REQUEST", "File not found in category");
    }

    await LogRepo.appendFileLog(trx, {
      file_id: fileId,
      action: "remove-from-category",
      category_id: categoryId,
    });
  });
};
