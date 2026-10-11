import { trpc } from "#trpc/client.js";

export const requestLogout = async () => {
  try {
    await trpc.auth.logout.mutate();
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};
