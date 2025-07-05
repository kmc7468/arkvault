import { sql, type NotNull } from "kysely";
import pg from "pg";
import { IntegrityError } from "./error";
import db from "./kysely";
import type { Ciphertext } from "./schema";

export type DirectoryId = "root" | number;

interface Directory {
  id: number;
  parentId: DirectoryId;
  userId: number;
  mekVersion: number;
  encDek: string;
  dekVersion: Date;
  encName: Ciphertext;
}

export type NewDirectory = Omit<Directory, "id">;

interface File {
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
  encContentIv: string;
  encContentHash: string;
  encName: Ciphertext;
  encCreatedAt: Ciphertext | null;
  encLastModifiedAt: Ciphertext;
}

export type NewFile = Omit<File, "id">;

export const registerDirectory = async (params: NewDirectory) => {
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
  let query = db.selectFrom("directory").selectAll().where("user_id", "=", userId);
  query =
    parentId === "root"
      ? query.where("parent_id", "is", null)
      : query.where("parent_id", "=", parentId);
  const directories = await query.execute();
  return directories.map(
    (directory) =>
      ({
        id: directory.id,
        parentId: directory.parent_id ?? "root",
        userId: directory.user_id,
        mekVersion: directory.master_encryption_key_version,
        encDek: directory.encrypted_data_encryption_key,
        dekVersion: directory.data_encryption_key_version,
        encName: directory.encrypted_name,
      }) satisfies Directory,
  );
};

export const getDirectory = async (userId: number, directoryId: number) => {
  const directory = await db
    .selectFrom("directory")
    .selectAll()
    .where("id", "=", directoryId)
    .where("user_id", "=", userId)
    .limit(1)
    .executeTakeFirst();
  return directory
    ? ({
        id: directory.id,
        parentId: directory.parent_id ?? "root",
        userId: directory.user_id,
        mekVersion: directory.master_encryption_key_version,
        encDek: directory.encrypted_data_encryption_key,
        dekVersion: directory.data_encryption_key_version,
        encName: directory.encrypted_name,
      } satisfies Directory)
    : null;
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

export const unregisterDirectory = async (userId: number, directoryId: number) => {
  return await db
    .transaction()
    .setIsolationLevel("repeatable read") // TODO: Sufficient?
    .execute(async (trx) => {
      const unregisterFiles = async (parentId: number) => {
        return await trx
          .deleteFrom("file")
          .where("parent_id", "=", parentId)
          .where("user_id", "=", userId)
          .returning(["id", "path"])
          .execute();
      };
      const unregisterDirectoryRecursively = async (
        directoryId: number,
      ): Promise<{ id: number; path: string }[]> => {
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

export const registerFile = async (params: NewFile) => {
  if ((params.hskVersion && !params.contentHmac) || (!params.hskVersion && params.contentHmac)) {
    throw new Error("Invalid arguments");
  }

  return await db.transaction().execute(async (trx) => {
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

    if (params.hskVersion) {
      const hsk = await trx
        .selectFrom("hmac_secret_key")
        .select("version")
        .where("user_id", "=", params.userId)
        .where("state", "=", "active")
        .limit(1)
        .forUpdate()
        .executeTakeFirst();
      if (hsk?.version !== params.hskVersion) {
        throw new IntegrityError("Inactive HSK version");
      }
    }

    const { fileId } = await trx
      .insertInto("file")
      .values({
        parent_id: params.parentId !== "root" ? params.parentId : null,
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
      .returning("id as fileId")
      .executeTakeFirstOrThrow();
    await trx
      .insertInto("file_log")
      .values({
        file_id: fileId,
        timestamp: new Date(),
        action: "create",
        new_name: params.encName,
      })
      .execute();
    return { id: fileId };
  });
};

export const getAllFilesByParent = async (userId: number, parentId: DirectoryId) => {
  let query = db.selectFrom("file").selectAll().where("user_id", "=", userId);
  query =
    parentId === "root"
      ? query.where("parent_id", "is", null)
      : query.where("parent_id", "=", parentId);
  const files = await query.execute();
  return files.map(
    (file) =>
      ({
        id: file.id,
        parentId: file.parent_id ?? "root",
        userId: file.user_id,
        path: file.path,
        mekVersion: file.master_encryption_key_version,
        encDek: file.encrypted_data_encryption_key,
        dekVersion: file.data_encryption_key_version,
        hskVersion: file.hmac_secret_key_version,
        contentHmac: file.content_hmac,
        contentType: file.content_type,
        encContentIv: file.encrypted_content_iv,
        encContentHash: file.encrypted_content_hash,
        encName: file.encrypted_name,
        encCreatedAt: file.encrypted_created_at,
        encLastModifiedAt: file.encrypted_last_modified_at,
      }) satisfies File,
  );
};

export const getAllFilesByCategory = async (
  userId: number,
  categoryId: number,
  recurse: boolean,
) => {
  const files = await db
    .withRecursive("cte", (db) =>
      db
        .selectFrom("category")
        .leftJoin("file_category", "category.id", "file_category.category_id")
        .select(["id", "parent_id", "user_id", "file_category.file_id"])
        .select(sql<number>`0`.as("depth"))
        .where("id", "=", categoryId)
        .$if(recurse, (qb) =>
          qb.unionAll((db) =>
            db
              .selectFrom("category")
              .leftJoin("file_category", "category.id", "file_category.category_id")
              .innerJoin("cte", "category.parent_id", "cte.id")
              .select([
                "category.id",
                "category.parent_id",
                "category.user_id",
                "file_category.file_id",
              ])
              .select(sql<number>`cte.depth + 1`.as("depth")),
          ),
        ),
    )
    .selectFrom("cte")
    .select(["file_id", "depth"])
    .distinctOn("file_id")
    .where("user_id", "=", userId)
    .where("file_id", "is not", null)
    .$narrowType<{ file_id: NotNull }>()
    .orderBy("file_id")
    .orderBy("depth")
    .execute();
  return files.map(({ file_id, depth }) => ({ id: file_id, isRecursive: depth > 0 }));
};

export const getAllFileIdsByContentHmac = async (
  userId: number,
  hskVersion: number,
  contentHmac: string,
) => {
  const files = await db
    .selectFrom("file")
    .select("id")
    .where("user_id", "=", userId)
    .where("hmac_secret_key_version", "=", hskVersion)
    .where("content_hmac", "=", contentHmac)
    .execute();
  return files.map(({ id }) => id);
};

export const getFile = async (userId: number, fileId: number) => {
  const file = await db
    .selectFrom("file")
    .selectAll()
    .where("id", "=", fileId)
    .where("user_id", "=", userId)
    .limit(1)
    .executeTakeFirst();
  return file
    ? ({
        id: file.id,
        parentId: file.parent_id ?? "root",
        userId: file.user_id,
        path: file.path,
        mekVersion: file.master_encryption_key_version,
        encDek: file.encrypted_data_encryption_key,
        dekVersion: file.data_encryption_key_version,
        hskVersion: file.hmac_secret_key_version,
        contentHmac: file.content_hmac,
        contentType: file.content_type,
        encContentIv: file.encrypted_content_iv,
        encContentHash: file.encrypted_content_hash,
        encName: file.encrypted_name,
        encCreatedAt: file.encrypted_created_at,
        encLastModifiedAt: file.encrypted_last_modified_at,
      } satisfies File)
    : null;
};

export const setFileEncName = async (
  userId: number,
  fileId: number,
  dekVersion: Date,
  encName: Ciphertext,
) => {
  await db.transaction().execute(async (trx) => {
    const file = await trx
      .selectFrom("file")
      .select("data_encryption_key_version")
      .where("id", "=", fileId)
      .where("user_id", "=", userId)
      .limit(1)
      .forUpdate()
      .executeTakeFirst();
    if (!file) {
      throw new IntegrityError("File not found");
    } else if (file.data_encryption_key_version.getTime() !== dekVersion.getTime()) {
      throw new IntegrityError("Invalid DEK version");
    }

    await trx
      .updateTable("file")
      .set({ encrypted_name: encName })
      .where("id", "=", fileId)
      .where("user_id", "=", userId)
      .execute();
    await trx
      .insertInto("file_log")
      .values({
        file_id: fileId,
        timestamp: new Date(),
        action: "rename",
        new_name: encName,
      })
      .execute();
  });
};

export const unregisterFile = async (userId: number, fileId: number) => {
  const file = await db
    .deleteFrom("file")
    .where("id", "=", fileId)
    .where("user_id", "=", userId)
    .returning("path")
    .executeTakeFirst();
  if (!file) {
    throw new IntegrityError("File not found");
  }
  return { path: file.path };
};

export const addFileToCategory = async (fileId: number, categoryId: number) => {
  await db.transaction().execute(async (trx) => {
    try {
      await trx
        .insertInto("file_category")
        .values({ file_id: fileId, category_id: categoryId })
        .execute();
      await trx
        .insertInto("file_log")
        .values({
          file_id: fileId,
          timestamp: new Date(),
          action: "add-to-category",
          category_id: categoryId,
        })
        .execute();
    } catch (e) {
      if (e instanceof pg.DatabaseError && e.code === "23505") {
        throw new IntegrityError("File already added to category");
      }
      throw e;
    }
  });
};

export const getAllFileCategories = async (fileId: number) => {
  const categories = await db
    .selectFrom("file_category")
    .select("category_id")
    .where("file_id", "=", fileId)
    .execute();
  return categories.map(({ category_id }) => ({ id: category_id }));
};

export const removeFileFromCategory = async (fileId: number, categoryId: number) => {
  await db.transaction().execute(async (trx) => {
    const res = await trx
      .deleteFrom("file_category")
      .where("file_id", "=", fileId)
      .where("category_id", "=", categoryId)
      .executeTakeFirst();
    if (res.numDeletedRows === 0n) {
      throw new IntegrityError("File not found in category");
    }

    await trx
      .insertInto("file_log")
      .values({
        file_id: fileId,
        timestamp: new Date(),
        action: "remove-from-category",
        category_id: categoryId,
      })
      .execute();
  });
};
