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
) => {
  let res = await callPostApi<SessionUpgradeRequest>("/api/auth/upgradeSession", {
    encPubKey: encryptKeyBase64,
    sigPubKey: verifyKeyBase64,
  });
  if (!res.ok) return false;

  const { id, challenge }: SessionUpgradeResponse = await res.json();
  const answer = await decryptChallenge(challenge, decryptKey);
  const answerSig = await signMessageRSA(answer, signKey);

  res = await callPostApi<SessionUpgradeVerifyRequest>("/api/auth/upgradeSession/verify", {
    id,
    answerSig: encodeToBase64(answerSig),
  });
  return res.ok;
};
