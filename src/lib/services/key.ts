import { callGetApi, callPostApi } from "$lib/hooks";
import { storeMasterKeys } from "$lib/indexedDB";
import {
  encodeToBase64,
  exportRSAKeyToBase64,
  decryptChallenge,
  signMessageRSA,
  unwrapMasterKey,
  signMasterKeyWrapped,
  verifyMasterKeyWrapped,
} from "$lib/modules/crypto";
import type {
  InitialHmacSecretRegisterRequest,
  MasterKeyListResponse,
  InitialMasterKeyRegisterRequest,
} from "$lib/server/schemas";
import { requestSessionUpgrade } from "$lib/services/auth";
import { masterKeyStore, type ClientKeys } from "$lib/stores";
import { useTRPC } from "$trpc/client";

export const requestClientRegistration = async (
  encryptKeyBase64: string,
  decryptKey: CryptoKey,
  verifyKeyBase64: string,
  signKey: CryptoKey,
) => {
  const trpc = useTRPC();

  try {
    const { id, challenge } = await trpc.client.register.mutate({
      encPubKey: encryptKeyBase64,
      sigPubKey: verifyKeyBase64,
    });
    const answer = await decryptChallenge(challenge, decryptKey);
    const answerSig = await signMessageRSA(answer, signKey);
    await trpc.client.verify.mutate({
      id,
      answerSig: encodeToBase64(answerSig),
    });
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};

export const requestClientRegistrationAndSessionUpgrade = async (
  { encryptKey, decryptKey, signKey, verifyKey }: ClientKeys,
  force: boolean,
) => {
  const encryptKeyBase64 = await exportRSAKeyToBase64(encryptKey);
  const verifyKeyBase64 = await exportRSAKeyToBase64(verifyKey);
  const [res, error] = await requestSessionUpgrade(
    encryptKeyBase64,
    decryptKey,
    verifyKeyBase64,
    signKey,
    force,
  );
  if (error === undefined) return [res] as const;

  if (
    error === "Unregistered client" &&
    !(await requestClientRegistration(encryptKeyBase64, decryptKey, verifyKeyBase64, signKey))
  ) {
    return [false] as const;
  } else if (error === "Already logged in") {
    return [false, force ? undefined : error] as const;
  }

  return [
    (await requestSessionUpgrade(encryptKeyBase64, decryptKey, verifyKeyBase64, signKey))[0],
  ] as const;
};

export const requestMasterKeyDownload = async (decryptKey: CryptoKey, verifyKey: CryptoKey) => {
  const res = await callGetApi("/api/mek/list");
  if (!res.ok) return false;

  const { meks: masterKeysWrapped }: MasterKeyListResponse = await res.json();
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
  if (!masterKeys.every(({ isValid }) => isValid)) return false;

  await storeMasterKeys(masterKeys);
  masterKeyStore.set(new Map(masterKeys.map((masterKey) => [masterKey.version, masterKey])));

  return true;
};

export const requestInitialMasterKeyAndHmacSecretRegistration = async (
  masterKeyWrapped: string,
  hmacSecretWrapped: string,
  signKey: CryptoKey,
) => {
  let res = await callPostApi<InitialMasterKeyRegisterRequest>("/api/mek/register/initial", {
    mek: masterKeyWrapped,
    mekSig: await signMasterKeyWrapped(masterKeyWrapped, 1, signKey),
  });
  if (!res.ok) {
    return res.status === 403 || res.status === 409;
  }

  res = await callPostApi<InitialHmacSecretRegisterRequest>("/api/hsk/register/initial", {
    mekVersion: 1,
    hsk: hmacSecretWrapped,
  });
  return res.ok;
};
