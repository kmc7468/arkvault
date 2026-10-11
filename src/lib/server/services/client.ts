import { ClientRepo } from "#lib/server/db/index.js";
import env from "#lib/server/config.js";
import { generateChallenge, verifyPubKey, verifySignature } from "#lib/server/crypto.js";
import { AppError } from "#lib/server/errors.js";

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

  const client = await ClientRepo.getClient(challenge.clientId);
  if (!client) {
    throw new AppError("INTERNAL_SERVER_ERROR", "Invalid challenge answer");
  } else if (
    !verifySignature(Buffer.from(challenge.answer, "base64"), answerSig, client.sigPubKey)
  ) {
    throw new AppError("FORBIDDEN", "Invalid challenge answer signature");
  }
  return client;
};

export const registerClient = async (
  userId: number,
  ip: string,
  encPubKey: string,
  sigPubKey: string,
) => {
  const getClientId = async () => {
    const client = await ClientRepo.getClientByPubKeys(encPubKey, sigPubKey);
    if (client) {
      await ClientRepo.createUserClient(userId, client.id);
      return client.id;
    } else if (encPubKey === sigPubKey) {
      throw new AppError("BAD_REQUEST", "Same public keys");
    } else if (!verifyPubKey(encPubKey) || !verifyPubKey(sigPubKey)) {
      throw new AppError("BAD_REQUEST", "Invalid public key(s)");
    }
    return (await ClientRepo.createClient(encPubKey, sigPubKey, userId)).id;
  };

  const clientId = await getClientId();
  return await createChallenge(encPubKey, (answer) =>
    ClientRepo.registerUserClientChallenge(
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
  const challenge = await ClientRepo.consumeUserClientChallenge(challengeId, userId, ip);
  const client = await verifyChallengeAnswer(challenge, answerSig);
  await ClientRepo.setUserClientStateToPending(userId, client.id);
};
