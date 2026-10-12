import type { Insertable } from "kysely";
import type { Executor } from "../executor.ts";
import type {
  CategoryLogTable,
  DirectoryLogTable,
  FileLogTable,
  HskLogTable,
  MekLogTable,
} from "../schema/index.ts";

// Audit logs of changes, timestamped when appended

type NewLog<T> = Omit<Insertable<T>, "id" | "timestamp">;

export const appendDirectoryLog = async (executor: Executor, log: NewLog<DirectoryLogTable>) => {
  await executor
    .insertInto("directory_log")
    .values({ ...log, timestamp: new Date() })
    .execute();
};

export const appendFileLog = async (executor: Executor, log: NewLog<FileLogTable>) => {
  await executor
    .insertInto("file_log")
    .values({ ...log, timestamp: new Date() })
    .execute();
};

export const appendCategoryLog = async (executor: Executor, log: NewLog<CategoryLogTable>) => {
  await executor
    .insertInto("category_log")
    .values({ ...log, timestamp: new Date() })
    .execute();
};

export const appendMekLog = async (executor: Executor, log: NewLog<MekLogTable>) => {
  await executor
    .insertInto("master_encryption_key_log")
    .values({ ...log, timestamp: new Date() })
    .execute();
};

export const appendHskLog = async (executor: Executor, log: NewLog<HskLogTable>) => {
  await executor
    .insertInto("hmac_secret_key_log")
    .values({ ...log, timestamp: new Date() })
    .execute();
};
