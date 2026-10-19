import type { Executor, Tx } from "../executor.ts";

// Locks the active version until the transaction ends, so that it isn't retired in the meantime
export const lockActiveMekVersion = async (trx: Tx, userId: number) => {
  const mek = await trx
    .selectFrom("master_encryption_key")
    .select("version")
    .where("user_id", "=", userId)
    .where("state", "=", "active")
    .limit(1)
    .forUpdate()
    .executeTakeFirst();
  return mek?.version ?? null;
};

// Violates a unique constraint if the user already has a master key
export const createInitialMek = async (
  trx: Tx,
  userId: number,
  clientId: number,
  encMek: string,
  encMekSig: string,
) => {
  await trx
    .insertInto("master_encryption_key")
    .values({ user_id: userId, version: 1, state: "active" })
    .execute();
  await trx
    .insertInto("client_master_encryption_key")
    .values({
      user_id: userId,
      client_id: clientId,
      version: 1,
      encrypted_key: encMek,
      encrypted_key_signature: encMekSig,
    })
    .execute();
  return { version: 1 };
};

export const getAllValidClientMeks = async (
  executor: Executor,
  userId: number,
  clientId: number,
) => {
  const clientMeks = await executor
    .selectFrom("client_master_encryption_key")
    .innerJoin("master_encryption_key", (join) =>
      join
        .onRef("client_master_encryption_key.user_id", "=", "master_encryption_key.user_id")
        .onRef("client_master_encryption_key.version", "=", "master_encryption_key.version"),
    )
    .select([
      "client_master_encryption_key.version",
      "state",
      "encrypted_key",
      "encrypted_key_signature",
    ])
    .where("client_master_encryption_key.user_id", "=", userId)
    .where("client_master_encryption_key.client_id", "=", clientId)
    .where("state", "in", ["active", "retired"])
    .execute();
  return clientMeks.map(({ version, state, encrypted_key, encrypted_key_signature }) => ({
    version,
    state: state as "active" | "retired",
    encMek: encrypted_key,
    encMekSig: encrypted_key_signature,
  }));
};
