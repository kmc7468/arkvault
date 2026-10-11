import {
  decryptChallenge,
  encodeToBase64,
  exportRSAKeyToBase64,
  signMasterKeyWrapped,
  signMessageRSA,
  unwrapHmacSecret,
  unwrapMasterKey,
  verifyMasterKeyWrapped,
} from "#lib/shared/crypto/index.js";
import { isTRPCClientError, trpc } from "#trpc/client.js";
import { keyring } from "./keyring.svelte";
import type { ClientKeys } from "./types";

// Synchronizes keys with the server

const exportPublicKeys = async ({ encryptKey, verifyKey }: ClientKeys) => ({
  encPubKey: await exportRSAKeyToBase64(encryptKey),
  sigPubKey: await exportRSAKeyToBase64(verifyKey),
});

const answerChallenge = async (challenge: string, { decryptKey, signKey }: ClientKeys) => {
  const answer = await decryptChallenge(challenge, decryptKey);
  return encodeToBase64(await signMessageRSA(answer, signKey));
};

export const requestSessionUpgrade = async (force = false) => {
  const clientKeys = keyring.requireClientKeys();

  let id, challenge;
  try {
    ({ id, challenge } = await trpc.auth.upgrade.mutate(await exportPublicKeys(clientKeys)));
  } catch (e) {
    if (isTRPCClientError(e) && e.data?.code === "FORBIDDEN") {
      return [false, "Unregistered client"] as const;
    }
    return [false] as const;
  }

  try {
    await trpc.auth.verifyUpgrade.mutate({
      id,
      answerSig: await answerChallenge(challenge, clientKeys),
      force,
    });
  } catch (e) {
    if (isTRPCClientError(e) && e.data?.code === "CONFLICT") {
      return [false, "Already logged in"] as const;
    }
    return [false] as const;
  }

  return [true] as const;
};

export const requestClientRegistration = async () => {
  const clientKeys = keyring.requireClientKeys();

  try {
    const { id, challenge } = await trpc.client.register.mutate(await exportPublicKeys(clientKeys));
    await trpc.client.verify.mutate({
      id,
      answerSig: await answerChallenge(challenge, clientKeys),
    });
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};

export const requestClientRegistrationAndSessionUpgrade = async (force: boolean) => {
  const [res, error] = await requestSessionUpgrade(force);
  if (error === undefined) return [res] as const;

  if (error === "Unregistered client" && !(await requestClientRegistration())) {
    return [false] as const;
  } else if (error === "Already logged in") {
    return [false, force ? undefined : error] as const;
  }

  return [(await requestSessionUpgrade())[0]] as const;
};

export const registerInitialMasterKeyAndHmacSecret = async (
  masterKeyWrapped: string,
  hmacSecretWrapped: string,
) => {
  const { signKey } = keyring.requireClientKeys();

  try {
    await trpc.mek.registerInitial.mutate({
      mek: masterKeyWrapped,
      mekSig: await signMasterKeyWrapped(masterKeyWrapped, 1, signKey),
    });
  } catch (e) {
    if (isTRPCClientError(e) && (e.data?.code === "FORBIDDEN" || e.data?.code === "CONFLICT")) {
      return true;
    }
    // TODO: Error Handling
    return false;
  }

  try {
    await trpc.hsk.registerInitial.mutate({
      mekVersion: 1,
      hsk: hmacSecretWrapped,
    });
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};

export const downloadHmacSecrets = async () => {
  let hmacSecretsWrapped;
  try {
    hmacSecretsWrapped = await trpc.hsk.list.query();
  } catch {
    // TODO: Error Handling
    return false;
  }

  const hmacSecrets = await Promise.all(
    hmacSecretsWrapped.map(async ({ version, state, mekVersion, hsk: hmacSecretWrapped }) => {
      const { hmacSecret } = await unwrapHmacSecret(
        hmacSecretWrapped,
        keyring.getMasterKey(mekVersion).key,
      );
      return { version, state, secret: hmacSecret };
    }),
  );

  await keyring.setHmacSecrets(hmacSecrets);
  return true;
};

// Downloads the master keys (and HMAC secrets) once this client has been approved
export const downloadMasterKeys = async () => {
  const { decryptKey, verifyKey } = keyring.requireClientKeys();

  let masterKeysWrapped;
  try {
    masterKeysWrapped = await trpc.mek.list.query();
  } catch {
    // TODO: Error Handling
    return false;
  }

  const masterKeys = await Promise.all(
    masterKeysWrapped.map(
      async ({ version, state, mek: masterKeyWrapped, mekSig: masterKeyWrappedSig }) => {
        const { masterKey } = await unwrapMasterKey(masterKeyWrapped, decryptKey);
        return {
          version,
          state,
          key: masterKey,
          isValid: await verifyMasterKeyWrapped(
            masterKeyWrapped,
            version,
            masterKeyWrappedSig,
            verifyKey,
          ),
        };
      },
    ),
  );
  if (masterKeys.length === 0 || !masterKeys.every(({ isValid }) => isValid)) return false;

  await keyring.setMasterKeys(
    masterKeys.map(({ version, state, key }) => ({ version, state, key })),
  );
  await downloadHmacSecrets();
  return true;
};

export const ensureHmacSecrets = async () => {
  if (!keyring.hasHmacSecrets && !(await downloadHmacSecrets())) {
    throw new Error("Failed to download HMAC secrets");
  }
};
