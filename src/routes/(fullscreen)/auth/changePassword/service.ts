import { trpc } from "#trpc/client.js";

export const requestPasswordChange = async (oldPassword: string, newPassword: string) => {
  try {
    await trpc.auth.changePassword.mutate({ oldPassword, newPassword });
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};
