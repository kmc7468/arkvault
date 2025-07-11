import { callPostApi } from "$lib/hooks";
import { exportRSAKeyToBase64 } from "$lib/modules/crypto";
import type { LoginRequest } from "$lib/server/schemas";
import { requestSessionUpgrade as requestSessionUpgradeInternal } from "$lib/services/auth";
import { requestClientRegistration } from "$lib/services/key";
import type { ClientKeys } from "$lib/stores";

export { requestLogout } from "$lib/services/auth";
export { requestMasterKeyDownload } from "$lib/services/key";

export const requestLogin = async (email: string, password: string) => {
  const res = await callPostApi<LoginRequest>("/api/auth/login", { email, password });
  return res.ok;
};

export const requestSessionUpgrade = async (
  { encryptKey, decryptKey, signKey, verifyKey }: ClientKeys,
  force: boolean,
) => {
  const encryptKeyBase64 = await exportRSAKeyToBase64(encryptKey);
  const verifyKeyBase64 = await exportRSAKeyToBase64(verifyKey);
  const [res, error] = await requestSessionUpgradeInternal(
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
    (
      await requestSessionUpgradeInternal(encryptKeyBase64, decryptKey, verifyKeyBase64, signKey)
    )[0],
  ] as const;
};
