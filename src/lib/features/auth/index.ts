import { trpc } from "#trpc/client.js";

export const login = async (email: string, password: string) => {
  await trpc.auth.login.mutate({ email, password });
};

export const logout = async () => {
  await trpc.auth.logout.mutate();
};

export const changePassword = async (oldPassword: string, newPassword: string) => {
  await trpc.auth.changePassword.mutate({ oldPassword, newPassword });
};
