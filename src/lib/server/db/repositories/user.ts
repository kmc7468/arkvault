import type { Selectable } from "kysely";
import type { Executor } from "../executor.ts";
import type { UserTable } from "../schema/index.ts";

interface User {
  id: number;
  email: string;
  nickname: string;
  password: string;
}

const toUser = (row: Selectable<UserTable>): User => ({
  id: row.id,
  email: row.email,
  nickname: row.nickname,
  password: row.password,
});

export const getUser = async (executor: Executor, userId: number) => {
  const user = await executor
    .selectFrom("user")
    .selectAll()
    .where("id", "=", userId)
    .limit(1)
    .executeTakeFirst();
  return user ? toUser(user) : null;
};

export const getUserByEmail = async (executor: Executor, email: string) => {
  const user = await executor
    .selectFrom("user")
    .selectAll()
    .where("email", "=", email)
    .limit(1)
    .executeTakeFirst();
  return user ? toUser(user) : null;
};

export const setUserPassword = async (executor: Executor, userId: number, password: string) => {
  await executor.updateTable("user").set({ password }).where("id", "=", userId).execute();
};
