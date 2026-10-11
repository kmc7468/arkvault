import { sequence, type ServerInit } from "@sveltejs/kit/hooks";
import schedule from "node-schedule";
import { cleanupExpiredUserClientChallenges } from "#lib/server/db/client.js";
import { migrateDB } from "#lib/server/db/kysely.js";
import {
  cleanupExpiredSessions,
  cleanupExpiredSessionUpgradeChallenges,
} from "#lib/server/db/session.js";
import { authenticate, setAgentInfo } from "#lib/server/middlewares/index.js";
import { cleanupExpiredUploadSessions } from "#lib/server/services/upload.js";

export const init: ServerInit = async () => {
  await migrateDB();

  schedule.scheduleJob("0 * * * *", () => {
    cleanupExpiredUserClientChallenges();
    cleanupExpiredSessions();
    cleanupExpiredSessionUpgradeChallenges();
    cleanupExpiredUploadSessions();
  });
};

export const handle = sequence(setAgentInfo, authenticate);
