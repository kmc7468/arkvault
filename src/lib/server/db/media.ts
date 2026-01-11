import type { NotNull } from "kysely";
import { IntegrityError } from "./error";
import db from "./kysely";

interface Thumbnail {
  id: number;
  path: string;
  updatedAt: Date;
  encContentIv: string | null;
}

interface FileThumbnail extends Thumbnail {
  fileId: number;
}

export const updateFileThumbnail = async (
  userId: number,
  fileId: number,
  dekVersion: Date,
  path: string,
  encContentIv: string | null,
) => {
  return await db.transaction().execute(async (trx) => {
    const file = await trx
      .selectFrom("file")
      .select("data_encryption_key_version")
      .where("id", "=", fileId)
      .where("user_id", "=", userId)
      .limit(1)
      .forUpdate()
      .executeTakeFirst();
    if (!file) {
      throw new IntegrityError("File not found");
    } else if (file.data_encryption_key_version.getTime() !== dekVersion.getTime()) {
      throw new IntegrityError("Invalid DEK version");
    }

    const thumbnail = await trx
      .selectFrom("thumbnail")
      .select("path as oldPath")
      .where("file_id", "=", fileId)
      .limit(1)
      .forUpdate()
      .executeTakeFirst();
    const now = new Date();

    await trx
      .insertInto("thumbnail")
      .values({
        file_id: fileId,
        path,
        updated_at: now,
        encrypted_content_iv: encContentIv,
      })
      .onConflict((oc) =>
        oc.column("file_id").doUpdateSet({
          path,
          updated_at: now,
          encrypted_content_iv: encContentIv,
        }),
      )
      .execute();
    return thumbnail?.oldPath ?? null;
  });
};

export const getFileThumbnail = async (userId: number, fileId: number) => {
  const thumbnail = await db
    .selectFrom("thumbnail")
    .innerJoin("file", "thumbnail.file_id", "file.id")
    .selectAll("thumbnail")
    .where("file.id", "=", fileId)
    .where("file.user_id", "=", userId)
    .$narrowType<{ file_id: NotNull }>()
    .limit(1)
    .executeTakeFirst();
  return thumbnail
    ? ({
        id: thumbnail.id,
        fileId: thumbnail.file_id,
        path: thumbnail.path,
        encContentIv: thumbnail.encrypted_content_iv,
        updatedAt: thumbnail.updated_at,
      } satisfies FileThumbnail)
    : null;
};

export const getMissingFileThumbnails = async (userId: number, limit: number = 100) => {
  const files = await db
    .selectFrom("file")
    .select("id")
    .where("user_id", "=", userId)
    .where((eb) =>
      eb.or([eb("content_type", "like", "image/%"), eb("content_type", "like", "video/%")]),
    )
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("thumbnail")
            .select("thumbnail.id")
            .whereRef("thumbnail.file_id", "=", "file.id")
            .limit(1),
        ),
      ),
    )
    .limit(limit)
    .execute();
  return files.map(({ id }) => id);
};
