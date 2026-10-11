import { UserRepo } from "#lib/server/db/index.ts";
import { invalidSessionError } from "#lib/server/errors.ts";

export const getUser = async (userId: number) => {
  const user = await UserRepo.getUser(userId);
  if (!user) {
    throw invalidSessionError();
  }
  return user;
};
