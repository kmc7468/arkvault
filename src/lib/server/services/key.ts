import {
  ClientRepo,
  HskRepo,
  LogRepo,
  MekRepo,
  db,
  isUniqueViolation,
  transaction,
} from "#lib/server/db/index.ts";
import { verifySignature } from "#lib/server/crypto.ts";
import { AppError, invalidSessionError } from "#lib/server/errors.ts";
import { serializeMasterKeyWrapped } from "#lib/shared/crypto/index.ts";
import { ensureActiveMekVersion } from "./common.ts";

export const getClientMeks = async (userId: number, clientId: number) => {
  return await MekRepo.getAllValidClientMeks(db, userId, clientId);
};

const verifyClientEncMekSig = async (
  clientId: number,
  version: number,
  encMek: string,
  encMekSig: string,
) => {
  const client = await ClientRepo.getClient(db, clientId);
  if (!client) {
    throw invalidSessionError();
  }

  const data = serializeMasterKeyWrapped(encMek, version);
  return verifySignature(Buffer.from(data), encMekSig, client.sigPubKey);
};

export const registerInitialMek = async (
  userId: number,
  clientId: number,
  encMek: string,
  encMekSig: string,
) => {
  if (!(await verifyClientEncMekSig(clientId, 1, encMek, encMekSig))) {
    throw new AppError("BAD_REQUEST", "Invalid signature");
  }

  try {
    // The client that registered the master key is approved to access it at the same time
    await transaction(async (trx) => {
      const { version } = await MekRepo.createInitialMek(trx, userId, clientId, encMek, encMekSig);
      await LogRepo.appendMekLog(trx, {
        user_id: userId,
        master_encryption_key_version: version,
        action: "create",
        action_by: clientId,
      });
      await ClientRepo.transitionUserClientState(trx, userId, clientId, {
        from: "pending",
        to: "active",
      });
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new AppError("CONFLICT", "MEK already registered");
    }
    throw e;
  }
};

export const getHsks = async (userId: number) => {
  return await HskRepo.getAllValidHsks(db, userId);
};

export const registerInitialHsk = async (
  userId: number,
  clientId: number,
  mekVersion: number,
  encHsk: string,
) => {
  try {
    await transaction(async (trx) => {
      await ensureActiveMekVersion(trx, userId, mekVersion);
      const { version } = await HskRepo.createInitialHsk(trx, userId, mekVersion, encHsk);
      await LogRepo.appendHskLog(trx, {
        user_id: userId,
        hmac_secret_key_version: version,
        action: "create",
        action_by: clientId,
      });
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new AppError("CONFLICT", "HSK already registered");
    }
    throw e;
  }
};
