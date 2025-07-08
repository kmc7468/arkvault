import pg from "pg";
import env from "$lib/server/loadenv";
import { IntegrityError } from "./error";
import db from "./kysely";

export const createSession = async (
  userId: number,
  sessionId: string,
  ip: string | null,
  agent: string | null,
) => {
  const now = new Date();
  await db
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

export const refreshSession = async (
  sessionId: string,
  ip: string | null,
  agent: string | null,
) => {
  const now = new Date();
  const session = await db
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
  if (!session) {
    throw new IntegrityError("Session not found");
  }
  return { userId: session.user_id, clientId: session.client_id };
};

export const upgradeSession = async (sessionId: string, clientId: number) => {
  try {
    const res = await db
      .updateTable("session")
      .set({ client_id: clientId })
      .where("id", "=", sessionId)
      .where("client_id", "is", null)
      .executeTakeFirst();
    if (res.numUpdatedRows === 0n) {
      throw new IntegrityError("Session not found");
    }
  } catch (e) {
    if (e instanceof pg.DatabaseError && e.code === "23505") {
      throw new IntegrityError("Session already exists");
    }
    throw e;
  }
};

export const deleteSession = async (sessionId: string) => {
  await db.deleteFrom("session").where("id", "=", sessionId).execute();
};

export const deleteAllOtherSessions = async (userId: number, sessionId: string) => {
  await db
    .deleteFrom("session")
    .where("id", "!=", sessionId)
    .where("user_id", "=", userId)
    .execute();
};

export const cleanupExpiredSessions = async () => {
  await db
    .deleteFrom("session")
    .where("last_used_at", "<=", new Date(Date.now() - env.session.exp))
    .execute();
};

export const registerSessionUpgradeChallenge = async (
  sessionId: string,
  clientId: number,
  answer: string,
  allowedIp: string,
  expiresAt: Date,
) => {
  try {
    const { id } = await db
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
  } catch (e) {
    if (e instanceof pg.DatabaseError && e.code === "23505") {
      throw new IntegrityError("Challenge already registered");
    }
    throw e;
  }
};

export const consumeSessionUpgradeChallenge = async (
  challengeId: number,
  sessionId: string,
  ip: string,
) => {
  const challenge = await db
    .deleteFrom("session_upgrade_challenge")
    .where("id", "=", challengeId)
    .where("session_id", "=", sessionId)
    .where("allowed_ip", "=", ip)
    .where("expires_at", ">", new Date())
    .returning(["client_id", "answer"])
    .executeTakeFirst();
  return challenge ? { clientId: challenge.client_id, answer: challenge.answer } : null;
};

export const cleanupExpiredSessionUpgradeChallenges = async () => {
  await db.deleteFrom("session_upgrade_challenge").where("expires_at", "<=", new Date()).execute();
};
