import { UserRepo, db } from "#lib/server/db/index.ts";
import { invalidSessionError } from "#lib/server/errors.ts";

export const getUser = async (userId: number) => {
  const user = await UserRepo.getUser(db, userId);
  if (!user) {
    throw invalidSessionError();
  }
  return user;
};
