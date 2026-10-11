import { UserRepo } from "#lib/server/db/index.ts";
import { AppError } from "#lib/server/errors.ts";

export const getUser = async (userId: number) => {
  const user = await UserRepo.getUser(userId);
  if (!user) {
    throw new AppError("INTERNAL_SERVER_ERROR", "Invalid session id");
  }
  return user;
};
