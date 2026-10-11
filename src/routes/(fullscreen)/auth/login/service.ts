import { trpc } from "#trpc/client.js";

export const requestLogin = async (email: string, password: string) => {
  try {
    await trpc.auth.login.mutate({ email, password });
    return true;
  } catch {
    // TODO: Error Handling
    return false;
  }
};
