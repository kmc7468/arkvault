import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async (db: Kysely<any>) => {
  // file.ts
  await db.schema
    .alterTable("directory")
    .addColumn("is_favorite", "boolean", (col) => col.notNull().defaultTo(false))
    .execute();
  await db.schema
    .alterTable("file")
    .addColumn("is_favorite", "boolean", (col) => col.notNull().defaultTo(false))
    .execute();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async (db: Kysely<any>) => {
  await db
    .deleteFrom("file_log")
    .where("action", "in", ["add-to-favorites", "remove-from-favorites"])
    .execute();
  await db
    .deleteFrom("directory_log")
    .where("action", "in", ["add-to-favorites", "remove-from-favorites"])
    .execute();

  await db.schema.alterTable("file").dropColumn("is_favorite").execute();
  await db.schema.alterTable("directory").dropColumn("is_favorite").execute();
};
