import { eq } from "drizzle-orm";
import db from "./drizzle";
import { user } from "./schema";

export const getUserByEmail = async (email: string) => {
  const users = await db.select().from(user).where(eq(user.email, email)).execute();
  return users[0] ?? null;
};
