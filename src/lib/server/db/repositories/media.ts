import type { Executor, Tx } from "../executor.ts";

interface FileThumbnail {
  id: number;
  fileId: number;
  path: string;
  updatedAt: Date;
  encContentIv: string | null;
}

export const getFileThumbnail = async (executor: Executor, userId: number, fileId: number) => {
  const thumbnail = await executor
    .selectFrom("thumbnail")
    .innerJoin("file", "thumbnail.file_id", "file.id")
    .select([
      "thumbnail.id",
      "thumbnail.path",
      "thumbnail.updated_at",
      "thumbnail.encrypted_content_iv",
    ])
    .where("file.id", "=", fileId)
    .where("file.user_id", "=", userId)
    .limit(1)
    .executeTakeFirst();
  return thumbnail
    ? ({
        id: thumbnail.id,
        fileId,
        path: thumbnail.path,
        updatedAt: thumbnail.updated_at,
        encContentIv: thumbnail.encrypted_content_iv,
      } satisfies FileThumbnail)
    : null;
};

// Locks the thumbnail of the file to replace it, and returns its path if any
export const lockFileThumbnailPath = async (trx: Tx, fileId: number) => {
  const thumbnail = await trx
    .selectFrom("thumbnail")
    .select("path")
    .where("file_id", "=", fileId)
    .limit(1)
    .forUpdate()
    .executeTakeFirst();
  return thumbnail?.path ?? null;
};

export const upsertFileThumbnail = async (
  executor: Executor,
  fileId: number,
  path: string,
  encContentIv: string | null,
) => {
  const values = { path, updated_at: new Date(), encrypted_content_iv: encContentIv };
  await executor
    .insertInto("thumbnail")
    .values({ file_id: fileId, ...values })
    .onConflict((oc) => oc.column("file_id").doUpdateSet(values))
    .execute();
};
