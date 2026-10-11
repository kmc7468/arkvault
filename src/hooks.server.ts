import { sequence, type ServerInit } from "@sveltejs/kit/hooks";
import schedule from "node-schedule";
import { ClientRepo, SessionRepo } from "#lib/server/db/index.js";
import { migrateDB } from "#lib/server/db/kysely.js";
import { authenticate, setAgentInfo } from "#lib/server/middlewares/index.js";
import { FileDeletionService, UploadService } from "#lib/server/services/index.js";

export const init: ServerInit = async () => {
  await migrateDB();

  schedule.scheduleJob("0 * * * *", () => {
    ClientRepo.cleanupExpiredUserClientChallenges();
    SessionRepo.cleanupExpiredSessions();
    SessionRepo.cleanupExpiredSessionUpgradeChallenges();
    UploadService.cleanupExpiredUploadSessions();
    FileDeletionService.schedulePendingFileDeletions();
  });
  FileDeletionService.schedulePendingFileDeletions();
};

export const handle = sequence(setAgentInfo, authenticate);
