import { trpc } from "$trpc/client";

export { requestLogout } from "$lib/services/auth";
export { requestDeletedFilesCleanup } from "$lib/services/file";
export {
  requestClientRegistrationAndSessionUpgrade,
  requestMasterKeyDownload,
} from "$lib/services/key";

export const requestLogin = async (email: string, password: string) => {
  try {
    await trpc().auth.login.mutate({ email, password });
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};
