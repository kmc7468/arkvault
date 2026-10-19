import type { Selectable } from "kysely";
import type { Executor, Tx } from "../executor.ts";
import {
  decodeParentId,
  encodeParentId,
  parentIdOperator,
  withDirectoryTrees,
} from "../queries.ts";
import type { Ciphertext, DirectoryTable } from "../schema/index.ts";

export interface Directory {
  id: number;
  parentId: DirectoryId;
  userId: number;
  mekVersion: number;
  encDek: string;
  dekVersion: Date;
  encName: Ciphertext;
  isFavorite: boolean;
}

export type NewDirectory = Omit<Directory, "id" | "isFavorite">;

const toDirectory = (row: Selectable<DirectoryTable>): Directory => ({
  id: row.id,
  parentId: decodeParentId(row.parent_id),
  userId: row.user_id,
  mekVersion: row.master_encryption_key_version,
  encDek: row.encrypted_data_encryption_key,
  dekVersion: row.data_encryption_key_version,
  encName: row.encrypted_name,
  isFavorite: row.is_favorite,
});

export const createDirectory = async (executor: Executor, params: NewDirectory) => {
  const { id } = await executor
    .insertInto("directory")
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

export const getDirectory = async (executor: Executor, userId: number, directoryId: number) => {
  const directory = await executor
    .selectFrom("directory")
    .selectAll()
    .where("id", "=", directoryId)
    .where("user_id", "=", userId)
    .limit(1)
    .executeTakeFirst();
  return directory ? toDirectory(directory) : null;
};

// Locks the directory in share mode so that it isn't deleted until the transaction ends. Returns
// whether it exists.
export const lockDirectory = async (trx: Tx, userId: number, directoryId: number) => {
  const directory = await trx
    .selectFrom("directory")
    .select("id")
    .where("id", "=", directoryId)
    .where("user_id", "=", userId)
    .limit(1)
    .forShare()
    .executeTakeFirst();
  return !!directory;
};

export const getAllDirectoriesByParent = async (
  executor: Executor,
  userId: number,
  parentId: DirectoryId,
) => {
  const directories = await executor
    .selectFrom("directory")
    .selectAll()
    .where("user_id", "=", userId)
    .where("parent_id", parentIdOperator(parentId), encodeParentId(parentId))
    .execute();
  return directories.map(toDirectory);
};

export const getAllFavoriteDirectories = async (executor: Executor, userId: number) => {
  const directories = await executor
    .selectFrom("directory")
    .selectAll()
    .where("user_id", "=", userId)
    .where("is_favorite", "=", true)
    .execute();
  return directories.map(toDirectory);
};

export const searchDirectories = async (
  executor: Executor,
  userId: number,
  filters: { ancestorId: DirectoryId; inFavorites: boolean },
) => {
  const directories = await withDirectoryTrees(executor, userId, {
    rootId: filters.ancestorId,
    inFavorites: filters.inFavorites,
  })
    .selectFrom("directory")
    .selectAll()
    .where("user_id", "=", userId)
    .$if(filters.ancestorId !== "root", (qb) =>
      qb.where((eb) =>
        eb.exists(eb.selectFrom("directory_tree as dt").whereRef("dt.id", "=", "parent_id")),
      ),
    )
    .$if(filters.inFavorites, (qb) =>
      qb.where((eb) =>
        eb.exists(
          eb.selectFrom("favorite_directory_tree as dt").whereRef("dt.id", "=", "directory.id"),
        ),
      ),
    )
    .execute();
  return directories.map(toDirectory);
};

// Returns whether the name has been changed, which fails if the directory doesn't exist or its DEK
// version differs
export const setDirectoryEncName = async (
  executor: Executor,
  userId: number,
  directoryId: number,
  dekVersion: Date,
  encName: Ciphertext,
) => {
  const { numUpdatedRows } = await executor
    .updateTable("directory")
    .set({ encrypted_name: encName })
    .where("id", "=", directoryId)
    .where("user_id", "=", userId)
    .where("data_encryption_key_version", "=", dekVersion)
    .executeTakeFirst();
  return numUpdatedRows > 0n;
};

// Returns whether the state has been changed, which fails if the directory doesn't exist or is
// already in the state
export const setDirectoryFavorite = async (
  executor: Executor,
  userId: number,
  directoryId: number,
  isFavorite: boolean,
) => {
  const { numUpdatedRows } = await executor
    .updateTable("directory")
    .set({ is_favorite: isFavorite })
    .where("id", "=", directoryId)
    .where("user_id", "=", userId)
    .where("is_favorite", "!=", isFavorite)
    .executeTakeFirst();
  return numUpdatedRows > 0n;
};

// Locks the directory and its descendants, and returns their ids (empty if it doesn't exist)
export const lockDirectoryTree = async (trx: Tx, userId: number, directoryId: number) => {
  const directories = await withDirectoryTrees(trx, userId, {
    rootId: directoryId,
    inFavorites: false,
  })
    .selectFrom("directory")
    .select("id")
    .where("id", "in", (eb) => eb.selectFrom("directory_tree").select("id"))
    .forUpdate()
    .execute();
  return directories.map(({ id }) => id);
};

export const deleteDirectories = async (executor: Executor, directoryIds: number[]) => {
  if (directoryIds.length > 0) {
    await executor.deleteFrom("directory").where("id", "in", directoryIds).execute();
  }
};
