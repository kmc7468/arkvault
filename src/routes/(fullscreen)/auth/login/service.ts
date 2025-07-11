import { callPostApi } from "$lib/hooks";
import type { LoginRequest } from "$lib/server/schemas";

export { requestLogout } from "$lib/services/auth";
export { requestDeletedFilesCleanup } from "$lib/services/file";
export {
  requestClientRegistrationAndSessionUpgrade,
  requestMasterKeyDownload,
} from "$lib/services/key";

export const requestLogin = async (email: string, password: string) => {
  const res = await callPostApi<LoginRequest>("/api/auth/login", { email, password });
  return res.ok;
};
