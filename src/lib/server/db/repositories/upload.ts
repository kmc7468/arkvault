import { sql, type Selectable } from "kysely";
import type { Executor, Tx } from "../executor.ts";
import { decodeParentId, encodeParentId } from "../queries.ts";
import type { Ciphertext, UploadSessionTable } from "../schema/index.ts";

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

const createBitmap = (totalChunks: number) => Buffer.alloc(Math.ceil(totalChunks / 8));

export const createFileUploadSession = async (
  executor: Executor,
  params: Omit<FileUploadSession, "type" | "bitmap" | "uploadedChunks">,
) => {
  await executor
    .insertInto("upload_session")
    .values({
      id: params.id,
      type: "file",
      user_id: params.userId,
      path: params.path,
      bitmap: createBitmap(params.totalChunks),
      total_chunks: params.totalChunks,
      expires_at: params.expiresAt,
      parent_id: encodeParentId(params.parentId),
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
};

export const createThumbnailUploadSession = async (
  executor: Executor,
  params: Omit<ThumbnailUploadSession, "type" | "bitmap" | "uploadedChunks">,
) => {
  await executor
    .insertInto("upload_session")
    .values({
      id: params.id,
      type: "thumbnail",
      user_id: params.userId,
      path: params.path,
      bitmap: createBitmap(params.totalChunks),
      total_chunks: params.totalChunks,
      expires_at: params.expiresAt,
      file_id: params.fileId,
      data_encryption_key_version: params.dekVersion,
    })
    .execute();
};

const toUploadSession = (
  session: Selectable<UploadSessionTable>,
): FileUploadSession | ThumbnailUploadSession => {
  const base = {
    id: session.id,
    userId: session.user_id,
    path: session.path,
    bitmap: session.bitmap,
    totalChunks: session.total_chunks,
    uploadedChunks: session.uploaded_chunks,
    expiresAt: session.expires_at,
  };
  if (session.type === "file") {
    return {
      ...base,
      type: "file",
      parentId: decodeParentId(session.parent_id),
      mekVersion: session.master_encryption_key_version!,
      encDek: session.encrypted_data_encryption_key!,
      dekVersion: session.data_encryption_key_version!,
      hskVersion: session.hmac_secret_key_version,
      contentType: session.content_type!,
      encName: session.encrypted_name!,
      encCreatedAt: session.encrypted_created_at,
      encLastModifiedAt: session.encrypted_last_modified_at!,
    };
  } else {
    return {
      ...base,
      type: "thumbnail",
      fileId: session.file_id!,
      dekVersion: session.data_encryption_key_version!,
    };
  }
};

const selectActiveUploadSession = (executor: Executor, sessionId: string, userId: number) =>
  executor
    .selectFrom("upload_session")
    .selectAll()
    .where("id", "=", sessionId)
    .where("user_id", "=", userId)
    .where("expires_at", ">", new Date())
    .limit(1);

export const getUploadSession = async (executor: Executor, sessionId: string, userId: number) => {
  const session = await selectActiveUploadSession(executor, sessionId, userId).executeTakeFirst();
  return session ? toUploadSession(session) : null;
};

// Locks the session until the transaction ends so that it can be completed only once
export const lockUploadSession = async (trx: Tx, sessionId: string, userId: number) => {
  const session = await selectActiveUploadSession(trx, sessionId, userId)
    .forUpdate()
    .executeTakeFirst();
  return session ? toUploadSession(session) : null;
};

export const markChunkAsUploaded = async (
  executor: Executor,
  sessionId: string,
  chunkIndex: number,
) => {
  await executor
    .updateTable("upload_session")
    .set({
      bitmap: sql`set_bit(${sql.ref("bitmap")}, ${chunkIndex - 1}, 1)`,
    })
    .where("id", "=", sessionId)
    .execute();
};

// The following functions return the paths of the files uploaded by the deleted sessions

export const deleteUploadSession = async (executor: Executor, sessionId: string) => {
  const sessions = await executor
    .deleteFrom("upload_session")
    .where("id", "=", sessionId)
    .returning("path")
    .execute();
  return sessions.map(({ path }) => path);
};

// Deletes the sessions uploading files into the directories or thumbnails of the files
export const deleteUploadSessionsOf = async (
  executor: Executor,
  { directoryIds = [], fileIds = [] }: { directoryIds?: number[]; fileIds?: number[] },
) => {
  if (directoryIds.length === 0 && fileIds.length === 0) return [];

  const sessions = await executor
    .deleteFrom("upload_session")
    .where((eb) =>
      eb.or([
        ...(directoryIds.length > 0 ? [eb("parent_id", "in", directoryIds)] : []),
        ...(fileIds.length > 0 ? [eb("file_id", "in", fileIds)] : []),
      ]),
    )
    .returning("path")
    .execute();
  return sessions.map(({ path }) => path);
};

export const deleteExpiredUploadSessions = async (executor: Executor) => {
  const sessions = await executor
    .deleteFrom("upload_session")
    .where("expires_at", "<=", new Date())
    .returning("path")
    .execute();
  return sessions.map(({ path }) => path);
};
