import {
  encodeToBase64,
  decodeFromBase64,
  decryptRSACiphertext,
  signRSAMessage,
} from "$lib/modules/crypto";

export const requestTokenUpgrade = async (
  encPubKeyBase64: string,
  encPrivKey: CryptoKey,
  sigPubKeyBase64: string,
  sigPrivKey: CryptoKey,
) => {
  let res = await fetch("/api/auth/upgradeToken", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      encPubKey: encPubKeyBase64,
      sigPubKey: sigPubKeyBase64,
    }),
  });
  if (!res.ok) return false;

  const { challenge } = await res.json();
  const answer = await decryptRSACiphertext(decodeFromBase64(challenge), encPrivKey);
  const sigAnswer = await signRSAMessage(answer, sigPrivKey);

  res = await fetch("/api/auth/upgradeToken/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      answer: encodeToBase64(answer),
      sigAnswer: encodeToBase64(sigAnswer),
    }),
  });
  return res.ok;
};
