import { FileDeletionRepo, db } from "#lib/server/db/index.ts";
import { deleteFile } from "#lib/server/storage/index.ts";

const BATCH_SIZE = 100;

// Deletes files enqueued by committed transactions. Failed deletions are retried later.
export const processPendingFileDeletions = async () => {
  while (true) {
    const deletions = await FileDeletionRepo.getPendingFileDeletions(db, BATCH_SIZE);
    if (deletions.length === 0) return;

    const results = await Promise.allSettled(deletions.map(({ path }) => deleteFile(path)));
    const deletedIds = deletions
      .filter((_, i) => results[i]!.status === "fulfilled")
      .map(({ id }) => id);
    results.forEach((result) => {
      if (result.status === "rejected") console.error(result.reason);
    });

    await FileDeletionRepo.completeFileDeletions(db, deletedIds);
    if (deletedIds.length < deletions.length) return; // Retry later
  }
};

let processing: Promise<void> | undefined;
let isRequestedAgain = false;

export const schedulePendingFileDeletions = () => {
  if (processing) {
    isRequestedAgain = true;
    return;
  }

  processing = (async () => {
    do {
      isRequestedAgain = false;
      await processPendingFileDeletions();
    } while (isRequestedAgain);
  })()
    .catch(console.error)
    .finally(() => {
      processing = undefined;
    });
};
