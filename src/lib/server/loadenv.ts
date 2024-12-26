import { env } from "$env/dynamic/private";

if (!env.JWT_SECRET) throw new Error("JWT_SECRET is not set");

export default {
  databaseUrl: env.DATABASE_URL || "local.db",
  jwt: {
    secret: env.JWT_SECRET,
    accessExp: env.JWT_ACCESS_TOKEN_EXPIRES || "5m",
    refreshExp: env.JWT_REFRESH_TOKEN_EXPIRES || "14d",
  },
};