import { sql, type Selectable } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/postgres";
import pg from "pg";
import { IntegrityError } from "./error";
import db from "./kysely";
import type { Ciphertext, FileTable } from "./schema";

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
  encContentIv: string | null;
  encContentHash: string;
  encName: Ciphertext;
  encCreatedAt: Ciphertext | null;
  encLastModifiedAt: Ciphertext;
  isFavorite: boolean;
}

interface FileCategory {
  id: number;
  parentId: CategoryId;
  mekVersion: number;
  encDek: string;
  dekVersion: Date;
  encName: Ciphertext;
}

const toFile = (row: Selectable<FileTable>): File => ({
  id: row.id,
  parentId: row.parent_id ?? "root",
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

export const registerFile = async (trx: typeof db, params: Omit<File, "id" | "isFavorite">) => {
  if ((params.hskVersion && !params.contentHmac) || (!params.hskVersion && params.contentHmac)) {
    throw new Error("Invalid arguments");
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
};

export const getAllFilesByParent = async (userId: number, parentId: DirectoryId) => {
  const files = await db
    .selectFrom("file")
    .selectAll()
    .where("user_id", "=", userId)
    .$if(parentId === "root", (qb) => qb.where("parent_id", "is", null))
    .$if(parentId !== "root", (qb) => qb.where("parent_id", "=", parentId as number))
    .execute();
  return files.map(toFile);
};

export const getAllFilesByCategory = async (
  userId: number,
  categoryId: number,
  recurse: boolean,
) => {
  const files = await db
    .withRecursive("category_tree", (db) =>
      db
        .selectFrom("category")
        .select(["id", sql<number>`0`.as("depth")])
        .where("id", "=", categoryId)
        .where("user_id", "=", userId)
        .$if(recurse, (qb) =>
          qb.unionAll((db) =>
            db
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

export const getAllFileIds = async (userId: number) => {
  const files = await db.selectFrom("file").select("id").where("user_id", "=", userId).execute();
  return files.map(({ id }) => id);
};

export const getLegacyFiles = async (userId: number, limit: number = 100) => {
  const files = await db
    .selectFrom("file")
    .selectAll()
    .where("user_id", "=", userId)
    .where("encrypted_content_iv", "is not", null)
    .limit(limit)
    .execute();
  return files.map(toFile);
};

export const getFilesWithoutThumbnail = async (userId: number, limit: number = 100) => {
  const files = await db
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
  return file ? toFile(file) : null;
};

export const getFilesWithCategories = async (userId: number, fileIds: number[]) => {
  const files = await db
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
    categories: file.categories.map(
      (category) =>
        ({
          id: category.id,
          parentId: category.parent_id ?? "root",
          mekVersion: category.master_encryption_key_version,
          encDek: category.encrypted_data_encryption_key,
          dekVersion: new Date(category.data_encryption_key_version),
          encName: category.encrypted_name,
        }) satisfies FileCategory,
    ),
  }));
};

export const getAllFavoriteFiles = async (userId: number) => {
  const files = await db
    .selectFrom("file")
    .selectAll()
    .where("user_id", "=", userId)
    .where("is_favorite", "=", true)
    .execute();
  return files.map(toFile);
};

export const searchFiles = async (
  userId: number,
  filters: {
    parentId: DirectoryId;
    inFavorites: boolean;
    includeCategoryIds: number[];
    excludeCategoryIds: number[];
  },
) => {
  const baseQuery = db
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
    .withRecursive("include_category_tree", (db) =>
      db
        .selectFrom("category")
        .select(["id", "id as root_id"])
        .where("id", "=", (eb) => eb.fn.any(eb.val(filters.includeCategoryIds)))
        .where("user_id", "=", userId)
        .unionAll(
          db
            .selectFrom("category as c")
            .innerJoin("include_category_tree as ct", "c.parent_id", "ct.id")
            .select(["c.id", "ct.root_id"]),
        ),
    )
    .withRecursive("exclude_category_tree", (db) =>
      db
        .selectFrom("category")
        .select("id")
        .where("id", "=", (eb) => eb.fn.any(eb.val(filters.excludeCategoryIds)))
        .where("user_id", "=", userId)
        .unionAll((db) =>
          db
            .selectFrom("category as c")
            .innerJoin("exclude_category_tree as ct", "c.parent_id", "ct.id")
            .select("c.id"),
        ),
    )
    .selectFrom("file")
    .selectAll("file")
    .where("user_id", "=", userId)
    .$if(filters.parentId !== "root", (qb) =>
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
  return await db.transaction().execute(async (trx) => {
    const file = await trx
      .selectFrom("file")
      .leftJoin("thumbnail", "file.id", "thumbnail.file_id")
      .select(["file.path", "thumbnail.path as thumbnailPath"])
      .where("file.id", "=", fileId)
      .where("file.user_id", "=", userId)
      .forUpdate("file")
      .executeTakeFirst();
    if (!file) {
      throw new IntegrityError("File not found");
    }

    await trx.deleteFrom("file").where("id", "=", fileId).execute();
    return file;
  });
};

export const migrateFileContent = async (
  trx: typeof db,
  userId: number,
  fileId: number,
  newPath: string,
  dekVersion: Date,
  encContentHash: string,
) => {
  const file = await trx
    .selectFrom("file")
    .select(["path", "data_encryption_key_version", "encrypted_content_iv"])
    .where("id", "=", fileId)
    .where("user_id", "=", userId)
    .limit(1)
    .forUpdate()
    .executeTakeFirst();
  if (!file) {
    throw new IntegrityError("File not found");
  } else if (file.data_encryption_key_version.getTime() !== dekVersion.getTime()) {
    throw new IntegrityError("Invalid DEK version");
  } else if (!file.encrypted_content_iv) {
    throw new IntegrityError("File is not legacy");
  }

  await trx
    .updateTable("file")
    .set({
      path: newPath,
      encrypted_content_iv: null,
      encrypted_content_hash: encContentHash,
    })
    .where("id", "=", fileId)
    .where("user_id", "=", userId)
    .execute();
  await trx
    .insertInto("file_log")
    .values({
      file_id: fileId,
      timestamp: new Date(),
      action: "migrate",
    })
    .execute();
  return { oldPath: file.path };
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
    .innerJoin("category", "file_category.category_id", "category.id")
    .selectAll("category")
    .where("file_id", "=", fileId)
    .execute();
  return categories.map(
    (category) =>
      ({
        id: category.id,
        parentId: category.parent_id ?? "root",
        mekVersion: category.master_encryption_key_version,
        encDek: category.encrypted_data_encryption_key,
        dekVersion: category.data_encryption_key_version,
        encName: category.encrypted_name,
      }) satisfies FileCategory,
  );
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

export const setFileFavorite = async (userId: number, fileId: number, isFavorite: boolean) => {
  await db.transaction().execute(async (trx) => {
    const file = await trx
      .selectFrom("file")
      .select("is_favorite")
      .where("id", "=", fileId)
      .where("user_id", "=", userId)
      .limit(1)
      .forUpdate()
      .executeTakeFirst();
    if (!file) {
      throw new IntegrityError("File not found");
    } else if (file.is_favorite === isFavorite) {
      throw new IntegrityError(isFavorite ? "File already favorited" : "File not favorited");
    }

    await trx
      .updateTable("file")
      .set({ is_favorite: isFavorite })
      .where("id", "=", fileId)
      .where("user_id", "=", userId)
      .execute();
    await trx
      .insertInto("file_log")
      .values({
        file_id: fileId,
        timestamp: new Date(),
        action: isFavorite ? "add-to-favorites" : "remove-from-favorites",
      })
      .execute();
  });
};
