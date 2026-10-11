import db from "../kysely";

export const enqueueFileDeletions = async (
  trx: typeof db,
  paths: (string | null | undefined)[],
) => {
  const values = paths
    .filter((path) => !!path)
    .map((path) => ({ path: path!, enqueued_at: new Date() }));
  if (values.length > 0) {
    await trx.insertInto("file_deletion_queue").values(values).execute();
  }
};

export const getPendingFileDeletions = async (limit: number) => {
  return await db
    .selectFrom("file_deletion_queue")
    .select(["id", "path"])
    .orderBy("id")
    .limit(limit)
    .execute();
};

export const completeFileDeletions = async (ids: number[]) => {
  if (ids.length > 0) {
    await db.deleteFrom("file_deletion_queue").where("id", "in", ids).execute();
  }
};
