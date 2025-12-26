import { TRPCClientError } from "@trpc/client";
import { encodeToBase64, decryptChallenge, signMessageRSA } from "$lib/modules/crypto";
import { useTRPC } from "$trpc/client";

export const requestSessionUpgrade = async (
  encryptKeyBase64: string,
  decryptKey: CryptoKey,
  verifyKeyBase64: string,
  signKey: CryptoKey,
  force = false,
) => {
  const trpc = useTRPC();
  let id, challenge;
  try {
    ({ id, challenge } = await trpc.auth.upgrade.mutate({
      encPubKey: encryptKeyBase64,
      sigPubKey: verifyKeyBase64,
    }));
  } catch (e) {
    if (e instanceof TRPCClientError && e.data?.code === "FORBIDDEN") {
      return [false, "Unregistered client"] as const;
    }
    return [false] as const;
  }
  const answer = await decryptChallenge(challenge, decryptKey);
  const answerSig = await signMessageRSA(answer, signKey);

  try {
    await trpc.auth.verifyUpgrade.mutate({
      id,
      answerSig: encodeToBase64(answerSig),
      force,
    });
  } catch (e) {
    if (e instanceof TRPCClientError && e.data?.code === "CONFLICT") {
      return [false, "Already logged in"] as const;
    }
    return [false] as const;
  }

  return [true] as const;
};

export const requestLogout = async () => {
  const trpc = useTRPC();
  try {
    await trpc.auth.logout.mutate();
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};
