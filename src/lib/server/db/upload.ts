import { sql } from "kysely";
import { IntegrityError } from "./error";
import db from "./kysely";
import type { Ciphertext } from "./schema";

interface UploadSession {
  id: string;
  userId: number;
  totalChunks: number;
  uploadedChunks: number[];
  expiresAt: Date;

  parentId: DirectoryId;
  mekVersion: number;
  encDek: string;
  dekVersion: Date;
  hskVersion: number | null;
  contentType: string;
  encName: Ciphertext;
  encCreatedAt: Ciphertext | null;
  encLastModifiedAt: Ciphertext;
}

export const createUploadSession = async (params: Omit<UploadSession, "id" | "uploadedChunks">) => {
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

    const { sessionId } = await trx
      .insertInto("upload_session")
      .values({
        user_id: params.userId,
        total_chunks: params.totalChunks,
        expires_at: params.expiresAt,
        parent_id: params.parentId !== "root" ? params.parentId : null,
        master_encryption_key_version: params.mekVersion,
        encrypted_data_encryption_key: params.encDek,
        data_encryption_key_version: params.dekVersion,
        hmac_secret_key_version: params.hskVersion,
        content_type: params.contentType,
        encrypted_name: params.encName,
        encrypted_created_at: params.encCreatedAt,
        encrypted_last_modified_at: params.encLastModifiedAt,
      })
      .returning("id as sessionId")
      .executeTakeFirstOrThrow();
    return { id: sessionId };
  });
};

export const getUploadSession = async (sessionId: string, userId: number) => {
  const session = await db
    .selectFrom("upload_session")
    .selectAll()
    .where("id", "=", sessionId)
    .where("user_id", "=", userId)
    .where("expires_at", ">", new Date())
    .limit(1)
    .executeTakeFirst();
  return session
    ? ({
        id: session.id,
        userId: session.user_id,
        totalChunks: session.total_chunks,
        uploadedChunks: session.uploaded_chunks,
        expiresAt: session.expires_at,
        parentId: session.parent_id ?? "root",
        mekVersion: session.master_encryption_key_version,
        encDek: session.encrypted_data_encryption_key,
        dekVersion: session.data_encryption_key_version,
        hskVersion: session.hmac_secret_key_version,
        contentType: session.content_type,
        encName: session.encrypted_name,
        encCreatedAt: session.encrypted_created_at,
        encLastModifiedAt: session.encrypted_last_modified_at,
      } satisfies UploadSession)
    : null;
};

export const markChunkAsUploaded = async (sessionId: string, chunkIndex: number) => {
  await db
    .updateTable("upload_session")
    .set({ uploaded_chunks: sql`array_append(uploaded_chunks, ${chunkIndex})` })
    .where("id", "=", sessionId)
    .execute();
};

export const deleteUploadSession = async (trx: typeof db, sessionId: string) => {
  await trx.deleteFrom("upload_session").where("id", "=", sessionId).execute();
};

export const cleanupExpiredUploadSessions = async () => {
  const sessions = await db
    .deleteFrom("upload_session")
    .where("expires_at", "<", new Date())
    .returning("id")
    .execute();
  return sessions.map(({ id }) => id);
};
