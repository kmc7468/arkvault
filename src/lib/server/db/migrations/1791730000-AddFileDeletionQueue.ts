import { Kysely } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async (db: Kysely<any>) => {
  // fileDeletion.ts
  await db.schema
    .createTable("file_deletion_queue")
    .addColumn("id", "integer", (col) => col.primaryKey().generatedAlwaysAsIdentity())
    .addColumn("path", "text", (col) => col.notNull())
    .addColumn("enqueued_at", "timestamp(3)", (col) => col.notNull())
    .execute();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async (db: Kysely<any>) => {
  await db.schema.dropTable("file_deletion_queue").execute();
};
