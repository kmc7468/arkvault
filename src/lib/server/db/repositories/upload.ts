import { sql, type Selectable } from "kysely";
import { IntegrityError } from "../error.ts";
import db from "../kysely.ts";
import type { Ciphertext, UploadSessionTable } from "../schema/index.ts";
import { ensureDirectoryExists } from "./directory.ts";
import { enqueueFileDeletions } from "./file-deletion.ts";
import { lockActiveHskVersion } from "./hsk.ts";
import { lockActiveMekVersion } from "./mek.ts";

interface BaseUploadSession {
  id: string;
  userId: number;
  path: string;
  bitmap: Buffer;
  totalChunks: number;
  uploadedChunks: number;
  expiresAt: Date;
}

interface FileUploadSession extends BaseUploadSession {
  type: "file";
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

interface ThumbnailUploadSession extends BaseUploadSession {
  type: "thumbnail";
  fileId: number;
  dekVersion: Date;
}

export const createFileUploadSession = async (
  params: Omit<FileUploadSession, "type" | "bitmap" | "uploadedChunks">,
) => {
  await db.transaction().execute(async (trx) => {
    if ((await lockActiveMekVersion(trx, params.userId)) !== params.mekVersion) {
      throw new IntegrityError("Inactive MEK version");
    }

    if (params.hskVersion) {
      if ((await lockActiveHskVersion(trx, params.userId)) !== params.hskVersion) {
        throw new IntegrityError("Inactive HSK version");
      }
    }

    await ensureDirectoryExists(trx, params.userId, params.parentId);

    await trx
      .insertInto("upload_session")
      .values({
        id: params.id,
        type: "file",
        user_id: params.userId,
        path: params.path,
        bitmap: Buffer.alloc(Math.ceil(params.totalChunks / 8)),
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
      .execute();
  });
};

export const createThumbnailUploadSession = async (
  params: Omit<ThumbnailUploadSession, "bitmap" | "uploadedChunks">,
) => {
  await db.transaction().execute(async (trx) => {
    const file = await trx
      .selectFrom("file")
      .select("data_encryption_key_version")
      .where("id", "=", params.fileId)
      .where("user_id", "=", params.userId)
      .limit(1)
      .forUpdate()
      .executeTakeFirst();
    if (!file) {
      throw new IntegrityError("File not found");
    } else if (file.data_encryption_key_version.getTime() !== params.dekVersion.getTime()) {
      throw new IntegrityError("Invalid DEK version");
    }

    await trx
      .insertInto("upload_session")
      .values({
        id: params.id,
        type: params.type,
        user_id: params.userId,
        path: params.path,
        bitmap: Buffer.alloc(Math.ceil(params.totalChunks / 8)),
        total_chunks: params.totalChunks,
        expires_at: params.expiresAt,
        file_id: params.fileId,
        data_encryption_key_version: params.dekVersion,
      })
      .execute();
  });
};

const toUploadSession = (session: Selectable<UploadSessionTable>) => {
  if (session.type === "file") {
    return {
      type: "file",
      id: session.id,
      userId: session.user_id,
      path: session.path,
      bitmap: session.bitmap,
      totalChunks: session.total_chunks,
      uploadedChunks: session.uploaded_chunks,
      expiresAt: session.expires_at,
      parentId: session.parent_id ?? "root",
      mekVersion: session.master_encryption_key_version!,
      encDek: session.encrypted_data_encryption_key!,
      dekVersion: session.data_encryption_key_version!,
      hskVersion: session.hmac_secret_key_version,
      contentType: session.content_type!,
      encName: session.encrypted_name!,
      encCreatedAt: session.encrypted_created_at,
      encLastModifiedAt: session.encrypted_last_modified_at!,
    } satisfies FileUploadSession;
  } else {
    return {
      type: session.type,
      id: session.id,
      userId: session.user_id,
      path: session.path,
      bitmap: session.bitmap,
      totalChunks: session.total_chunks,
      uploadedChunks: session.uploaded_chunks,
      expiresAt: session.expires_at,
      fileId: session.file_id!,
      dekVersion: session.data_encryption_key_version!,
    } satisfies ThumbnailUploadSession;
  }
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
  return session ? toUploadSession(session) : null;
};

// Locks the session until the transaction ends so that it can be completed only once
export const lockUploadSession = async (trx: typeof db, sessionId: string, userId: number) => {
  const session = await trx
    .selectFrom("upload_session")
    .selectAll()
    .where("id", "=", sessionId)
    .where("user_id", "=", userId)
    .where("expires_at", ">", new Date())
    .limit(1)
    .forUpdate()
    .executeTakeFirst();
  if (!session) {
    throw new IntegrityError("Upload session not found");
  }
  return toUploadSession(session);
};

export const markChunkAsUploaded = async (sessionId: string, chunkIndex: number) => {
  await db
    .updateTable("upload_session")
    .set({
      bitmap: sql`set_bit(${sql.ref("bitmap")}, ${chunkIndex - 1}, 1)`,
    })
    .where("id", "=", sessionId)
    .execute();
};

export const deleteUploadSession = async (trx: typeof db, sessionId: string) => {
  await trx.deleteFrom("upload_session").where("id", "=", sessionId).execute();
};

export const discardUploadSession = async (sessionId: string) => {
  await db.transaction().execute(async (trx) => {
    const sessions = await trx
      .deleteFrom("upload_session")
      .where("id", "=", sessionId)
      .returning("path")
      .execute();
    await enqueueFileDeletions(
      trx,
      sessions.map(({ path }) => path),
    );
  });
};

export const cleanupExpiredUploadSessions = async () => {
  await db.transaction().execute(async (trx) => {
    const sessions = await trx
      .deleteFrom("upload_session")
      .where("expires_at", "<=", new Date())
      .returning("path")
      .execute();
    await enqueueFileDeletions(
      trx,
      sessions.map(({ path }) => path),
    );
  });
};
