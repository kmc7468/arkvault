import {
  NODE_ENV,
  DATABASE_HOST,
  DATABASE_PORT,
  DATABASE_USER,
  DATABASE_PASSWORD,
  DATABASE_NAME,
  SESSION_SECRET,
  SESSION_EXPIRES,
  USER_CLIENT_CHALLENGE_EXPIRES,
  SESSION_UPGRADE_CHALLENGE_EXPIRES,
  LIBRARY_PATH,
  THUMBNAILS_PATH,
} from "$app/env/private";

export default {
  nodeEnv: NODE_ENV,
  database: {
    host: DATABASE_HOST,
    port: DATABASE_PORT,
    user: DATABASE_USER,
    password: DATABASE_PASSWORD,
    name: DATABASE_NAME,
  },
  session: {
    secret: SESSION_SECRET,
    exp: SESSION_EXPIRES,
  },
  challenge: {
    userClientExp: USER_CLIENT_CHALLENGE_EXPIRES,
    sessionUpgradeExp: SESSION_UPGRADE_CHALLENGE_EXPIRES,
  },
  libraryPath: LIBRARY_PATH,
  thumbnailsPath: THUMBNAILS_PATH,
};
