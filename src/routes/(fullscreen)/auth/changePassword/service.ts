import { useTRPC } from "$trpc/client";

export const requestPasswordChange = async (oldPassword: string, newPassword: string) => {
  const trpc = useTRPC();

  try {
    await trpc.auth.changePassword.mutate({ oldPassword, newPassword });
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};
