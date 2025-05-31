import db from "./kysely";

interface User {
  id: number;
  email: string;
  nickname: string;
  password: string;
}

export const getUser = async (userId: number) => {
  const user = await db
    .selectFrom("user")
    .selectAll()
    .where("id", "=", userId)
    .limit(1)
    .executeTakeFirst();
  return user ? (user satisfies User) : null;
};

export const getUserByEmail = async (email: string) => {
  const user = await db
    .selectFrom("user")
    .selectAll()
    .where("email", "=", email)
    .limit(1)
    .executeTakeFirst();
  return user ? (user satisfies User) : null;
};

export const setUserNickname = async (userId: number, nickname: string) => {
  await db.updateTable("user").set({ nickname }).where("id", "=", userId).execute();
};

export const setUserPassword = async (userId: number, password: string) => {
  await db.updateTable("user").set({ password }).where("id", "=", userId).execute();
};
