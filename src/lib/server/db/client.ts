import { and, eq, gt, lte } from "drizzle-orm";
import db from "./drizzle";
import { client, userClient, userClientChallenge, UserClientState } from "./schema";

export const createClient = async (pubKey: string, userId: number) => {
  return await db.transaction(async (tx) => {
    const insertRes = await tx.insert(client).values({ pubKey }).returning({ id: client.id });
    const { id: clientId } = insertRes[0]!;
    await tx.insert(userClient).values({ userId, clientId });

    return clientId;
  });
};

export const getClientByPubKey = async (pubKey: string) => {
  const clients = await db.select().from(client).where(eq(client.pubKey, pubKey)).execute();
  return clients[0] ?? null;
};

export const createUserClient = async (userId: number, clientId: number) => {
  await db.insert(userClient).values({ userId, clientId }).execute();
};

export const getUserClient = async (userId: number, clientId: number) => {
  const userClients = await db
    .select()
    .from(userClient)
    .where(and(eq(userClient.userId, userId), eq(userClient.clientId, clientId)))
    .execute();
  return userClients[0] ?? null;
};

export const setUserClientStateToPending = async (userId: number, clientId: number) => {
  await db
    .update(userClient)
    .set({ state: UserClientState.Pending })
    .where(
      and(
        eq(userClient.userId, userId),
        eq(userClient.clientId, clientId),
        eq(userClient.state, UserClientState.Challenging),
      ),
    )
    .execute();
};

export const createUserClientChallenge = async (
  userId: number,
  clientId: number,
  challenge: string,
  allowedIp: string,
  expiresAt: number,
) => {
  await db
    .insert(userClientChallenge)
    .values({
      userId,
      clientId,
      challenge,
      allowedIp,
      expiresAt,
    })
    .execute();
};

export const getUserClientChallenge = async (challenge: string, ip: string) => {
  const challenges = await db
    .select()
    .from(userClientChallenge)
    .where(
      and(
        eq(userClientChallenge.challenge, challenge),
        eq(userClientChallenge.allowedIp, ip),
        gt(userClientChallenge.expiresAt, Date.now()),
      ),
    )
    .execute();
  return challenges[0] ?? null;
};

export const cleanupExpiredUserClientChallenges = async () => {
  await db
    .delete(userClientChallenge)
    .where(lte(userClientChallenge.expiresAt, Date.now()))
    .execute();
};
