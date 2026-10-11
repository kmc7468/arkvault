import { trpc } from "#trpc/client.js";

export { requestLogout } from "#lib/services/auth.js";
export { requestDeletedFilesCleanup } from "#lib/services/file.js";
export {
  requestClientRegistrationAndSessionUpgrade,
  requestMasterKeyDownload,
} from "#lib/services/key.js";

export const requestLogin = async (email: string, password: string) => {
  try {
    await trpc.auth.login.mutate({ email, password });
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};
