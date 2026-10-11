import { ClientRepo, HskRepo, MekRepo } from "#lib/server/db/index.ts";
import { verifySignature } from "#lib/server/crypto.ts";
import { AppError, invalidSessionError } from "#lib/server/errors.ts";
import { serializeMasterKeyWrapped } from "#lib/shared/crypto/index.ts";

export const getClientMeks = async (userId: number, clientId: number) => {
  return await MekRepo.getAllValidClientMeks(userId, clientId);
};

const verifyClientEncMekSig = async (
  userId: number,
  clientId: number,
  version: number,
  encMek: string,
  encMekSig: string,
) => {
  const userClient = await ClientRepo.getUserClientWithDetails(userId, clientId);
  if (!userClient) {
    throw invalidSessionError();
  }

  const data = serializeMasterKeyWrapped(encMek, version);
  return verifySignature(Buffer.from(data), encMekSig, userClient.sigPubKey);
};

export const registerInitialMek = async (
  userId: number,
  clientId: number,
  encMek: string,
  encMekSig: string,
) => {
  if (!(await verifyClientEncMekSig(userId, clientId, 1, encMek, encMekSig))) {
    throw new AppError("BAD_REQUEST", "Invalid signature");
  }

  await MekRepo.registerInitialMek(userId, clientId, encMek, encMekSig);
  await ClientRepo.setUserClientStateToActive(userId, clientId);
};

export const getHsks = async (userId: number) => {
  return await HskRepo.getAllValidHsks(userId);
};

export const registerInitialHsk = async (
  userId: number,
  clientId: number,
  mekVersion: number,
  encHsk: string,
) => {
  await HskRepo.registerInitialHsk(userId, clientId, mekVersion, encHsk);
};
