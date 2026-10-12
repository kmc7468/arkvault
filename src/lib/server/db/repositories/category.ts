import type { Selectable } from "kysely";
import type { Executor, Tx } from "../executor.ts";
import { decodeParentId, encodeParentId, parentIdOperator } from "../queries.ts";
import type { CategoryTable, Ciphertext } from "../schema/index.ts";

export interface Category {
  id: number;
  parentId: CategoryId;
  userId: number;
  mekVersion: number;
  encDek: string;
  dekVersion: Date;
  encName: Ciphertext;
}

export type NewCategory = Omit<Category, "id">;

// Timestamps are serialized as strings when the row is selected as JSON
type CategoryRow = Omit<Selectable<CategoryTable>, "data_encryption_key_version"> & {
  data_encryption_key_version: Date | string;
};

export const toCategory = (row: CategoryRow): Category => ({
  id: row.id,
  parentId: decodeParentId(row.parent_id),
  userId: row.user_id,
  mekVersion: row.master_encryption_key_version,
  encDek: row.encrypted_data_encryption_key,
  dekVersion: new Date(row.data_encryption_key_version),
  encName: row.encrypted_name,
});

export const createCategory = async (executor: Executor, params: NewCategory) => {
  const { id } = await executor
    .insertInto("category")
    .values({
      parent_id: encodeParentId(params.parentId),
      user_id: params.userId,
      master_encryption_key_version: params.mekVersion,
      encrypted_data_encryption_key: params.encDek,
      data_encryption_key_version: params.dekVersion,
      encrypted_name: params.encName,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { id };
};

export const getCategory = async (executor: Executor, userId: number, categoryId: number) => {
  const category = await executor
    .selectFrom("category")
    .selectAll()
    .where("id", "=", categoryId)
    .where("user_id", "=", userId)
    .limit(1)
    .executeTakeFirst();
  return category ? toCategory(category) : null;
};

// Locks the category in share mode so that it isn't deleted until the transaction ends. Returns
// whether it exists.
export const lockCategory = async (trx: Tx, userId: number, categoryId: number) => {
  const category = await trx
    .selectFrom("category")
    .select("id")
    .where("id", "=", categoryId)
    .where("user_id", "=", userId)
    .limit(1)
    .forShare()
    .executeTakeFirst();
  return !!category;
};

export const getAllCategoriesByParent = async (
  executor: Executor,
  userId: number,
  parentId: CategoryId,
) => {
  const categories = await executor
    .selectFrom("category")
    .selectAll()
    .where("user_id", "=", userId)
    .where("parent_id", parentIdOperator(parentId), encodeParentId(parentId))
    .execute();
  return categories.map(toCategory);
};

// Returns whether the name has been changed, which fails if the category doesn't exist or its DEK
// version differs
export const setCategoryEncName = async (
  executor: Executor,
  userId: number,
  categoryId: number,
  dekVersion: Date,
  encName: Ciphertext,
) => {
  const { numUpdatedRows } = await executor
    .updateTable("category")
    .set({ encrypted_name: encName })
    .where("id", "=", categoryId)
    .where("user_id", "=", userId)
    .where("data_encryption_key_version", "=", dekVersion)
    .executeTakeFirst();
  return numUpdatedRows > 0n;
};

// Subcategories are deleted together by the database. Returns whether the category existed.
export const deleteCategory = async (executor: Executor, userId: number, categoryId: number) => {
  const { numDeletedRows } = await executor
    .deleteFrom("category")
    .where("id", "=", categoryId)
    .where("user_id", "=", userId)
    .executeTakeFirst();
  return numDeletedRows > 0n;
};
