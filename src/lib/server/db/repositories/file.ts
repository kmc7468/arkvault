import { sql, type Selectable } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/postgres";
import type { Executor, Tx } from "../executor.ts";
import {
  decodeParentId,
  encodeParentId,
  parentIdOperator,
  withDirectoryTrees,
} from "../queries.ts";
import type { Ciphertext, FileTable } from "../schema/index.ts";
import { toCategory } from "./category.ts";

export interface File {
  id: number;
  parentId: DirectoryId;
  userId: number;
  path: string;
  mekVersion: number;
  encDek: string;
  dekVersion: Date;
  hskVersion: number | null;
  contentHmac: string | null;
  contentType: string;
  encContentIv: string | null;
  encContentHash: string;
  encName: Ciphertext;
  encCreatedAt: Ciphertext | null;
  encLastModifiedAt: Ciphertext;
  isFavorite: boolean;
}

export type NewFile = Omit<File, "id" | "isFavorite">;

const toFile = (row: Selectable<FileTable>): File => ({
  id: row.id,
  parentId: decodeParentId(row.parent_id),
  userId: row.user_id,
  path: row.path,
  mekVersion: row.master_encryption_key_version,
  encDek: row.encrypted_data_encryption_key,
  dekVersion: row.data_encryption_key_version,
  hskVersion: row.hmac_secret_key_version,
  contentHmac: row.content_hmac,
  contentType: row.content_type,
  encContentIv: row.encrypted_content_iv,
  encContentHash: row.encrypted_content_hash,
  encName: row.encrypted_name,
  encCreatedAt: row.encrypted_created_at,
  encLastModifiedAt: row.encrypted_last_modified_at,
  isFavorite: row.is_favorite,
});

export const createFile = async (executor: Executor, params: NewFile) => {
  const { id } = await executor
    .insertInto("file")
    .values({
      parent_id: encodeParentId(params.parentId),
      user_id: params.userId,
      path: params.path,
      master_encryption_key_version: params.mekVersion,
      encrypted_data_encryption_key: params.encDek,
      data_encryption_key_version: params.dekVersion,
      hmac_secret_key_version: params.hskVersion,
      content_hmac: params.contentHmac,
      content_type: params.contentType,
      encrypted_content_iv: params.encContentIv,
      encrypted_content_hash: params.encContentHash,
      encrypted_name: params.encName,
      encrypted_created_at: params.encCreatedAt,
      encrypted_last_modified_at: params.encLastModifiedAt,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { id };
};

export const getFile = async (executor: Executor, userId: number, fileId: number) => {
  const file = await executor
    .selectFrom("file")
    .selectAll()
    .where("id", "=", fileId)
    .where("user_id", "=", userId)
    .limit(1)
    .executeTakeFirst();
  return file ? toFile(file) : null;
};

// Locks the file in share mode so that it isn't deleted until the transaction ends. Returns
// whether it exists.
export const lockFile = async (trx: Tx, userId: number, fileId: number) => {
  const file = await trx
    .selectFrom("file")
    .select("id")
    .where("id", "=", fileId)
    .where("user_id", "=", userId)
    .limit(1)
    .forShare()
    .executeTakeFirst();
  return !!file;
};

// Locks the file in share mode so that its DEK isn't changed until the transaction ends. Returns
// its DEK version if it exists.
export const lockFileDekVersion = async (trx: Tx, userId: number, fileId: number) => {
  const file = await trx
    .selectFrom("file")
    .select("data_encryption_key_version")
    .where("id", "=", fileId)
    .where("user_id", "=", userId)
    .limit(1)
    .forShare()
    .executeTakeFirst();
  return file?.data_encryption_key_version ?? null;
};

// Locks the files to delete them, and selects the paths of their contents and thumbnails
const selectFilesForDeletion = (trx: Tx) =>
  trx
    .selectFrom("file")
    .leftJoin("thumbnail", "file.id", "thumbnail.file_id")
    .select(["file.id", "file.path", "thumbnail.path as thumbnailPath"])
    .forUpdate("file");

export const lockFileForDeletion = async (trx: Tx, userId: number, fileId: number) => {
  return await selectFilesForDeletion(trx)
    .where("file.id", "=", fileId)
    .where("file.user_id", "=", userId)
    .executeTakeFirst();
};

export const lockFilesInDirectoriesForDeletion = async (trx: Tx, directoryIds: number[]) => {
  if (directoryIds.length === 0) return [];
  return await selectFilesForDeletion(trx).where("file.parent_id", "in", directoryIds).execute();
};

export const getAllFilesByParent = async (
  executor: Executor,
  userId: number,
  parentId: DirectoryId,
) => {
  const files = await executor
    .selectFrom("file")
    .selectAll()
    .where("user_id", "=", userId)
    .where("parent_id", parentIdOperator(parentId), encodeParentId(parentId))
    .execute();
  return files.map(toFile);
};

// Files of subcategories are included if `recurse`, which are marked as recursive
export const getAllFilesByCategory = async (
  executor: Executor,
  userId: number,
  categoryId: number,
  recurse: boolean,
) => {
  const files = await executor
    .withRecursive("category_tree", (qc) =>
      qc
        .selectFrom("category")
        .select(["id", sql<number>`0`.as("depth")])
        .where("id", "=", categoryId)
        .where("user_id", "=", userId)
        .$if(recurse, (qb) =>
          qb.unionAll((qc) =>
            qc
              .selectFrom("category")
              .innerJoin("category_tree", "category.parent_id", "category_tree.id")
              .select(["category.id", sql<number>`depth + 1`.as("depth")]),
          ),
        ),
    )
    .selectFrom("category_tree")
    .innerJoin("file_category", "category_tree.id", "file_category.category_id")
    .innerJoin("file", "file_category.file_id", "file.id")
    .select(["file_id", "depth"])
    .selectAll("file")
    .distinctOn("file_id")
    .orderBy("file_id")
    .orderBy("depth")
    .execute();
  return files.map((file) => ({
    ...toFile(file),
    isRecursive: file.depth > 0,
  }));
};

export const getAllFileIds = async (executor: Executor, userId: number) => {
  const files = await executor
    .selectFrom("file")
    .select("id")
    .where("user_id", "=", userId)
    .execute();
  return files.map(({ id }) => id);
};

export const getFilesWithoutThumbnail = async (executor: Executor, userId: number, limit = 100) => {
  const files = await executor
    .selectFrom("file")
    .selectAll()
    .where("user_id", "=", userId)
    .where((eb) =>
      eb.or([eb("content_type", "like", "image/%"), eb("content_type", "like", "video/%")]),
    )
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("thumbnail")
            .select("thumbnail.id")
            .whereRef("thumbnail.file_id", "=", "file.id")
            .limit(1),
        ),
      ),
    )
    .limit(limit)
    .execute();
  return files.map(toFile);
};

export const getAllFileIdsByContentHmac = async (
  executor: Executor,
  userId: number,
  hskVersion: number,
  contentHmac: string,
) => {
  const files = await executor
    .selectFrom("file")
    .select("id")
    .where("user_id", "=", userId)
    .where("hmac_secret_key_version", "=", hskVersion)
    .where("content_hmac", "=", contentHmac)
    .execute();
  return files.map(({ id }) => id);
};

export const getFilesWithCategories = async (
  executor: Executor,
  userId: number,
  fileIds: number[],
) => {
  const files = await executor
    .selectFrom("file")
    .selectAll()
    .select((eb) =>
      jsonArrayFrom(
        eb
          .selectFrom("file_category")
          .innerJoin("category", "file_category.category_id", "category.id")
          .where("file_category.file_id", "=", eb.ref("file.id"))
          .selectAll("category"),
      ).as("categories"),
    )
    .where("id", "=", (eb) => eb.fn.any(eb.val(fileIds)))
    .where("user_id", "=", userId)
    .execute();
  return files.map((file) => ({
    ...toFile(file),
    categories: file.categories.map(toCategory),
  }));
};

export const getAllFavoriteFiles = async (executor: Executor, userId: number) => {
  const files = await executor
    .selectFrom("file")
    .selectAll()
    .where("user_id", "=", userId)
    .where("is_favorite", "=", true)
    .execute();
  return files.map(toFile);
};

export const searchFiles = async (
  executor: Executor,
  userId: number,
  filters: {
    ancestorId: DirectoryId;
    inFavorites: boolean;
    includeCategoryIds: number[];
    excludeCategoryIds: number[];
  },
) => {
  const baseQuery = withDirectoryTrees(executor, userId, {
    rootId: filters.ancestorId,
    inFavorites: filters.inFavorites,
  })
    .withRecursive("include_category_tree", (qc) =>
      qc
        .selectFrom("category")
        .select(["id", "id as root_id"])
        .where("id", "=", (eb) => eb.fn.any(eb.val(filters.includeCategoryIds)))
        .where("user_id", "=", userId)
        .unionAll((qc) =>
          qc
            .selectFrom("category as c")
            .innerJoin("include_category_tree as ct", "c.parent_id", "ct.id")
            .select(["c.id", "ct.root_id"]),
        ),
    )
    .withRecursive("exclude_category_tree", (qc) =>
      qc
        .selectFrom("category")
        .select("id")
        .where("id", "=", (eb) => eb.fn.any(eb.val(filters.excludeCategoryIds)))
        .where("user_id", "=", userId)
        .unionAll((qc) =>
          qc
            .selectFrom("category as c")
            .innerJoin("exclude_category_tree as ct", "c.parent_id", "ct.id")
            .select("c.id"),
        ),
    )
    .selectFrom("file")
    .selectAll("file")
    .where("user_id", "=", userId)
    .$if(filters.ancestorId !== "root", (qb) =>
      qb.where((eb) =>
        eb.exists(eb.selectFrom("directory_tree as dt").whereRef("dt.id", "=", "file.parent_id")),
      ),
    )
    .$if(filters.inFavorites, (qb) =>
      qb.where((eb) =>
        eb.or([
          eb("is_favorite", "=", true),
          eb.exists(
            eb.selectFrom("favorite_directory_tree as dt").whereRef("dt.id", "=", "file.parent_id"),
          ),
        ]),
      ),
    )
    .$if(filters.excludeCategoryIds.length > 0, (qb) =>
      qb.where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom("file_category")
              .innerJoin("exclude_category_tree", "category_id", "exclude_category_tree.id")
              .whereRef("file_id", "=", "file.id"),
          ),
        ),
      ),
    );
  // Files must belong to all the included categories (or their subcategories)
  const files =
    filters.includeCategoryIds.length > 0
      ? await baseQuery
          .innerJoin("file_category", "file.id", "file_category.file_id")
          .innerJoin(
            "include_category_tree",
            "file_category.category_id",
            "include_category_tree.id",
          )
          .groupBy("file.id")
          .having(
            (eb) => eb.fn.count("include_category_tree.root_id").distinct(),
            "=",
            filters.includeCategoryIds.length,
          )
          .execute()
      : await baseQuery.execute();
  return files.map(toFile);
};

// Returns whether the name has been changed, which fails if the file doesn't exist or its DEK
// version differs
export const setFileEncName = async (
  executor: Executor,
  userId: number,
  fileId: number,
  dekVersion: Date,
  encName: Ciphertext,
) => {
  const { numUpdatedRows } = await executor
    .updateTable("file")
    .set({ encrypted_name: encName })
    .where("id", "=", fileId)
    .where("user_id", "=", userId)
    .where("data_encryption_key_version", "=", dekVersion)
    .executeTakeFirst();
  return numUpdatedRows > 0n;
};

// Returns whether the state has been changed, which fails if the file doesn't exist or is already
// in the state
export const setFileFavorite = async (
  executor: Executor,
  userId: number,
  fileId: number,
  isFavorite: boolean,
) => {
  const { numUpdatedRows } = await executor
    .updateTable("file")
    .set({ is_favorite: isFavorite })
    .where("id", "=", fileId)
    .where("user_id", "=", userId)
    .where("is_favorite", "!=", isFavorite)
    .executeTakeFirst();
  return numUpdatedRows > 0n;
};

export const deleteFiles = async (executor: Executor, fileIds: number[]) => {
  if (fileIds.length > 0) {
    await executor.deleteFrom("file").where("id", "in", fileIds).execute();
  }
};

// Violates `file_category_pk` if the file is already in the category
export const addFileToCategory = async (executor: Executor, fileId: number, categoryId: number) => {
  await executor
    .insertInto("file_category")
    .values({ file_id: fileId, category_id: categoryId })
    .execute();
};

// Returns whether the file has been removed, which fails if it isn't in the category
export const removeFileFromCategory = async (
  executor: Executor,
  fileId: number,
  categoryId: number,
) => {
  const { numDeletedRows } = await executor
    .deleteFrom("file_category")
    .where("file_id", "=", fileId)
    .where("category_id", "=", categoryId)
    .executeTakeFirst();
  return numDeletedRows > 0n;
};

export const getAllFileCategories = async (executor: Executor, fileId: number) => {
  const categories = await executor
    .selectFrom("file_category")
    .innerJoin("category", "file_category.category_id", "category.id")
    .selectAll("category")
    .where("file_id", "=", fileId)
    .execute();
  return categories.map(toCategory);
};
