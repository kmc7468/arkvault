import { IntegrityError } from "./error";
import db from "./kysely";
import type { Ciphertext } from "./schema";

interface Category {
  id: number;
  parentId: CategoryId;
  userId: number;
  mekVersion: number;
  encDek: string;
  dekVersion: Date;
  encName: Ciphertext;
}

export type NewCategory = Omit<Category, "id">;

export const registerCategory = async (params: NewCategory) => {
  await db.transaction().execute(async (trx) => {
    const mek = await trx
      .selectFrom("master_encryption_key")
      .select("version")
      .where("user_id", "=", params.userId)
      .where("state", "=", "active")
      .limit(1)
      .forUpdate()
      .executeTakeFirst();
    if (mek?.version !== params.mekVersion) {
      throw new IntegrityError("Inactive MEK version");
    }

    const { categoryId } = await trx
      .insertInto("category")
      .values({
        parent_id: params.parentId !== "root" ? params.parentId : null,
        user_id: params.userId,
        master_encryption_key_version: params.mekVersion,
        encrypted_data_encryption_key: params.encDek,
        data_encryption_key_version: params.dekVersion,
        encrypted_name: params.encName,
      })
      .returning("id as categoryId")
      .executeTakeFirstOrThrow();
    await trx
      .insertInto("category_log")
      .values({
        category_id: categoryId,
        timestamp: new Date(),
        action: "create",
        new_name: params.encName,
      })
      .execute();
  });
};

export const getAllCategoriesByParent = async (userId: number, parentId: CategoryId) => {
  let query = db.selectFrom("category").selectAll().where("user_id", "=", userId);
  query =
    parentId === "root"
      ? query.where("parent_id", "is", null)
      : query.where("parent_id", "=", parentId);
  const categories = await query.execute();
  return categories.map(
    (category) =>
      ({
        id: category.id,
        parentId: category.parent_id ?? "root",
        userId: category.user_id,
        mekVersion: category.master_encryption_key_version,
        encDek: category.encrypted_data_encryption_key,
        dekVersion: category.data_encryption_key_version,
        encName: category.encrypted_name,
      }) satisfies Category,
  );
};

export const getCategory = async (userId: number, categoryId: number) => {
  const category = await db
    .selectFrom("category")
    .selectAll()
    .where("id", "=", categoryId)
    .where("user_id", "=", userId)
    .limit(1)
    .executeTakeFirst();
  return category
    ? ({
        id: category.id,
        parentId: category.parent_id ?? "root",
        userId: category.user_id,
        mekVersion: category.master_encryption_key_version,
        encDek: category.encrypted_data_encryption_key,
        dekVersion: category.data_encryption_key_version,
        encName: category.encrypted_name,
      } satisfies Category)
    : null;
};

export const setCategoryEncName = async (
  userId: number,
  categoryId: number,
  dekVersion: Date,
  encName: Ciphertext,
) => {
  await db.transaction().execute(async (trx) => {
    const category = await trx
      .selectFrom("category")
      .select("data_encryption_key_version")
      .where("id", "=", categoryId)
      .where("user_id", "=", userId)
      .limit(1)
      .forUpdate()
      .executeTakeFirst();
    if (!category) {
      throw new IntegrityError("Category not found");
    } else if (category.data_encryption_key_version.getTime() !== dekVersion.getTime()) {
      throw new IntegrityError("Invalid DEK version");
    }

    await trx
      .updateTable("category")
      .set({ encrypted_name: encName })
      .where("id", "=", categoryId)
      .where("user_id", "=", userId)
      .execute();
    await trx
      .insertInto("category_log")
      .values({
        category_id: categoryId,
        timestamp: new Date(),
        action: "rename",
        new_name: encName,
      })
      .execute();
  });
};

export const unregisterCategory = async (userId: number, categoryId: number) => {
  const res = await db
    .deleteFrom("category")
    .where("id", "=", categoryId)
    .where("user_id", "=", userId)
    .executeTakeFirst();
  if (res.numDeletedRows === 0n) {
    throw new IntegrityError("Category not found");
  }
};
