import { sequence, type ServerInit } from "@sveltejs/kit/hooks";
import schedule from "node-schedule";
import { migrateDB } from "#lib/server/db/kysely.ts";
import { authenticate, setAgentInfo } from "#lib/server/middlewares/index.ts";
import {
  AuthService,
  ClientService,
  FileDeletionService,
  UploadService,
} from "#lib/server/services/index.ts";

export const init: ServerInit = async () => {
  await migrateDB();

  schedule.scheduleJob("0 * * * *", async () => {
    // Failures are logged and retried at the next run, so they don't crash the server
    const results = await Promise.allSettled([
      AuthService.cleanupExpiredSessions(),
      ClientService.cleanupExpiredChallenges(),
      UploadService.cleanupExpiredUploadSessions(),
    ]);
    results.forEach((result) => {
      if (result.status === "rejected") console.error(result.reason);
    });
    FileDeletionService.schedulePendingFileDeletions();
  });
  FileDeletionService.schedulePendingFileDeletions();
};

export const handle = sequence(setAgentInfo, authenticate);
