import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async (db: Kysely<any>) => {
  // file.ts
  await db.schema
    .alterTable("file")
    .alterColumn("encrypted_content_iv", (col) => col.dropNotNull())
    .execute();

  // upload.ts
  await db.schema
    .createTable("upload_session")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "integer", (col) => col.references("user.id").notNull())
    .addColumn("total_chunks", "integer", (col) => col.notNull())
    .addColumn("uploaded_chunks", sql`integer[]`, (col) => col.notNull().defaultTo(sql`'{}'`))
    .addColumn("expires_at", "timestamp(3)", (col) => col.notNull())
    .addColumn("parent_id", "integer", (col) => col.references("directory.id"))
    .addColumn("master_encryption_key_version", "integer", (col) => col.notNull())
    .addColumn("encrypted_data_encryption_key", "text", (col) => col.notNull())
    .addColumn("data_encryption_key_version", "timestamp(3)", (col) => col.notNull())
    .addColumn("hmac_secret_key_version", "integer")
    .addColumn("content_type", "text", (col) => col.notNull())
    .addColumn("encrypted_name", "json", (col) => col.notNull())
    .addColumn("encrypted_created_at", "json")
    .addColumn("encrypted_last_modified_at", "json", (col) => col.notNull())
    .addForeignKeyConstraint(
      "upload_session_fk01",
      ["user_id", "master_encryption_key_version"],
      "master_encryption_key",
      ["user_id", "version"],
    )
    .addForeignKeyConstraint(
      "upload_session_fk02",
      ["user_id", "hmac_secret_key_version"],
      "hmac_secret_key",
      ["user_id", "version"],
    )
    .execute();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async (db: Kysely<any>) => {
  await db.schema.dropTable("upload_session").execute();
  await db.schema
    .alterTable("file")
    .alterColumn("encrypted_content_iv", (col) => col.setNotNull())
    .execute();
};
