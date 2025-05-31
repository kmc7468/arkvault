import { error } from "@sveltejs/kit";
import argon2 from "argon2";
import { getClient, getClientByPubKeys, getUserClient } from "$lib/server/db/client";
import { IntegrityError } from "$lib/server/db/error";
import {
  upgradeSession,
  deleteSession,
  deleteAllOtherSessions,
  registerSessionUpgradeChallenge,
  consumeSessionUpgradeChallenge,
} from "$lib/server/db/session";
import { getUser, getUserByEmail, setUserPassword } from "$lib/server/db/user";
import env from "$lib/server/loadenv";
import { startSession } from "$lib/server/modules/auth";
import { verifySignature, generateChallenge } from "$lib/server/modules/crypto";

const hashPassword = async (password: string) => {
  return await argon2.hash(password);
};

const verifyPassword = async (hash: string, password: string) => {
  return await argon2.verify(hash, password);
};

export const changePassword = async (
  userId: number,
  sessionId: string,
  oldPassword: string,
  newPassword: string,
) => {
  if (oldPassword === newPassword) {
    error(400, "Same passwords");
  } else if (newPassword.length < 8) {
    error(400, "Too short password");
  }

  const user = await getUser(userId);
  if (!user) {
    error(500, "Invalid session id");
  } else if (!(await verifyPassword(user.password, oldPassword))) {
    error(403, "Invalid password");
  }

  await setUserPassword(userId, await hashPassword(newPassword));
  await deleteAllOtherSessions(userId, sessionId);
};

export const login = async (email: string, password: string, ip: string, userAgent: string) => {
  const user = await getUserByEmail(email);
  if (!user || !(await verifyPassword(user.password, password))) {
    error(401, "Invalid email or password");
  }

  try {
    return { sessionIdSigned: await startSession(user.id, ip, userAgent) };
  } catch (e) {
    if (e instanceof IntegrityError && e.message === "Session already exists") {
      error(403, "Already logged in");
    }
    throw e;
  }
};

export const logout = async (sessionId: string) => {
  await deleteSession(sessionId);
};

export const createSessionUpgradeChallenge = async (
  sessionId: string,
  userId: number,
  ip: string,
  encPubKey: string,
  sigPubKey: string,
) => {
  const client = await getClientByPubKeys(encPubKey, sigPubKey);
  const userClient = client ? await getUserClient(userId, client.id) : undefined;
  if (!client) {
    error(401, "Invalid public key(s)");
  } else if (!userClient || userClient.state === "challenging") {
    error(403, "Unregistered client");
  }

  const { answer, challenge } = await generateChallenge(32, encPubKey);
  await registerSessionUpgradeChallenge(
    sessionId,
    client.id,
    answer.toString("base64"),
    ip,
    new Date(Date.now() + env.challenge.sessionUpgradeExp),
  );

  return { challenge: challenge.toString("base64") };
};

export const verifySessionUpgradeChallenge = async (
  sessionId: string,
  ip: string,
  answer: string,
  answerSig: string,
) => {
  const challenge = await consumeSessionUpgradeChallenge(sessionId, answer, ip);
  if (!challenge) {
    error(403, "Invalid challenge answer");
  }

  const client = await getClient(challenge.clientId);
  if (!client) {
    error(500, "Invalid challenge answer");
  } else if (!verifySignature(Buffer.from(answer, "base64"), answerSig, client.sigPubKey)) {
    error(403, "Invalid challenge answer signature");
  }

  try {
    await upgradeSession(sessionId, client.id);
  } catch (e) {
    if (e instanceof IntegrityError && e.message === "Session not found") {
      error(500, "Invalid challenge answer");
    }
    throw e;
  }
};
