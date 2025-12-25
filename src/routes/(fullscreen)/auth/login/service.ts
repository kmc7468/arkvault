import { useTRPC } from "$trpc/client";

export { requestLogout } from "$lib/services/auth";
export { requestDeletedFilesCleanup } from "$lib/services/file";
export {
  requestClientRegistrationAndSessionUpgrade,
  requestMasterKeyDownload,
} from "$lib/services/key";

export const requestLogin = async (email: string, password: string) => {
  const trpc = useTRPC();

  try {
    await trpc.auth.login.mutate({ email, password });
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};
