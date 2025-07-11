import { callPostApi } from "$lib/hooks";
import { encodeToBase64, decryptChallenge, signMessageRSA } from "$lib/modules/crypto";
import type {
  SessionUpgradeRequest,
  SessionUpgradeResponse,
  SessionUpgradeVerifyRequest,
} from "$lib/server/schemas";

export const requestSessionUpgrade = async (
  encryptKeyBase64: string,
  decryptKey: CryptoKey,
  verifyKeyBase64: string,
  signKey: CryptoKey,
  force = false,
) => {
  let res = await callPostApi<SessionUpgradeRequest>("/api/auth/upgradeSession", {
    encPubKey: encryptKeyBase64,
    sigPubKey: verifyKeyBase64,
  });
  if (res.status === 403) return [false, "Unregistered client"] as const;
  else if (!res.ok) return [false] as const;

  const { id, challenge }: SessionUpgradeResponse = await res.json();
  const answer = await decryptChallenge(challenge, decryptKey);
  const answerSig = await signMessageRSA(answer, signKey);

  res = await callPostApi<SessionUpgradeVerifyRequest>("/api/auth/upgradeSession/verify", {
    id,
    answerSig: encodeToBase64(answerSig),
    force,
  });
  if (res.status === 409) return [false, "Already logged in"] as const;
  else return [res.ok] as const;
};

export const requestLogout = async () => {
  const res = await callPostApi("/api/auth/logout");
  return res.ok;
};
