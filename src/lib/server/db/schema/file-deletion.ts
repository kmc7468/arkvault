import type { ColumnType, Generated } from "kysely";

export interface FileDeletionQueueTable {
  id: Generated<number>;
  path: string;
  enqueued_at: ColumnType<Date, Date, never>;
}

declare module "./index" {
  interface Database {
    file_deletion_queue: FileDeletionQueueTable;
  }
}
