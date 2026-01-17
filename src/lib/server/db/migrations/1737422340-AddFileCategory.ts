import { Kysely } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async (db: Kysely<any>) => {
  // category.ts
  await db.schema
    .createTable("category")
    .addColumn("id", "integer", (col) => col.primaryKey().generatedAlwaysAsIdentity())
    .addColumn("parent_id", "integer", (col) => col.references("category.id").onDelete("cascade"))
    .addColumn("user_id", "integer", (col) => col.references("user.id").notNull())
    .addColumn("master_encryption_key_version", "integer", (col) => col.notNull())
    .addColumn("encrypted_data_encryption_key", "text", (col) => col.unique().notNull())
    .addColumn("data_encryption_key_version", "timestamp(3)", (col) => col.notNull())
    .addColumn("encrypted_name", "json", (col) => col.notNull())
    .addForeignKeyConstraint(
      "category_fk01",
      ["user_id", "master_encryption_key_version"],
      "master_encryption_key",
      ["user_id", "version"],
    )
    .execute();
  await db.schema
    .createTable("category_log")
    .addColumn("id", "integer", (col) => col.primaryKey().generatedAlwaysAsIdentity())
    .addColumn("category_id", "integer", (col) =>
      col.references("category.id").onDelete("cascade").notNull(),
    )
    .addColumn("timestamp", "timestamp(3)", (col) => col.notNull())
    .addColumn("action", "text", (col) => col.notNull())
    .addColumn("new_name", "json")
    .execute();

  // file.ts
  await db.schema
    .alterTable("file_log")
    .addColumn("category_id", "integer", (col) =>
      col.references("category.id").onDelete("set null"),
    )
    .execute();
  await db.schema
    .createTable("file_category")
    .addColumn("file_id", "integer", (col) =>
      col.references("file.id").onDelete("cascade").notNull(),
    )
    .addColumn("category_id", "integer", (col) =>
      col.references("category.id").onDelete("cascade").notNull(),
    )
    .addPrimaryKeyConstraint("file_category_pk", ["file_id", "category_id"])
    .execute();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async (db: Kysely<any>) => {
  await db
    .deleteFrom("file_log")
    .where("action", "in", ["add-to-category", "remove-from-category"])
    .execute();

  await db.schema.dropTable("file_category").execute();
  await db.schema.alterTable("file_log").dropColumn("category_id").execute();
  await db.schema.dropTable("category_log").execute();
  await db.schema.dropTable("category").execute();
};
