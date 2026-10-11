import argon2 from "argon2";
import { ClientRepo, IntegrityError, SessionRepo, UserRepo } from "#lib/server/db/index.ts";
import env from "#lib/server/config.ts";
import { issueSessionId } from "#lib/server/crypto.ts";
import { AppError } from "#lib/server/errors.ts";
import { createChallenge, verifyChallengeAnswer } from "./client.ts";

const MIN_PASSWORD_LENGTH = 8;

export const login = async (email: string, password: string, ip: string, userAgent: string) => {
  const user = await UserRepo.getUserByEmail(email);
  if (!user || !(await argon2.verify(user.password, password))) {
    throw new AppError("UNAUTHORIZED", "Invalid email or password");
  }

  const { sessionId, sessionIdSigned } = await issueSessionId(32, env.session.secret);
  await SessionRepo.createSession(user.id, sessionId, ip, userAgent);
  return { sessionIdSigned };
};

export const logout = async (sessionId: string) => {
  await SessionRepo.deleteSession(sessionId);
};

export const changePassword = async (
  userId: number,
  sessionId: string,
  oldPassword: string,
  newPassword: string,
) => {
  if (oldPassword === newPassword) {
    throw new AppError("BAD_REQUEST", "Same passwords");
  } else if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new AppError("BAD_REQUEST", "Too short password");
  }

  const user = await UserRepo.getUser(userId);
  if (!user) {
    throw new AppError("INTERNAL_SERVER_ERROR", "Invalid session id");
  } else if (!(await argon2.verify(user.password, oldPassword))) {
    throw new AppError("FORBIDDEN", "Invalid password");
  }

  await UserRepo.setUserPassword(userId, await argon2.hash(newPassword));
  await SessionRepo.deleteAllOtherSessions(userId, sessionId);
};

export const requestSessionUpgrade = async (
  userId: number,
  sessionId: string,
  ip: string,
  encPubKey: string,
  sigPubKey: string,
) => {
  const client = await ClientRepo.getClientByPubKeys(encPubKey, sigPubKey);
  if (!client) {
    throw new AppError("UNAUTHORIZED", "Invalid public key(s)");
  }

  const userClient = await ClientRepo.getUserClient(userId, client.id);
  if (!userClient || userClient.state === "challenging") {
    throw new AppError("FORBIDDEN", "Unregistered client");
  }

  return await createChallenge(encPubKey, (answer) =>
    SessionRepo.registerSessionUpgradeChallenge(
      sessionId,
      client.id,
      answer,
      ip,
      new Date(Date.now() + env.challenge.sessionUpgradeExp),
    ),
  );
};

export const verifySessionUpgrade = async (
  userId: number,
  sessionId: string,
  ip: string,
  challengeId: number,
  answerSig: string,
  force: boolean,
) => {
  const challenge = await SessionRepo.consumeSessionUpgradeChallenge(challengeId, sessionId, ip);
  const client = await verifyChallengeAnswer(challenge, answerSig);

  try {
    await SessionRepo.upgradeSession(userId, sessionId, client.id, force);
  } catch (e) {
    if (e instanceof IntegrityError) {
      if (e.message === "Session not found") {
        throw new AppError("INTERNAL_SERVER_ERROR", "Invalid challenge answer");
      } else if (e.message === "Session already exists") {
        throw new AppError("CONFLICT", "Already logged in");
      }
    }
    throw e;
  }
};
