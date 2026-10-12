import type { Executor, Tx } from "../executor.ts";

// Locks the active version until the transaction ends, so that it isn't retired in the meantime
export const lockActiveHskVersion = async (trx: Tx, userId: number) => {
  const hsk = await trx
    .selectFrom("hmac_secret_key")
    .select("version")
    .where("user_id", "=", userId)
    .where("state", "=", "active")
    .limit(1)
    .forUpdate()
    .executeTakeFirst();
  return hsk?.version ?? null;
};

// Violates a unique constraint if the user already has an HMAC secret key
export const createInitialHsk = async (
  executor: Executor,
  userId: number,
  mekVersion: number,
  encHsk: string,
) => {
  await executor
    .insertInto("hmac_secret_key")
    .values({
      user_id: userId,
      version: 1,
      state: "active",
      master_encryption_key_version: mekVersion,
      encrypted_key: encHsk,
    })
    .execute();
  return { version: 1 };
};

export const getAllValidHsks = async (executor: Executor, userId: number) => {
  const hsks = await executor
    .selectFrom("hmac_secret_key")
    .select(["version", "state", "master_encryption_key_version", "encrypted_key"])
    .where("user_id", "=", userId)
    .where("state", "=", "active")
    .execute();
  return hsks.map(({ version, state, master_encryption_key_version, encrypted_key }) => ({
    version,
    state,
    mekVersion: master_encryption_key_version,
    encHsk: encrypted_key,
  }));
};
