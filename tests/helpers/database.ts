import { sql } from "kysely";
import db from "#lib/server/db/kysely.js";

export const resetDatabase = async () => {
  const { rows } = await sql<{ tablename: string }>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE 'kysely_%'
  `.execute(db);
  await sql`TRUNCATE ${sql.join(rows.map(({ tablename }) => sql.table(tablename)))} RESTART IDENTITY CASCADE`.execute(
    db,
  );
};

let sequence = 0;

const nextSequence = () => ++sequence;

export const createUser = async () => {
  const n = nextSequence();
  const { id: userId } = await db
    .insertInto("user")
    .values({ email: `user${n}@example.com`, nickname: `user${n}`, password: "password" })
    .returning("id")
    .executeTakeFirstOrThrow();
  const { id: clientId } = await db
    .insertInto("client")
    .values({ encryption_public_key: `enc${n}`, signature_public_key: `sig${n}` })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db
    .insertInto("user_client")
    .values({ user_id: userId, client_id: clientId, state: "active" })
    .execute();
  await db
    .insertInto("master_encryption_key")
    .values({ user_id: userId, version: 1, state: "active" })
    .execute();
  return { userId, clientId };
};

export const ciphertext = (value = "ciphertext") => ({ ciphertext: value, iv: "iv" });

export const createDirectory = async (userId: number, parentId: DirectoryId = "root") => {
  const n = nextSequence();
  const { id } = await db
    .insertInto("directory")
    .values({
      parent_id: parentId === "root" ? null : parentId,
      user_id: userId,
      master_encryption_key_version: 1,
      encrypted_data_encryption_key: `dek${n}`,
      data_encryption_key_version: new Date(),
      encrypted_name: ciphertext(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return id;
};

export const createCategory = async (userId: number, parentId: CategoryId = "root") => {
  const n = nextSequence();
  const { id } = await db
    .insertInto("category")
    .values({
      parent_id: parentId === "root" ? null : parentId,
      user_id: userId,
      master_encryption_key_version: 1,
      encrypted_data_encryption_key: `dek${n}`,
      data_encryption_key_version: new Date(),
      encrypted_name: ciphertext(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return id;
};

export const newEntryParams = (userId: number, parentId: number | "root") => ({
  userId,
  parentId,
  mekVersion: 1,
  encDek: `dek${nextSequence()}`,
  dekVersion: new Date(),
  encName: ciphertext(),
});

export const createFile = async (userId: number, parentId: DirectoryId, path: string) => {
  const n = nextSequence();
  const { id } = await db
    .insertInto("file")
    .values({
      parent_id: parentId === "root" ? null : parentId,
      user_id: userId,
      path,
      master_encryption_key_version: 1,
      encrypted_data_encryption_key: `dek${n}`,
      data_encryption_key_version: new Date(),
      hmac_secret_key_version: null,
      content_hmac: null,
      content_type: "image/png",
      encrypted_content_iv: null,
      encrypted_content_hash: "hash",
      encrypted_name: ciphertext(),
      encrypted_created_at: null,
      encrypted_last_modified_at: ciphertext(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return id;
};

export const getQueuedDeletions = async () => {
  const rows = await db.selectFrom("file_deletion_queue").select("path").execute();
  return rows.map(({ path }) => path).sort();
};
