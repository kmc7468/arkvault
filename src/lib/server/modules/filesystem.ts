import { unlink } from "fs/promises";
import env from "$lib/server/loadenv";

export const getChunkDirectoryPath = (sessionId: string) => `${env.uploadsPath}/${sessionId}`;

export const safeUnlink = async (path: string | null | undefined) => {
  if (path) {
    await unlink(path).catch(console.error);
  }
};
