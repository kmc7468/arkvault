import type { Selectable } from "kysely";
import { IntegrityError } from "./error";
import db from "./kysely";
import type { Ciphertext, DirectoryTable } from "./schema";

interface Directory {
  id: number;
  parentId: DirectoryId;
  userId: number;
  mekVersion: number;
  encDek: string;
  dekVersion: Date;
  encName: Ciphertext;
  isFavorite: boolean;
}

const toDirectory = (row: Selectable<DirectoryTable>): Directory => ({
  id: row.id,
  parentId: row.parent_id ?? "root",
  userId: row.user_id,
  mekVersion: row.master_encryption_key_version,
  encDek: row.encrypted_data_encryption_key,
  dekVersion: row.data_encryption_key_version,
  encName: row.encrypted_name,
  isFavorite: row.is_favorite,
});

export const registerDirectory = async (params: Omit<Directory, "id" | "isFavorite">) => {
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

    const { directoryId } = await trx
      .insertInto("directory")
      .values({
        parent_id: params.parentId !== "root" ? params.parentId : null,
        user_id: params.userId,
        master_encryption_key_version: params.mekVersion,
        encrypted_data_encryption_key: params.encDek,
        data_encryption_key_version: params.dekVersion,
        encrypted_name: params.encName,
      })
      .returning("id as directoryId")
      .executeTakeFirstOrThrow();
    await trx
      .insertInto("directory_log")
      .values({
        directory_id: directoryId,
        timestamp: new Date(),
        action: "create",
        new_name: params.encName,
      })
      .execute();
  });
};

export const getAllDirectoriesByParent = async (userId: number, parentId: DirectoryId) => {
  const directories = await db
    .selectFrom("directory")
    .selectAll()
    .where("user_id", "=", userId)
    .$if(parentId === "root", (qb) => qb.where("parent_id", "is", null))
    .$if(parentId !== "root", (qb) => qb.where("parent_id", "=", parentId as number))
    .execute();
  return directories.map(toDirectory);
};

export const getAllFavoriteDirectories = async (userId: number) => {
  const directories = await db
    .selectFrom("directory")
    .selectAll()
    .where("user_id", "=", userId)
    .where("is_favorite", "=", true)
    .execute();
  return directories.map(toDirectory);
};

export const getDirectory = async (userId: number, directoryId: number) => {
  const directory = await db
    .selectFrom("directory")
    .selectAll()
    .where("id", "=", directoryId)
    .where("user_id", "=", userId)
    .limit(1)
    .executeTakeFirst();
  return directory ? toDirectory(directory) : null;
};

export const searchDirectories = async (
  userId: number,
  filters: {
    parentId: DirectoryId;
    inFavorites: boolean;
  },
) => {
  const directories = await db
    .withRecursive("directory_tree", (db) =>
      db
        .selectFrom("directory")
        .select("id")
        .where("user_id", "=", userId)
        .$if(filters.parentId === "root", (qb) => qb.where((eb) => eb.lit(false))) // directory_tree will be empty if parentId is "root"
        .$if(filters.parentId !== "root", (qb) => qb.where("id", "=", filters.parentId as number))
        .unionAll(
          db
            .selectFrom("directory as d")
            .innerJoin("directory_tree as dt", "d.parent_id", "dt.id")
            .select("d.id"),
        ),
    )
    .withRecursive("favorite_directory_tree", (db) =>
      db
        .selectFrom("directory")
        .select("id")
        .where("user_id", "=", userId)
        .$if(!filters.inFavorites, (qb) => qb.where((eb) => eb.lit(false))) // favorite_directory_tree will be empty if inFavorites is false
        .$if(filters.inFavorites, (qb) => qb.where("is_favorite", "=", true))
        .unionAll((db) =>
          db
            .selectFrom("directory as d")
            .innerJoin("favorite_directory_tree as dt", "d.parent_id", "dt.id")
            .select("d.id"),
        ),
    )
    .selectFrom("directory")
    .selectAll()
    .where("user_id", "=", userId)
    .$if(filters.parentId !== "root", (qb) =>
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

export const setDirectoryEncName = async (
  userId: number,
  directoryId: number,
  dekVersion: Date,
  encName: Ciphertext,
) => {
  await db.transaction().execute(async (trx) => {
    const directory = await trx
      .selectFrom("directory")
      .select("data_encryption_key_version")
      .where("id", "=", directoryId)
      .where("user_id", "=", userId)
      .limit(1)
      .forUpdate()
      .executeTakeFirst();
    if (!directory) {
      throw new IntegrityError("Directory not found");
    } else if (directory.data_encryption_key_version.getTime() !== dekVersion.getTime()) {
      throw new IntegrityError("Invalid DEK version");
    }

    await trx
      .updateTable("directory")
      .set({ encrypted_name: encName })
      .where("id", "=", directoryId)
      .where("user_id", "=", userId)
      .execute();
    await trx
      .insertInto("directory_log")
      .values({
        directory_id: directoryId,
        timestamp: new Date(),
        action: "rename",
        new_name: encName,
      })
      .execute();
  });
};

export const setDirectoryFavorite = async (
  userId: number,
  directoryId: number,
  isFavorite: boolean,
) => {
  await db.transaction().execute(async (trx) => {
    const directory = await trx
      .selectFrom("directory")
      .select("is_favorite")
      .where("id", "=", directoryId)
      .where("user_id", "=", userId)
      .limit(1)
      .forUpdate()
      .executeTakeFirst();
    if (!directory) {
      throw new IntegrityError("Directory not found");
    } else if (directory.is_favorite === isFavorite) {
      throw new IntegrityError(
        isFavorite ? "Directory already favorited" : "Directory not favorited",
      );
    }

    await trx
      .updateTable("directory")
      .set({ is_favorite: isFavorite })
      .where("id", "=", directoryId)
      .where("user_id", "=", userId)
      .execute();
    await trx
      .insertInto("directory_log")
      .values({
        directory_id: directoryId,
        timestamp: new Date(),
        action: isFavorite ? "add-to-favorites" : "remove-from-favorites",
      })
      .execute();
  });
};

export const unregisterDirectory = async (userId: number, directoryId: number) => {
  return await db
    .transaction()
    .setIsolationLevel("repeatable read") // TODO: Sufficient?
    .execute(async (trx) => {
      const unregisterFiles = async (parentId: number) => {
        const files = await trx
          .selectFrom("file")
          .leftJoin("thumbnail", "file.id", "thumbnail.file_id")
          .select(["file.id", "file.path", "thumbnail.path as thumbnailPath"])
          .where("file.parent_id", "=", parentId)
          .where("file.user_id", "=", userId)
          .forUpdate("file")
          .execute();
        await trx
          .deleteFrom("file")
          .where("parent_id", "=", parentId)
          .where("user_id", "=", userId)
          .execute();
        return files;
      };
      const unregisterDirectoryRecursively = async (
        directoryId: number,
      ): Promise<{ id: number; path: string; thumbnailPath: string | null }[]> => {
        const files = await unregisterFiles(directoryId);
        const subDirectories = await trx
          .selectFrom("directory")
          .select("id")
          .where("parent_id", "=", directoryId)
          .where("user_id", "=", userId)
          .execute();
        const subDirectoryFilePaths = await Promise.all(
          subDirectories.map(async ({ id }) => await unregisterDirectoryRecursively(id)),
        );

        const deleteRes = await trx
          .deleteFrom("directory")
          .where("id", "=", directoryId)
          .where("user_id", "=", userId)
          .executeTakeFirst();
        if (deleteRes.numDeletedRows === 0n) {
          throw new IntegrityError("Directory not found");
        }
        return files.concat(...subDirectoryFilePaths);
      };
      return await unregisterDirectoryRecursively(directoryId);
    });
};
