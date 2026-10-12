import type { Selectable } from "kysely";
import type { Executor } from "../executor.ts";
import type { ClientTable, UserClientState, UserClientTable } from "../schema/index.ts";

interface Client {
  id: number;
  encPubKey: string;
  sigPubKey: string;
}

interface UserClient {
  userId: number;
  clientId: number;
  state: UserClientState;
}

const toClient = (row: Selectable<ClientTable>): Client => ({
  id: row.id,
  encPubKey: row.encryption_public_key,
  sigPubKey: row.signature_public_key,
});

const toUserClient = (row: Selectable<UserClientTable>): UserClient => ({
  userId: row.user_id,
  clientId: row.client_id,
  state: row.state,
});

// Whether any of the keys is used by a client as either of its keys
export const isAnyPublicKeyRegistered = async (
  executor: Executor,
  encPubKey: string,
  sigPubKey: string,
) => {
  const client = await executor
    .selectFrom("client")
    .select("id")
    .where((eb) =>
      eb.or([
        eb("encryption_public_key", "in", [encPubKey, sigPubKey]),
        eb("signature_public_key", "in", [encPubKey, sigPubKey]),
      ]),
    )
    .limit(1)
    .executeTakeFirst();
  return !!client;
};

export const createClient = async (executor: Executor, encPubKey: string, sigPubKey: string) => {
  const { id } = await executor
    .insertInto("client")
    .values({ encryption_public_key: encPubKey, signature_public_key: sigPubKey })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { id };
};

export const getClient = async (executor: Executor, clientId: number) => {
  const client = await executor
    .selectFrom("client")
    .selectAll()
    .where("id", "=", clientId)
    .limit(1)
    .executeTakeFirst();
  return client ? toClient(client) : null;
};

export const getClientByPubKeys = async (
  executor: Executor,
  encPubKey: string,
  sigPubKey: string,
) => {
  const client = await executor
    .selectFrom("client")
    .selectAll()
    .where("encryption_public_key", "=", encPubKey)
    .where("signature_public_key", "=", sigPubKey)
    .limit(1)
    .executeTakeFirst();
  return client ? toClient(client) : null;
};

// Violates a unique constraint if the user already has the client
export const createUserClient = async (executor: Executor, userId: number, clientId: number) => {
  await executor
    .insertInto("user_client")
    .values({ user_id: userId, client_id: clientId })
    .execute();
};

export const getUserClient = async (executor: Executor, userId: number, clientId: number) => {
  const userClient = await executor
    .selectFrom("user_client")
    .selectAll()
    .where("user_id", "=", userId)
    .where("client_id", "=", clientId)
    .limit(1)
    .executeTakeFirst();
  return userClient ? toUserClient(userClient) : null;
};

// Returns whether the state has changed, which fails if the client isn't in the `from` state
export const transitionUserClientState = async (
  executor: Executor,
  userId: number,
  clientId: number,
  { from, to }: { from: UserClientState; to: UserClientState },
) => {
  const { numUpdatedRows } = await executor
    .updateTable("user_client")
    .set({ state: to })
    .where("user_id", "=", userId)
    .where("client_id", "=", clientId)
    .where("state", "=", from)
    .executeTakeFirst();
  return numUpdatedRows > 0n;
};

export const createUserClientChallenge = async (
  executor: Executor,
  userId: number,
  clientId: number,
  answer: string,
  allowedIp: string,
  expiresAt: Date,
) => {
  const { id } = await executor
    .insertInto("user_client_challenge")
    .values({
      user_id: userId,
      client_id: clientId,
      answer,
      allowed_ip: allowedIp,
      expires_at: expiresAt,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { id };
};

export const consumeUserClientChallenge = async (
  executor: Executor,
  challengeId: number,
  userId: number,
  ip: string,
) => {
  const challenge = await executor
    .deleteFrom("user_client_challenge")
    .where("id", "=", challengeId)
    .where("user_id", "=", userId)
    .where("allowed_ip", "=", ip)
    .where("expires_at", ">", new Date())
    .returning(["client_id", "answer"])
    .executeTakeFirst();
  return challenge ? { clientId: challenge.client_id, answer: challenge.answer } : null;
};

export const deleteExpiredUserClientChallenges = async (executor: Executor) => {
  await executor
    .deleteFrom("user_client_challenge")
    .where("expires_at", "<=", new Date())
    .execute();
};
