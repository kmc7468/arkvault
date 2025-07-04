import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async (db: Kysely<any>) => {
  // media.ts
  await db.schema
    .createTable("thumbnail")
    .addColumn("id", "integer", (col) => col.primaryKey().generatedAlwaysAsIdentity())
    .addColumn("directory_id", "integer", (col) =>
      col.references("directory.id").onDelete("cascade").unique(),
    )
    .addColumn("file_id", "integer", (col) =>
      col.references("file.id").onDelete("cascade").unique(),
    )
    .addColumn("category_id", "integer", (col) =>
      col.references("category.id").onDelete("cascade").unique(),
    )
    .addColumn("path", "text", (col) => col.unique().notNull())
    .addColumn("updated_at", "timestamp(3)", (col) => col.notNull())
    .addColumn("encrypted_content_iv", "text", (col) => col.notNull())
    .addCheckConstraint(
      "thumbnail_ck01",
      sql`(file_id IS NOT NULL)::integer + (directory_id IS NOT NULL)::integer + (category_id IS NOT NULL)::integer = 1`,
    )
    .execute();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async (db: Kysely<any>) => {
  await db.schema.dropTable("thumbnail").execute();
};
