import pg from "pg";
import { IntegrityError } from "./error";
import db from "./kysely";
import type { UserClientState } from "./schema";

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

interface UserClientWithDetails extends UserClient {
  encPubKey: string;
  sigPubKey: string;
}

export const createClient = async (encPubKey: string, sigPubKey: string, userId: number) => {
  return await db
    .transaction()
    .setIsolationLevel("serializable")
    .execute(async (trx) => {
      const client = await trx
        .selectFrom("client")
        .where((eb) =>
          eb.or([
            eb("encryption_public_key", "=", encPubKey),
            eb("encryption_public_key", "=", sigPubKey),
            eb("signature_public_key", "=", encPubKey),
            eb("signature_public_key", "=", sigPubKey),
          ]),
        )
        .limit(1)
        .executeTakeFirst();
      if (client) {
        throw new IntegrityError("Public key(s) already registered");
      }

      const { clientId } = await trx
        .insertInto("client")
        .values({ encryption_public_key: encPubKey, signature_public_key: sigPubKey })
        .returning("id as clientId")
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("user_client")
        .values({ user_id: userId, client_id: clientId })
        .execute();
      return { id: clientId };
    });
};

export const getClient = async (clientId: number) => {
  const client = await db
    .selectFrom("client")
    .selectAll()
    .where("id", "=", clientId)
    .limit(1)
    .executeTakeFirst();
  return client
    ? ({
        id: client.id,
        encPubKey: client.encryption_public_key,
        sigPubKey: client.signature_public_key,
      } satisfies Client)
    : null;
};

export const getClientByPubKeys = async (encPubKey: string, sigPubKey: string) => {
  const client = await db
    .selectFrom("client")
    .selectAll()
    .where("encryption_public_key", "=", encPubKey)
    .where("signature_public_key", "=", sigPubKey)
    .limit(1)
    .executeTakeFirst();
  return client
    ? ({
        id: client.id,
        encPubKey: client.encryption_public_key,
        sigPubKey: client.signature_public_key,
      } satisfies Client)
    : null;
};

export const createUserClient = async (userId: number, clientId: number) => {
  try {
    await db.insertInto("user_client").values({ user_id: userId, client_id: clientId }).execute();
  } catch (e) {
    if (e instanceof pg.DatabaseError && e.code === "23505") {
      throw new IntegrityError("User client already exists");
    }
    throw e;
  }
};

export const getAllUserClients = async (userId: number) => {
  const userClients = await db
    .selectFrom("user_client")
    .selectAll()
    .where("user_id", "=", userId)
    .execute();
  return userClients.map(
    ({ user_id, client_id, state }) =>
      ({
        userId: user_id,
        clientId: client_id,
        state,
      }) satisfies UserClient,
  );
};

export const getUserClient = async (userId: number, clientId: number) => {
  const userClient = await db
    .selectFrom("user_client")
    .selectAll()
    .where("user_id", "=", userId)
    .where("client_id", "=", clientId)
    .limit(1)
    .executeTakeFirst();
  return userClient
    ? ({
        userId: userClient.user_id,
        clientId: userClient.client_id,
        state: userClient.state,
      } satisfies UserClient)
    : null;
};

export const getUserClientWithDetails = async (userId: number, clientId: number) => {
  const userClient = await db
    .selectFrom("user_client")
    .innerJoin("client", "user_client.client_id", "client.id")
    .selectAll()
    .where("user_id", "=", userId)
    .where("client_id", "=", clientId)
    .limit(1)
    .executeTakeFirst();
  return userClient
    ? ({
        userId: userClient.user_id,
        clientId: userClient.client_id,
        state: userClient.state,
        encPubKey: userClient.encryption_public_key,
        sigPubKey: userClient.signature_public_key,
      } satisfies UserClientWithDetails)
    : null;
};

export const setUserClientStateToPending = async (userId: number, clientId: number) => {
  await db
    .updateTable("user_client")
    .set({ state: "pending" })
    .where("user_id", "=", userId)
    .where("client_id", "=", clientId)
    .where("state", "=", "challenging")
    .execute();
};

export const setUserClientStateToActive = async (userId: number, clientId: number) => {
  await db
    .updateTable("user_client")
    .set({ state: "active" })
    .where("user_id", "=", userId)
    .where("client_id", "=", clientId)
    .where("state", "=", "pending")
    .execute();
};

export const registerUserClientChallenge = async (
  userId: number,
  clientId: number,
  answer: string,
  allowedIp: string,
  expiresAt: Date,
) => {
  const { id } = await db
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
  challengeId: number,
  userId: number,
  ip: string,
) => {
  const challenge = await db
    .deleteFrom("user_client_challenge")
    .where("id", "=", challengeId)
    .where("user_id", "=", userId)
    .where("allowed_ip", "=", ip)
    .where("expires_at", ">", new Date())
    .returning(["client_id", "answer"])
    .executeTakeFirst();
  return challenge ? { clientId: challenge.client_id, answer: challenge.answer } : null;
};

export const cleanupExpiredUserClientChallenges = async () => {
  await db.deleteFrom("user_client_challenge").where("expires_at", "<=", new Date()).execute();
};
