import type { Executor } from "../executor.ts";

// Paths are enqueued in the transaction which deletes the files from the database, and the files
// are deleted from the storage after it is committed
export const enqueueFileDeletions = async (
  executor: Executor,
  paths: (string | null | undefined)[],
) => {
  const values = paths
    .filter((path) => !!path)
    .map((path) => ({ path: path!, enqueued_at: new Date() }));
  if (values.length > 0) {
    await executor.insertInto("file_deletion_queue").values(values).execute();
  }
};

export const getPendingFileDeletions = async (executor: Executor, limit: number) => {
  return await executor
    .selectFrom("file_deletion_queue")
    .select(["id", "path"])
    .orderBy("id")
    .limit(limit)
    .execute();
};

export const completeFileDeletions = async (executor: Executor, ids: number[]) => {
  if (ids.length > 0) {
    await executor.deleteFrom("file_deletion_queue").where("id", "in", ids).execute();
  }
};
