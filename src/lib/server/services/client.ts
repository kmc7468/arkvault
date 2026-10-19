import { ClientRepo, db, isUniqueViolation, transaction } from "#lib/server/db/index.ts";
import env from "#lib/server/config.ts";
import { generateChallenge, verifyPubKey, verifySignature } from "#lib/server/crypto.ts";
import { AppError } from "#lib/server/errors.ts";

const CHALLENGE_LENGTH = 32;

export const createChallenge = async (
  encPubKey: string,
  register: (answer: string) => Promise<{ id: number }>,
) => {
  const { answer, challenge } = await generateChallenge(CHALLENGE_LENGTH, encPubKey);
  const { id } = await register(answer.toString("base64"));
  return { id, challenge: challenge.toString("base64") };
};

export const verifyChallengeAnswer = async (
  challenge: { clientId: number; answer: string } | null,
  answerSig: string,
) => {
  if (!challenge) {
    throw new AppError("FORBIDDEN", "Invalid challenge answer");
  }

  const client = await ClientRepo.getClient(db, challenge.clientId);
  if (!client) {
    throw new AppError("INTERNAL_SERVER_ERROR", "Invalid challenge answer");
  } else if (
    !verifySignature(Buffer.from(challenge.answer, "base64"), answerSig, client.sigPubKey)
  ) {
    throw new AppError("FORBIDDEN", "Invalid challenge answer signature");
  }
  return client;
};

const addExistingClient = async (userId: number, clientId: number) => {
  try {
    await ClientRepo.createUserClient(db, userId, clientId);
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new AppError("CONFLICT", "User client already exists");
    }
    throw e;
  }
};

const addNewClient = async (userId: number, encPubKey: string, sigPubKey: string) => {
  if (encPubKey === sigPubKey) {
    throw new AppError("BAD_REQUEST", "Same public keys");
  } else if (!verifyPubKey(encPubKey) || !verifyPubKey(sigPubKey)) {
    throw new AppError("BAD_REQUEST", "Invalid public key(s)");
  }

  const publicKeysRegistered = () => new AppError("CONFLICT", "Public key(s) already registered");
  try {
    // Serializable, as a key must not be used as either key of another client, which can't be
    // ensured by unique constraints
    return await transaction(
      async (trx) => {
        if (await ClientRepo.isAnyPublicKeyRegistered(trx, encPubKey, sigPubKey)) {
          throw publicKeysRegistered();
        }

        const { id } = await ClientRepo.createClient(trx, encPubKey, sigPubKey);
        await ClientRepo.createUserClient(trx, userId, id);
        return id;
      },
      { isolationLevel: "serializable" },
    );
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw publicKeysRegistered();
    }
    throw e;
  }
};

export const registerClient = async (
  userId: number,
  ip: string,
  encPubKey: string,
  sigPubKey: string,
) => {
  const client = await ClientRepo.getClientByPubKeys(db, encPubKey, sigPubKey);
  let clientId;
  if (client) {
    await addExistingClient(userId, client.id);
    clientId = client.id;
  } else {
    clientId = await addNewClient(userId, encPubKey, sigPubKey);
  }

  return await createChallenge(encPubKey, (answer) =>
    ClientRepo.createUserClientChallenge(
      db,
      userId,
      clientId,
      answer,
      ip,
      new Date(Date.now() + env.challenge.userClientExp),
    ),
  );
};

export const verifyClient = async (
  userId: number,
  ip: string,
  challengeId: number,
  answerSig: string,
) => {
  const challenge = await ClientRepo.consumeUserClientChallenge(db, challengeId, userId, ip);
  const client = await verifyChallengeAnswer(challenge, answerSig);
  await ClientRepo.transitionUserClientState(db, userId, client.id, {
    from: "challenging",
    to: "pending",
  });
};

export const cleanupExpiredChallenges = async () => {
  await ClientRepo.deleteExpiredUserClientChallenges(db);
};
