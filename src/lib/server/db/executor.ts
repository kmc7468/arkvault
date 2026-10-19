import type { IsolationLevel, Kysely, Transaction } from "kysely";
import pg from "pg";
import db from "./kysely.ts";
import type { Database } from "./schema/index.ts";

// Runs queries either directly or in a transaction
export type Executor = Kysely<Database>;
// Required by queries that only make sense in a transaction (e.g. locking rows)
export type Tx = Transaction<Database>;

const isDatabaseError = (e: unknown, code: string): e is pg.DatabaseError => {
  return e instanceof pg.DatabaseError && e.code === code;
};

// `constraint` narrows down the violated constraint if a query may violate several of them
export const isUniqueViolation = (e: unknown, constraint?: string) => {
  return isDatabaseError(e, "23505") && (!constraint || e.constraint === constraint);
};

export const isForeignKeyViolation = (e: unknown) => isDatabaseError(e, "23503");

// Serialization failures and deadlocks succeed if the transaction is retried
const isRetryable = (e: unknown) => isDatabaseError(e, "40001") || isDatabaseError(e, "40P01");

export const transaction = async <T>(
  callback: (trx: Tx) => Promise<T>,
  { isolationLevel, maxRetries = 3 }: { isolationLevel?: IsolationLevel; maxRetries?: number } = {},
) => {
  for (let attempt = 0; ; attempt++) {
    try {
      const builder = db.transaction();
      return await (isolationLevel ? builder.setIsolationLevel(isolationLevel) : builder).execute(
        callback,
      );
    } catch (e) {
      if (!isRetryable(e) || attempt >= maxRetries) throw e;
    }
  }
};
