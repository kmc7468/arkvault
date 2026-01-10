import ms from "ms";
import { building } from "$app/environment";
import { env } from "$env/dynamic/private";

if (!building) {
  if (!env.DATABASE_PASSWORD) throw new Error("DATABASE_PASSWORD not set");
  if (!env.SESSION_SECRET) throw new Error("SESSION_SECRET not set");
}

export default {
  nodeEnv: env.NODE_ENV || "development",
  database: {
    host: env.DATABASE_HOST,
    port: env.DATABASE_PORT ? parseInt(env.DATABASE_PORT, 10) : undefined,
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD!,
    name: env.DATABASE_NAME,
  },
  session: {
    secret: env.SESSION_SECRET!,
    exp: ms(env.SESSION_EXPIRES || "14d"),
  },
  challenge: {
    userClientExp: ms(env.USER_CLIENT_CHALLENGE_EXPIRES || "5m"),
    sessionUpgradeExp: ms(env.SESSION_UPGRADE_CHALLENGE_EXPIRES || "5m"),
  },
  libraryPath: env.LIBRARY_PATH || "library",
  thumbnailsPath: env.THUMBNAILS_PATH || "thumbnails",
  uploadsPath: env.UPLOADS_PATH || "uploads",
};
