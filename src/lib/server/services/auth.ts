import argon2 from "argon2";
import {
  ClientRepo,
  SessionRepo,
  UserRepo,
  db,
  isUniqueViolation,
  transaction,
} from "#lib/server/db/index.ts";
import env from "#lib/server/config.ts";
import { issueSessionId } from "#lib/server/crypto.ts";
import { AppError, invalidSessionError } from "#lib/server/errors.ts";
import { createChallenge, verifyChallengeAnswer } from "./client.ts";

const MIN_PASSWORD_LENGTH = 8;

export const login = async (email: string, password: string, ip: string, userAgent: string) => {
  const user = await UserRepo.getUserByEmail(db, email);
  if (!user || !(await argon2.verify(user.password, password))) {
    throw new AppError("UNAUTHORIZED", "Invalid email or password");
  }

  const { sessionId, sessionIdSigned } = await issueSessionId(32, env.session.secret);
  await SessionRepo.createSession(db, user.id, sessionId, ip, userAgent);
  return { sessionIdSigned };
};

export const logout = async (sessionId: string) => {
  await SessionRepo.deleteSession(db, sessionId);
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

  const user = await UserRepo.getUser(db, userId);
  if (!user) {
    throw invalidSessionError();
  } else if (!(await argon2.verify(user.password, oldPassword))) {
    throw new AppError("FORBIDDEN", "Invalid password");
  }

  const passwordHash = await argon2.hash(newPassword);
  await transaction(async (trx) => {
    await UserRepo.setUserPassword(trx, userId, passwordHash);
    await SessionRepo.deleteOtherSessions(trx, userId, sessionId);
  });
};

export const requestSessionUpgrade = async (
  userId: number,
  sessionId: string,
  ip: string,
  encPubKey: string,
  sigPubKey: string,
) => {
  const client = await ClientRepo.getClientByPubKeys(db, encPubKey, sigPubKey);
  if (!client) {
    throw new AppError("UNAUTHORIZED", "Invalid public key(s)");
  }

  const userClient = await ClientRepo.getUserClient(db, userId, client.id);
  if (!userClient || userClient.state === "challenging") {
    throw new AppError("FORBIDDEN", "Unregistered client");
  }

  try {
    return await createChallenge(encPubKey, (answer) =>
      SessionRepo.createSessionUpgradeChallenge(
        db,
        sessionId,
        client.id,
        answer,
        ip,
        new Date(Date.now() + env.challenge.sessionUpgradeExp),
      ),
    );
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new AppError("CONFLICT", "Challenge already registered");
    }
    throw e;
  }
};

export const verifySessionUpgrade = async (
  userId: number,
  sessionId: string,
  ip: string,
  challengeId: number,
  answerSig: string,
  force: boolean,
) => {
  const challenge = await SessionRepo.consumeSessionUpgradeChallenge(
    db,
    challengeId,
    sessionId,
    ip,
  );
  const client = await verifyChallengeAnswer(challenge, answerSig);

  try {
    await transaction(async (trx) => {
      if (force) {
        await SessionRepo.deleteOtherSessions(trx, userId, sessionId, client.id);
      }
      if (!(await SessionRepo.setSessionClient(trx, sessionId, client.id))) {
        throw new AppError("UNAUTHORIZED", "Session not found");
      }
    });
  } catch (e) {
    if (isUniqueViolation(e, "session_ak01")) {
      throw new AppError("CONFLICT", "Already logged in");
    }
    throw e;
  }
};

export const cleanupExpiredSessions = async () => {
  await Promise.all([
    SessionRepo.deleteExpiredSessions(db),
    SessionRepo.deleteExpiredSessionUpgradeChallenges(db),
  ]);
};
