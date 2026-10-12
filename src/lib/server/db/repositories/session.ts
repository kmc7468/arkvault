import env from "#lib/server/config.ts";
import type { Executor } from "../executor.ts";

export const createSession = async (
  executor: Executor,
  userId: number,
  sessionId: string,
  ip: string | null,
  agent: string | null,
) => {
  const now = new Date();
  await executor
    .insertInto("session")
    .values({
      id: sessionId,
      user_id: userId,
      created_at: now,
      last_used_at: now,
      last_used_by_ip: ip || null,
      last_used_by_agent: agent || null,
    })
    .execute();
};

// Returns `null` if the session doesn't exist or has expired
export const refreshSession = async (
  executor: Executor,
  sessionId: string,
  ip: string | null,
  agent: string | null,
) => {
  const now = new Date();
  const session = await executor
    .updateTable("session")
    .set({
      last_used_at: now,
      last_used_by_ip: ip !== "" ? ip : undefined, // Don't update if empty
      last_used_by_agent: agent !== "" ? agent : undefined, // Don't update if empty
    })
    .where("id", "=", sessionId)
    .where("last_used_at", ">", new Date(now.getTime() - env.session.exp))
    .returning(["user_id", "client_id"])
    .executeTakeFirst();
  return session ? { userId: session.user_id, clientId: session.client_id } : null;
};

// Returns whether the session has been upgraded, which fails if it was already upgraded. Violates
// `session_ak01` if the client has another session.
export const setSessionClient = async (executor: Executor, sessionId: string, clientId: number) => {
  const { numUpdatedRows } = await executor
    .updateTable("session")
    .set({ client_id: clientId })
    .where("id", "=", sessionId)
    .where("client_id", "is", null)
    .executeTakeFirst();
  return numUpdatedRows > 0n;
};

export const deleteSession = async (executor: Executor, sessionId: string) => {
  await executor.deleteFrom("session").where("id", "=", sessionId).execute();
};

// Deletes the other sessions of the user, or only those of the client if given
export const deleteOtherSessions = async (
  executor: Executor,
  userId: number,
  sessionId: string,
  clientId?: number,
) => {
  await executor
    .deleteFrom("session")
    .where("id", "!=", sessionId)
    .where("user_id", "=", userId)
    .$if(clientId !== undefined, (qb) => qb.where("client_id", "=", clientId!))
    .execute();
};

export const deleteExpiredSessions = async (executor: Executor) => {
  await executor
    .deleteFrom("session")
    .where("last_used_at", "<=", new Date(Date.now() - env.session.exp))
    .execute();
};

// Violates a unique constraint if the session already has a challenge
export const createSessionUpgradeChallenge = async (
  executor: Executor,
  sessionId: string,
  clientId: number,
  answer: string,
  allowedIp: string,
  expiresAt: Date,
) => {
  const { id } = await executor
    .insertInto("session_upgrade_challenge")
    .values({
      session_id: sessionId,
      client_id: clientId,
      answer,
      allowed_ip: allowedIp,
      expires_at: expiresAt,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { id };
};

export const consumeSessionUpgradeChallenge = async (
  executor: Executor,
  challengeId: number,
  sessionId: string,
  ip: string,
) => {
  const challenge = await executor
    .deleteFrom("session_upgrade_challenge")
    .where("id", "=", challengeId)
    .where("session_id", "=", sessionId)
    .where("allowed_ip", "=", ip)
    .where("expires_at", ">", new Date())
    .returning(["client_id", "answer"])
    .executeTakeFirst();
  return challenge ? { clientId: challenge.client_id, answer: challenge.answer } : null;
};

export const deleteExpiredSessionUpgradeChallenges = async (executor: Executor) => {
  await executor
    .deleteFrom("session_upgrade_challenge")
    .where("expires_at", "<=", new Date())
    .execute();
};
