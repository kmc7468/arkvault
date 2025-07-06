import { callGetApi, callPostApi } from "$lib/hooks";
import { storeMasterKeys } from "$lib/indexedDB";
import {
  encodeToBase64,
  decryptChallenge,
  signMessageRSA,
  unwrapMasterKey,
  verifyMasterKeyWrapped,
} from "$lib/modules/crypto";
import type {
  ClientRegisterRequest,
  ClientRegisterResponse,
  ClientRegisterVerifyRequest,
  MasterKeyListResponse,
} from "$lib/server/schemas";
import { masterKeyStore } from "$lib/stores";

export const requestClientRegistration = async (
  encryptKeyBase64: string,
  decryptKey: CryptoKey,
  verifyKeyBase64: string,
  signKey: CryptoKey,
) => {
  let res = await callPostApi<ClientRegisterRequest>("/api/client/register", {
    encPubKey: encryptKeyBase64,
    sigPubKey: verifyKeyBase64,
  });
  if (!res.ok) return false;

  const { id, challenge }: ClientRegisterResponse = await res.json();
  const answer = await decryptChallenge(challenge, decryptKey);
  const answerSig = await signMessageRSA(answer, signKey);

  res = await callPostApi<ClientRegisterVerifyRequest>("/api/client/register/verify", {
    id,
    answerSig: encodeToBase64(answerSig),
  });
  return res.ok;
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
